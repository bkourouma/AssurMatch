import type { RetentionSubjectKind } from "../../../../packages/shared/contracts/data-retention.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { DocumentStoragePort } from "../quote-documents/document-storage.port";
import { DataRetentionAuditActions } from "./data-retention-audit-actions";
import type { AnonymizationBatchRecord, RetentionCounts, RetentionSubjectCount } from "./data-retention.repository";
import type { AnonymizationStamp, RetentionSubjectsRepository } from "./retention-subjects.repository";

/** The broker inbox (`MessagingDispatchService` satisfies it). */
export interface RetentionInAppPort {
  publishInApp(request: { scopeId: string; template: string; title?: string; body: string; targetType?: string; targetId?: string }): Promise<unknown>;
}

/**
 * Documents first (their files are deleted), then quote requests (whose cascade then finds no live
 * document), then orphan prospects, then the self-contained rows.
 */
const EXECUTION_ORDER: readonly RetentionSubjectKind[] = [
  "quote_documents",
  "quote_requests",
  "prospects",
  "contact_messages",
  "partner_applications",
  "waitlist",
  "ai_traces",
  "webhook_payloads",
  "messaging_references"
];

const NOTICE_REFERENCE_LIMIT = 20;

export interface AnonymizationDeps {
  audit: AuditLogWriter;
  subjects: RetentionSubjectsRepository;
  storage: DocumentStoragePort;
  inApp?: RetentionInAppPort | undefined;
}

/** Per subject kind, the ids still eligible at approval time (D2 re-check); the rest is skipped. */
export type EligibleTargets = Partial<Record<RetentionSubjectKind, ReadonlySet<string>>>;

interface TenantNotice {
  publicReferences: string[];
}

/**
 * D4/D5/FR-008: applies the anonymization of an approved batch. Every writer is idempotent (a row
 * that already carries `anonymizedAt`, or the marker, is left alone and counted as skipped). A
 * failure on one subject is audited and counted, never propagated: the rest of the batch proceeds
 * and the failed row stays eligible for a later batch.
 */
export class AnonymizationService {
  constructor(private readonly deps: AnonymizationDeps) {}

  /**
   * `counts` is filled as the execution progresses (one entry per subject kind, updated per row), so
   * the caller still knows what was done if the execution stops midway.
   */
  async execute(batch: AnonymizationBatchRecord, eligible: EligibleTargets, actor: ActorContext, now = new Date(), counts: RetentionCounts = {}): Promise<RetentionCounts> {
    const stamp: AnonymizationStamp = { batchId: batch.id, now };
    const notices = new Map<string, TenantNotice>();
    for (const kind of EXECUTION_ORDER) {
      const ids = batch.targets[kind];
      if (!ids) continue;
      const previous = batch.counts[kind];
      const count: RetentionSubjectCount = { selected: ids.length, anonymized: 0, skipped: 0, failed: 0, moreRemaining: previous?.moreRemaining ?? false };
      counts[kind] = count;
      const stillEligible = eligible[kind];
      for (const id of ids) {
        if (stillEligible && !stillEligible.has(id)) {
          count.skipped += 1;
          continue;
        }
        try {
          const changed = await this.anonymize(kind, id, stamp, notices);
          if (changed) count.anonymized += 1;
          else count.skipped += 1;
        } catch (error) {
          count.failed += 1;
          this.deps.audit.write({
            actor,
            action: DataRetentionAuditActions.categoryAnonymized,
            targetType: "AnonymizationBatch",
            targetId: batch.id,
            scope: { kind: batch.kind, countryId: batch.countryId },
            result: "failed",
            reason: "subject_anonymization_failed",
            context: { subject: kind, subjectId: id, error: error instanceof Error ? error.name : "unknown" }
          });
        }
      }
      this.deps.audit.write({
        actor,
        action: DataRetentionAuditActions.categoryAnonymized,
        targetType: "AnonymizationBatch",
        targetId: batch.id,
        scope: { kind: batch.kind, countryId: batch.countryId },
        result: count.failed > 0 ? "failed" : "success",
        context: { subject: kind, selected: count.selected, anonymized: count.anonymized, skipped: count.skipped, failed: count.failed }
      });
    }
    await this.notifyTenants(batch, notices, actor);
    return counts;
  }

  private async anonymize(kind: RetentionSubjectKind, id: string, stamp: AnonymizationStamp, notices: Map<string, TenantNotice>): Promise<boolean> {
    const subjects = this.deps.subjects;
    switch (kind) {
      case "quote_documents": {
        const document = await subjects.findLiveDocument(id);
        if (!document) return false;
        // The file goes first: if its deletion fails the row stays un-anonymized and eligible again.
        await this.deps.storage.delete(document.storageKey);
        return subjects.anonymizeDocumentRow(id, stamp);
      }
      case "quote_requests":
        return this.anonymizeQuoteRequest(id, stamp, notices);
      case "prospects":
        // Security review M3: a prospect frozen as an orphan that has since received a request
        // (not part of this batch) is still in use: it is skipped, not anonymized.
        if (await subjects.prospectHasLiveQuotes(id)) return false;
        return subjects.anonymizeProspect(id, stamp);
      case "contact_messages":
        return subjects.anonymizeContactMessage(id, stamp);
      case "partner_applications":
        return subjects.anonymizePartnerApplication(id, stamp);
      case "waitlist":
        return subjects.anonymizeWaitlistEntry(id, stamp);
      case "ai_traces":
        return subjects.anonymizeAiInteraction(id);
      case "webhook_payloads":
        return subjects.anonymizeWebhookPayload(id);
      case "messaging_references":
        return subjects.anonymizeMessagingReference(id);
    }
  }

  /**
   * D4: the request, what brokers wrote on its leads, its AI outputs and its documents; then the
   * prospect once none of its requests remains readable. Status, routing decision and assignments
   * are kept, and nothing is re-routed, re-notified or re-transmitted.
   */
  private async anonymizeQuoteRequest(id: string, stamp: AnonymizationStamp, notices: Map<string, TenantNotice>): Promise<boolean> {
    const subjects = this.deps.subjects;
    const cascade = await subjects.loadQuoteCascade(id);
    if (!cascade) return false;
    for (const document of cascade.documents) {
      await this.deps.storage.delete(document.storageKey);
      await subjects.anonymizeDocumentRow(document.id, stamp);
    }
    const assignmentIds = cascade.assignments.map((assignment) => assignment.id);
    await subjects.anonymizeLeadContent(assignmentIds);
    await subjects.anonymizeQuoteAi(id, assignmentIds);
    const changed = await subjects.anonymizeQuoteRequestRow(id, stamp);
    if (!changed) return false;
    if (!await subjects.prospectHasLiveQuotes(cascade.prospectId)) await subjects.anonymizeProspect(cascade.prospectId, stamp);
    for (const partnerTenantId of new Set(cascade.assignments.map((assignment) => assignment.partnerTenantId))) {
      const notice = notices.get(partnerTenantId) ?? { publicReferences: [] };
      notice.publicReferences.push(cascade.publicReference);
      notices.set(partnerTenantId, notice);
    }
    return true;
  }

  /** D4: one in-app notice per partner tenant per batch. It names requests, never the visitor. */
  private async notifyTenants(batch: AnonymizationBatchRecord, notices: Map<string, TenantNotice>, actor: ActorContext): Promise<void> {
    if (!this.deps.inApp) return;
    for (const [partnerTenantId, notice] of notices) {
      const shown = notice.publicReferences.slice(0, NOTICE_REFERENCE_LIMIT);
      const more = notice.publicReferences.length - shown.length;
      const count = notice.publicReferences.length;
      try {
        await this.deps.inApp.publishInApp({
          scopeId: partnerTenantId,
          template: "lead_data_anonymized",
          title: "Donnees personnelles anonymisees",
          body: `Les donnees personnelles de ${count} demande${count > 1 ? "s" : ""} (${shown.join(", ")}${more > 0 ? ` et ${more} autre${more > 1 ? "s" : ""}` : ""}) ont ete anonymisees selon la politique de conservation de la plateforme. Les statuts, historiques et montants sont conserves.`,
          targetType: "AnonymizationBatch",
          targetId: batch.id
        });
      } catch (error) {
        this.deps.audit.write({
          actor,
          action: DataRetentionAuditActions.batchExecuted,
          targetType: "AnonymizationBatch",
          targetId: batch.id,
          scope: { partnerTenantId },
          result: "failed",
          reason: "broker_notice_failed",
          context: { error: error instanceof Error ? error.name : "unknown" }
        });
      }
    }
  }
}
