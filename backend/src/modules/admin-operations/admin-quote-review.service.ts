import type {
  AdminPage,
  AdminQuoteReviewDecision,
  AdminQuoteReviewQueueItem,
  AdminQuoteReviewResult
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { adminQuoteReviewDecisionSchema } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { RoutingDecisionRecord } from "../leads/routing-decision.service";
import { isManualReviewOpen, type QuoteRequestRecord, type QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import { OPERATIONS_ROLES, paginate, type AdminOperationsAccess } from "./admin-operations-access";
import { loadOperationsCatalog, type OperationsCatalogPorts } from "./admin-operations-catalog";
import { scopeOf, toListItem } from "./admin-quote-requests-console.service";

export interface AdminQuoteReviewDeps extends OperationsCatalogPorts {
  audit: AuditLogWriter;
  access: AdminOperationsAccess;
  submissions: Pick<QuoteSubmissionService, "findById" | "findByPublicReference" | "listOpenForReview" | "assignManually" | "routeAfterReview" | "closeReview" | "notifyVisitorOfReviewOutcome">;
  consent: { findRecord(id: string): Promise<{ status?: string | undefined } | undefined> };
  decisions: { record(input: Omit<RoutingDecisionRecord, "id" | "createdAt">, actor: ActorContext): Promise<RoutingDecisionRecord> };
  eligibility: { candidates(countryId: string, productId: string): Promise<Array<{ partner: { id: string; legalName: string; plan: string }; eligible: boolean; reasons: string[] }>> };
  assignments: { list(): Promise<LeadAssignmentRecord[]>; require(id: string): Promise<LeadAssignmentRecord> };
  /** Post-assignment hook: shares visitor documents uploaded while the request was held. */
  afterAssign?: (quoteRequestId: string, assignment: LeadAssignmentRecord) => Promise<void>;
}

const READ_REQUIREMENT = { roles: OPERATIONS_ROLES, permissions: ["quote_requests:read"] };
/** Transmitting a lead is a routing act: the permission manual routing already requires. */
const TRANSMIT_REQUIREMENT = { roles: OPERATIONS_ROLES, permissions: ["lead_assignments:update"] };
/** Closing without transmission: request owners (compliance) or routing operators (country admin). */
const CLOSE_REQUIREMENT = { roles: OPERATIONS_ROLES, permissions: ["quote_requests:update", "lead_assignments:update"] };

/** H-02: persisted, audited manual review of requests held by a forced review or a manual rule. */
export class AdminQuoteReviewService {
  constructor(private readonly deps: AdminQuoteReviewDeps) {}

  async queue(actor: ActorContext, page = 1, pageSize = 50): Promise<AdminPage<AdminQuoteReviewQueueItem>> {
    this.deps.access.assert(actor, READ_REQUIREMENT, { type: "QuoteReviewQueue", id: "open" });
    const catalog = await loadOperationsCatalog(this.deps);
    const open = (await this.deps.submissions.listOpenForReview())
      .filter((quote) => this.deps.access.inScope(actor, scopeOf(quote, catalog)))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const window = paginate(open, page, pageSize);
    const items: AdminQuoteReviewQueueItem[] = [];
    for (const quote of window.items) {
      const candidates = await this.deps.eligibility.candidates(quote.countryId, quote.productId).catch(() => []);
      items.push({
        ...toListItem(quote, catalog, 0),
        manualReviewReason: quote.manualReviewReason ?? null,
        candidates: candidates.map((candidate) => ({
          partnerTenantId: candidate.partner.id,
          legalName: candidate.partner.legalName,
          plan: candidate.partner.plan,
          eligible: candidate.eligible,
          reasons: candidate.reasons
        }))
      });
    }
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteReviewQueueRead,
      targetType: "QuoteReviewQueue",
      targetId: "open",
      result: "success",
      context: { total: window.total }
    });
    return { ...window, items };
  }

  async decide(actor: ActorContext, quoteRequestId: string, input: unknown): Promise<AdminQuoteReviewResult> {
    const decision = adminQuoteReviewDecisionSchema.parse(input);
    const target = { type: "QuoteRequest", id: quoteRequestId };
    const refused = ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteReviewRefused;
    this.deps.access.assert(actor, decision.decision === "route" || decision.decision === "assign" ? TRANSMIT_REQUIREMENT : CLOSE_REQUIREMENT, target, refused);
    const quote = await this.deps.submissions.findById(quoteRequestId);
    if (!quote) throw new Error("Quote request not found");
    const catalog = await loadOperationsCatalog(this.deps);
    this.deps.access.assertInScope(actor, scopeOf(quote, catalog), target, refused);
    if (!isManualReviewOpen(quote)) {
      this.auditRefusal(actor, quote, decision, "quote_not_reviewable");
      throw new Error("Manual review conflict: quote_not_reviewable");
    }

    const previous = { status: quote.status, routingStatus: quote.routingStatus };
    try {
      const outcome = await this.apply(actor, quote, decision);
      const visitorNotified = await this.deps.submissions.notifyVisitorOfReviewOutcome(outcome.quote, actor);
      this.deps.audit.write({
        actor,
        action: ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteReviewDecided,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId, ...(decision.decision === "assign" ? { partnerTenantId: decision.partnerTenantId } : {}) },
        result: "success",
        reason: decision.reason,
        context: {
          decision: decision.decision,
          previousStatus: previous.status,
          previousRoutingStatus: previous.routingStatus,
          status: outcome.quote.status,
          routingStatus: outcome.quote.routingStatus,
          assignmentCount: outcome.assignmentIds.length,
          visitorNotified
        }
      });
      return {
        quoteRequestId: quote.id,
        decision: decision.decision,
        status: outcome.quote.status,
        routingStatus: outcome.quote.routingStatus,
        assignmentIds: outcome.assignmentIds,
        reviewedAt: (outcome.quote.reviewedAt ?? new Date()).toISOString()
      };
    } catch (error) {
      if (!(error instanceof ReviewRefusal)) {
        this.auditRefusal(actor, quote, decision, error instanceof Error ? error.message.slice(0, 200) : "review_failed");
      }
      throw error;
    }
  }

  private async apply(actor: ActorContext, quote: QuoteRequestRecord, decision: AdminQuoteReviewDecision): Promise<{ quote: QuoteRequestRecord; assignmentIds: string[] }> {
    const stamp = { reason: decision.reason };
    switch (decision.decision) {
      case "route": {
        await this.assertConsentValid(actor, quote, decision);
        const outcome = await this.deps.submissions.routeAfterReview(quote.id, actor, stamp);
        for (const assignmentId of outcome.assignmentIds) await this.shareDocuments(quote.id, assignmentId);
        return outcome;
      }
      case "assign": {
        await this.assertConsentValid(actor, quote, decision);
        const result = await this.deps.submissions.assignManually(quote.id, decision.partnerTenantId, actor, decision.reason);
        await this.shareDocuments(quote.id, result.assignmentId);
        const updated = await this.deps.submissions.findById(quote.id);
        return { quote: updated ?? quote, assignmentIds: [result.assignmentId] };
      }
      case "non_routable": {
        await this.recordBlockedDecision(actor, quote, "admin_review_non_routable");
        return { quote: await this.deps.submissions.closeReview(quote.id, { kind: "non_routable" }, actor, stamp), assignmentIds: [] };
      }
      case "duplicate": {
        const original = decision.duplicateOfReference ? await this.deps.submissions.findByPublicReference(decision.duplicateOfReference) : undefined;
        if (decision.duplicateOfReference && !original) {
          this.auditRefusal(actor, quote, decision, "duplicate_reference_not_found");
          throw new ReviewRefusal("Duplicate reference not found");
        }
        if (original?.id === quote.id) {
          this.auditRefusal(actor, quote, decision, "duplicate_of_itself");
          throw new ReviewRefusal("Invalid duplicate reference: duplicate_of_itself");
        }
        await this.recordBlockedDecision(actor, quote, "admin_review_duplicate");
        return {
          quote: await this.deps.submissions.closeReview(quote.id, { kind: "duplicate", duplicateOfQuoteRequestId: original?.id }, actor, stamp),
          assignmentIds: []
        };
      }
    }
  }

  /** SC-09: no transmission without a granted lead-transmission consent; the refusal is audited. */
  private async assertConsentValid(actor: ActorContext, quote: QuoteRequestRecord, decision: AdminQuoteReviewDecision): Promise<void> {
    const consent = quote.consentRecordId ? await this.deps.consent.findRecord(quote.consentRecordId).catch(() => undefined) : undefined;
    if (consent?.status === "granted") return;
    this.auditRefusal(actor, quote, decision, consent ? `consent_${consent.status ?? "unknown"}` : "consent_missing");
    throw new ReviewRefusal("Consent missing or withdrawn: lead cannot be transmitted");
  }

  /** Principle VII: a refusal to route is a routing decision too, journalled like the engine's own. */
  private async recordBlockedDecision(actor: ActorContext, quote: QuoteRequestRecord, reason: string): Promise<void> {
    await this.deps.decisions.record({
      quoteRequestId: quote.id,
      result: "blocked",
      candidateCount: 0,
      excludedCandidates: [],
      reasons: [reason],
      ...(quote.correlationId ? { correlationId: quote.correlationId } : {})
    }, actor);
  }

  private async shareDocuments(quoteRequestId: string, assignmentId: string): Promise<void> {
    if (!this.deps.afterAssign) return;
    const assignment = await this.deps.assignments.require(assignmentId).catch(() => undefined);
    if (assignment) await this.deps.afterAssign(quoteRequestId, assignment).catch(() => undefined);
  }

  private auditRefusal(actor: ActorContext, quote: QuoteRequestRecord, decision: AdminQuoteReviewDecision, reason: string): void {
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteReviewRefused,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "refused",
      reason,
      context: { decision: decision.decision, status: quote.status, routingStatus: quote.routingStatus }
    });
  }
}

/** A refusal already audited by the review service (not re-audited by the generic catch). */
class ReviewRefusal extends Error {}
