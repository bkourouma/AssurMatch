import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { LEAD_DOCUMENT_MAX_BYTES, LEAD_DOCUMENT_MIME_TYPES, leadDocumentUploadSchema } from "../../../../packages/shared/contracts/lead-proposals";
import type { BrokerCrmDocument } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { LeadProposalAuditActions } from "../audit-logs/lead-proposal-audit-actions";
import type { ActorContext } from "../common/types";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerCrmHistoryService } from "../leads/broker-crm-history.service";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import { assertBrokerTenantWritable } from "../partners/partner-tenant-status.service";
import { storeScannedFile, type ScannedUploadDeps, type UploadedLeadFile } from "./scanned-upload";
import type { ProposalFile } from "./lead-proposals.service";

export interface LeadDocumentsServiceDeps {
  audit: AuditLogWriter;
  assignments: LeadAssignmentService;
  crmAccess: BrokerCrmAccessPolicy;
  crmHistory: BrokerCrmHistoryService;
  crmActivity: CrmActivityRepository;
  upload: ScannedUploadDeps;
}

/**
 * Spec 055 FR-010: internal documents of a CRM lead become real files (PDF or image, 5 MB, scanned
 * synchronously). They stay internal: no visitor route reads them, and only a clean file of the
 * caller's own lead is ever served, to its broker session, with an audit entry.
 */
export class LeadDocumentsService {
  constructor(private readonly deps: LeadDocumentsServiceDeps) {}

  async upload(leadId: string, file: UploadedLeadFile | undefined, input: unknown, actor: ActorContext): Promise<BrokerCrmDocument> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.deps.crmAccess.assertMutation(actor, assignment);
    const parsed = leadDocumentUploadSchema.parse(input);
    const stored = await storeScannedFile(this.deps.upload, file, { allowedMimeTypes: LEAD_DOCUMENT_MIME_TYPES, maxBytes: LEAD_DOCUMENT_MAX_BYTES, keyPrefix: "ld" });
    if (!stored.ok) {
      const quarantined = stored.refusal === "infected" || stored.refusal === "scan_failed";
      this.deps.audit.write({
        actor,
        action: quarantined ? LeadProposalAuditActions.leadDocumentQuarantined : LeadProposalAuditActions.leadDocumentUploadRefused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId },
        result: quarantined && stored.refusal === "infected" ? "success" : "refused",
        reason: stored.signature ?? stored.refusal,
        context: { verdict: stored.refusal, ...(stored.engine ? { engine: stored.engine } : {}) }
      });
      const code = quarantined ? ErrorCodes.DOCUMENT_QUARANTINED : stored.refusal === "storage_not_configured" ? ErrorCodes.DOCUMENT_STORAGE_NOT_CONFIGURED : ErrorCodes.DOCUMENT_INVALID;
      throw new UnprocessableEntityException({ code, message: `Document refused: ${stored.refusal}` });
    }
    const document: BrokerCrmDocument & { partnerTenantId: string; uploadedById?: string } = {
      id: crypto.randomUUID(),
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      label: parsed.label,
      storageKey: stored.file.storageKey,
      visibility: "internal",
      fileName: stored.file.fileName,
      mimeType: stored.file.mimeType,
      sizeBytes: stored.file.sizeBytes,
      scanStatus: "clean",
      ...(actor.actorId ? { uploadedById: actor.actorId } : {}),
      createdAt: new Date().toISOString()
    };
    await this.deps.crmActivity.addDocument({ ...document, checksum: stored.file.checksum, scanEngine: stored.file.scanEngine, scannedAt: stored.file.scannedAt } as BrokerCrmDocument);
    await this.deps.crmHistory.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType: "document_added" });
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.leadDocumentUploaded,
      targetType: "BrokerCrmDocument",
      targetId: document.id,
      scope: { partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id },
      result: "success",
      context: { mimeType: document.mimeType, sizeBytes: document.sizeBytes, storageReference: this.deps.upload.storage.reference(document.storageKey) }
    });
    return {
      id: document.id,
      leadAssignmentId: document.leadAssignmentId,
      label: document.label,
      storageKey: document.storageKey,
      visibility: document.visibility,
      ...(document.fileName ? { fileName: document.fileName } : {}),
      ...(document.mimeType ? { mimeType: document.mimeType } : {}),
      ...(document.sizeBytes !== undefined ? { sizeBytes: document.sizeBytes } : {}),
      scanStatus: "clean",
      createdAt: document.createdAt
    };
  }

  async download(leadId: string, documentId: string, actor: ActorContext): Promise<ProposalFile> {
    const assignment = await this.deps.assignments.require(leadId);
    this.deps.crmAccess.assertLeadRead(actor, assignment);
    const document = (await this.deps.crmActivity.documentsForLead(assignment.id)).find((candidate) => candidate.id === documentId) as (BrokerCrmDocument & { partnerTenantId?: string }) | undefined;
    const refuse = (reason: string): never => {
      this.deps.audit.write({
        actor,
        action: LeadProposalAuditActions.leadDocumentDownloadRefused,
        targetType: "BrokerCrmDocument",
        targetId: documentId,
        scope: { partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id },
        result: "refused",
        reason,
        context: {}
      });
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Lead document not found" });
    };
    if (!document || (document.partnerTenantId && document.partnerTenantId !== assignment.partnerTenantId)) return refuse("document_not_found");
    if (document.scanStatus !== "clean") return refuse("document_not_clean");
    const bytes = await this.deps.upload.storage.get(document.storageKey);
    if (!bytes) return refuse("storage_missing");
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.leadDocumentDownloaded,
      targetType: "BrokerCrmDocument",
      targetId: document.id,
      scope: { partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id },
      result: "success",
      context: {}
    });
    return { bytes, fileName: document.fileName ?? "document", mimeType: document.mimeType ?? "application/octet-stream" };
  }
}
