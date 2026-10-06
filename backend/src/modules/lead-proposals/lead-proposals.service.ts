import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import {
  LEAD_PROPOSAL_DOCUMENT_MAX_BYTES,
  LEAD_PROPOSAL_DOCUMENT_MIME_TYPES,
  LEAD_PROPOSAL_MAX_ACTIVE,
  LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE,
  leadProposalCreateSchema,
  leadProposalWithdrawSchema,
  visitorProposalResponseCreateSchema,
  type BrokerLeadProposal,
  type BrokerLeadProposalList,
  type LeadProposalBlocker,
  type LeadProposalStatus,
  type PublicLeadProposal,
  type PublicProposalStatus,
  type VisitorProposalResponseResult
} from "../../../../packages/shared/contracts/lead-proposals";
import type { BrokerCrmPipelineStatus } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { LeadProposalAuditActions } from "../audit-logs/lead-proposal-audit-actions";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerCrmHistoryService } from "../leads/broker-crm-history.service";
import type { BrokerCrmPipelineService } from "../leads/broker-crm-pipeline.service";
import type { BrokerStarterAccessPolicy } from "../leads/broker-starter-access-policy";
import type { BrokerStarterHistoryService } from "../leads/broker-starter-history.service";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import { assertBrokerTenantWritable } from "../partners/partner-tenant-status.service";
import { visitorAccessDenied } from "../quote-requests/quote-submission.service";
import { MemoryLeadProposalsRepository, type LeadProposalChannel, type LeadProposalRecord, type LeadProposalsRepository, type VisitorProposalResponseRecord } from "./lead-proposals.repository";
import { storeScannedFile, type ScannedUploadDeps, type UploadedLeadFile } from "./scanned-upload";

/** The request as this service needs it (`QuoteRequestRecord` satisfies it). */
export interface ProposalQuote {
  id: string;
  publicReference: string;
  status: string;
  refusalReason?: string | undefined;
  anonymizedAt?: Date | string | null | undefined;
  language?: string | undefined;
}

export interface ProposalNotificationsPort {
  queueVisitorEvent(quote: Pick<ProposalQuote, "id" | "publicReference">, event: { type: "visitor_proposal_available"; assignmentId: string; partnerTenantId: string; seq: string }, actor: ActorContext): Promise<unknown>;
  queueBrokerVisitorResponse(quote: Pick<ProposalQuote, "id" | "publicReference">, event: { assignmentId: string; partnerTenantId: string; proposalId: string; responseId: string; responseType: string }, actor: ActorContext): Promise<unknown>;
}

export interface LeadProposalsServiceDeps {
  audit: AuditLogWriter;
  repository?: LeadProposalsRepository | undefined;
  assignments: LeadAssignmentService;
  crmAccess: BrokerCrmAccessPolicy;
  starterAccess: BrokerStarterAccessPolicy;
  crmPipeline: BrokerCrmPipelineService;
  crmHistory: BrokerCrmHistoryService;
  /** Lead history shared by Starter and CRM (`LeadActionHistory`). */
  leadHistory: BrokerStarterHistoryService;
  upload: ScannedUploadDeps;
  quotes: { findById(id: string): Promise<ProposalQuote | undefined> };
  partnerName: (partnerTenantId: string) => Promise<string>;
  notifications?: ProposalNotificationsPort | undefined;
  /** Spec 054 token verification of every visitor route. */
  visitorAccess?: { verify(publicReference: string, token: string, actor?: ActorContext): Promise<{ quote: ProposalQuote } | undefined> } | undefined;
  abuseGuard?: PublicAbuseGuardService | undefined;
  redis?: RedisClientPort | undefined;
  now?: () => Date;
}

export interface ProposalFile {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}

const SYSTEM_VISITOR: ActorContext = { actorId: "visitor", roles: [] };
const ACCEPTED_ASSIGNMENT = new Set(["accepted", "received", "contacted"]);
const CLOSED_ASSIGNMENT = new Set(["closed", "rejected", "disputed"]);
const CLOSED_CRM = new Set(["gagne", "perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"]);
/** Open CRM statuses in pipeline order; FR-011 moves a less advanced lead to `devis_envoye`. */
const CRM_ORDER: BrokerCrmPipelineStatus[] = ["nouveau", "accepte", "contact_tente", "contacte", "qualifie", "documents_demandes", "devis_en_preparation", "devis_envoye", "negociation"];
/** FR-007: what the portal suggests (never applies) after a visitor response. */
const SUGGESTED_STATUS: Record<string, BrokerCrmPipelineStatus> = { interested: "negociation", question: "negociation", declined: "perdu" };
const RESPONSE_LIMIT_PER_IP = 10;
const RESPONSE_LIMIT_PER_PROPOSAL = 5;
const DOCUMENT_LIMIT_PER_IP = 60;
const VISITOR_WINDOW_SECONDS = 3600;

type LeadState = "accepted" | "not_accepted" | "closed";

function crmStatusOf(assignment: LeadAssignmentRecord): BrokerCrmPipelineStatus {
  if (assignment.crmStatus) return assignment.crmStatus;
  if (assignment.status === "accepted" || assignment.status === "received") return "accepte";
  if (assignment.status === "contacted") return "contacte";
  if (assignment.status === "rejected" || assignment.status === "disputed") return "rejete_conteste";
  return "nouveau";
}

function leadState(assignment: LeadAssignmentRecord): LeadState {
  if (CLOSED_ASSIGNMENT.has(assignment.status)) return "closed";
  if (assignment.crmStatus && CLOSED_CRM.has(assignment.crmStatus)) return "closed";
  if (ACCEPTED_ASSIGNMENT.has(assignment.status)) return "accepted";
  if (assignment.crmStatus && assignment.crmStatus !== "nouveau") return "accepted";
  return "not_accepted";
}

function consentWithdrawn(quote: ProposalQuote | undefined): boolean {
  return !quote || quote.status === "cancelled" || Boolean(quote.anonymizedAt);
}

function locale(quote: ProposalQuote): "fr" | "en" {
  return quote.language === "en" ? "en" : "fr";
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function unprocessable(code: string, message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message });
}

/**
 * Spec 055: the broker's proposal to the visitor and the visitor's follow-up.
 *
 * - Starter ("Répondre au visiteur") and CRM share this service; the channel only selects the
 *   access policy and whether the CRM pipeline moves (FR-009, FR-011).
 * - A proposal is immutable once sent: withdraw it and send a new one (FR-003).
 * - A broker only ever sees its own proposals, even on an assignment that was reassigned to it.
 * - The visitor's response never changes the CRM status; the portal only suggests one (FR-007).
 */
export class LeadProposalsService {
  private readonly repository: LeadProposalsRepository;

  constructor(private readonly deps: LeadProposalsServiceDeps) {
    this.repository = deps.repository ?? new MemoryLeadProposalsRepository();
  }

  // ---------------------------------------------------------------------------------------------
  // Broker side
  // ---------------------------------------------------------------------------------------------

  async listForBroker(channel: LeadProposalChannel, leadId: string, actor: ActorContext): Promise<BrokerLeadProposalList> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const own = await this.ownProposals(assignment);
    const responses = await this.repository.responsesForProposals(own.map((proposal) => proposal.id));
    const now = this.now();
    const activeCount = own.filter((proposal) => this.isActive(proposal, now)).length;
    const quote = await this.deps.quotes.findById(assignment.quoteRequestId).catch(() => undefined);
    const blockers = this.blockers(assignment, quote, activeCount);
    const latest = responses.at(-1);
    const suggested = channel === "crm" && latest ? this.suggest(assignment, latest.type) : undefined;
    return {
      items: own.map((proposal) => this.toBroker(proposal, responses.filter((response) => response.proposalId === proposal.id), now)),
      activeCount,
      maxActive: LEAD_PROPOSAL_MAX_ACTIVE,
      canSend: blockers.length === 0,
      blockers,
      ...(suggested ? { suggestedNextStatus: suggested } : {})
    };
  }

  /** FR-002: create and send in one step (a proposal is never stored as an editable draft). */
  async send(channel: LeadProposalChannel, leadId: string, input: unknown, file: UploadedLeadFile | undefined, actor: ActorContext): Promise<BrokerLeadProposal> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertMutation(channel, actor, assignment);
    const refuse = (code: string, reason: string, error: Error, context: Record<string, unknown> = {}): never => {
      this.deps.audit.write({
        actor,
        action: LeadProposalAuditActions.sendRefused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
        result: "refused",
        reason,
        context: { channel, code, ...context }
      });
      throw error;
    };

    const state = leadState(assignment);
    if (state === "closed") refuse(ErrorCodes.LEAD_CLOSED, "lead_closed", conflict(ErrorCodes.LEAD_CLOSED, "Lead closed: no proposal can be sent"));
    if (state === "not_accepted") refuse(ErrorCodes.LEAD_NOT_ACCEPTED, "lead_not_accepted", conflict(ErrorCodes.LEAD_NOT_ACCEPTED, "Lead must be accepted before a proposal is sent"));
    const quote = await this.deps.quotes.findById(assignment.quoteRequestId).catch(() => undefined);
    if (!quote || consentWithdrawn(quote)) {
      refuse(ErrorCodes.LEAD_CONSENT_WITHDRAWN, "consent_withdrawn", unprocessable(ErrorCodes.LEAD_CONSENT_WITHDRAWN, "Proposal refused: the visitor's consent is no longer active"));
    }
    const activeQuote = quote as ProposalQuote;

    const parsed = leadProposalCreateSchema.parse(input);
    const wording = findForbiddenWordingAnyLanguage([parsed.message, ...parsed.guarantees].join("\n"));
    if (wording.length > 0) {
      refuse(ErrorCodes.FORBIDDEN_WORDING, "forbidden_wording", unprocessable(ErrorCodes.FORBIDDEN_WORDING, `Proposal refused: forbidden regulated wording (${wording.join(", ")})`), { wording });
    }
    const now = this.now();
    const own = await this.ownProposals(assignment);
    const activeCount = own.filter((proposal) => this.isActive(proposal, now)).length;
    if (activeCount >= LEAD_PROPOSAL_MAX_ACTIVE) {
      refuse(ErrorCodes.PROPOSAL_LIMIT_REACHED, "active_limit_reached", conflict(ErrorCodes.PROPOSAL_LIMIT_REACHED, `At most ${LEAD_PROPOSAL_MAX_ACTIVE} active proposals per lead`), { activeCount });
    }

    let document: LeadProposalRecord["document"];
    if (file) {
      const stored = await storeScannedFile(this.deps.upload, file, { allowedMimeTypes: LEAD_PROPOSAL_DOCUMENT_MIME_TYPES, maxBytes: LEAD_PROPOSAL_DOCUMENT_MAX_BYTES, keyPrefix: "lp" });
      if (!stored.ok) {
        if (stored.refusal === "infected" || stored.refusal === "scan_failed") {
          this.deps.audit.write({
            actor,
            action: LeadProposalAuditActions.documentQuarantined,
            targetType: "LeadAssignment",
            targetId: assignment.id,
            scope: { partnerTenantId: assignment.partnerTenantId },
            result: stored.refusal === "infected" ? "success" : "failed",
            reason: stored.signature ?? stored.refusal,
            context: { engine: stored.engine, verdict: stored.refusal }
          });
          refuse(ErrorCodes.DOCUMENT_QUARANTINED, stored.refusal, unprocessable(ErrorCodes.DOCUMENT_QUARANTINED, `Proposal refused: the document did not pass the antivirus (${stored.refusal})`));
        }
        const code = stored.refusal === "storage_not_configured" ? ErrorCodes.DOCUMENT_STORAGE_NOT_CONFIGURED : ErrorCodes.DOCUMENT_INVALID;
        refuse(code, stored.refusal, unprocessable(code, `Proposal refused: document ${stored.refusal}`));
      } else {
        document = stored.file;
      }
    }

    const proposal = await this.repository.create({
      id: crypto.randomUUID(),
      leadAssignmentId: assignment.id,
      quoteRequestId: assignment.quoteRequestId,
      partnerTenantId: assignment.partnerTenantId,
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      channel,
      status: "sent",
      message: parsed.message,
      ...(parsed.priceMin !== undefined ? { priceMin: parsed.priceMin } : {}),
      ...(parsed.priceMax !== undefined ? { priceMax: parsed.priceMax } : {}),
      currency: parsed.currency,
      guarantees: parsed.guarantees,
      validUntil: new Date(parsed.validUntil),
      nonContractual: true,
      ...(document ? { document } : {}),
      sentAt: now,
      createdAt: now,
      updatedAt: now
    });

    await this.deps.leadHistory.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType: "proposal_sent" });
    if (channel === "crm") await this.deps.crmHistory.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType: "proposal_sent" });
    const progression = await this.advanceLead(channel, assignment, actor);
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.sent,
      targetType: "LeadProposal",
      targetId: proposal.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId, leadAssignmentId: assignment.id },
      result: "success",
      context: { channel, hasDocument: Boolean(document), guaranteeCount: proposal.guarantees.length, ...progression }
    });
    await this.deps.notifications?.queueVisitorEvent(activeQuote, {
      type: "visitor_proposal_available",
      assignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      seq: proposal.id
    }, actor);
    return this.toBroker(proposal, [], now);
  }

  /** FR-003: the only change a sent proposal accepts. Withdrawing twice is refused. */
  async withdraw(channel: LeadProposalChannel, leadId: string, proposalId: string, input: unknown, actor: ActorContext): Promise<BrokerLeadProposal> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertMutation(channel, actor, assignment);
    const parsed = leadProposalWithdrawSchema.parse(input ?? {});
    const proposal = await this.ownProposal(assignment, proposalId);
    if (proposal.status === "withdrawn") {
      this.deps.audit.write({
        actor,
        action: LeadProposalAuditActions.withdrawRefused,
        targetType: "LeadProposal",
        targetId: proposal.id,
        scope: { partnerTenantId: assignment.partnerTenantId },
        result: "refused",
        reason: "already_withdrawn",
        context: { channel }
      });
      throw conflict(ErrorCodes.PROPOSAL_NOT_ACTIVE, "Proposal already withdrawn");
    }
    const now = this.now();
    const updated = await this.repository.updateLifecycle(proposal.id, {
      status: "withdrawn",
      withdrawnAt: now,
      ...(actor.actorId ? { withdrawnById: actor.actorId } : {}),
      ...(parsed.reason ? { withdrawReason: parsed.reason } : {})
    });
    await this.deps.leadHistory.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType: "proposal_withdrawn" });
    if (channel === "crm") await this.deps.crmHistory.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType: "proposal_withdrawn" });
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.withdrawn,
      targetType: "LeadProposal",
      targetId: proposal.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
      result: "success",
      context: { channel, previousStatus: proposal.status }
    });
    return this.toBroker(updated, await this.repository.responsesForProposals([updated.id]), now);
  }

  /** Broker download with its session: own proposal, clean file, audited, never cached. */
  async brokerDocument(channel: LeadProposalChannel, leadId: string, proposalId: string, actor: ActorContext): Promise<ProposalFile> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const proposal = await this.ownProposal(assignment, proposalId);
    const file = await this.readDocument(proposal);
    if (!file) {
      this.auditDownload(actor, proposal, "refused", "document_unavailable", "broker");
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Proposal document not found" });
    }
    this.auditDownload(actor, proposal, "success", undefined, "broker");
    return file;
  }

  // ---------------------------------------------------------------------------------------------
  // Visitor side (token of spec 054)
  // ---------------------------------------------------------------------------------------------

  /**
   * FR-005: the visible proposals of the request (sent, not withdrawn), newest first, and the
   * active proposal time per assignment for the public status. Opening the space marks the
   * proposals it shows as viewed. Nothing is shown after a consent withdrawal (FR-012).
   */
  async forVisitorStatus(quote: ProposalQuote, assignments: LeadAssignmentRecord[], actor: ActorContext = SYSTEM_VISITOR): Promise<{ proposals: PublicLeadProposal[]; activeProposalAt: Map<string, Date> }> {
    const activeProposalAt = new Map<string, Date>();
    if (consentWithdrawn(quote)) return { proposals: [], activeProposalAt };
    const rows = (await this.repository.listForQuote(quote.id)).filter((proposal) => proposal.status !== "withdrawn");
    if (rows.length === 0) return { proposals: [], activeProposalAt };
    const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const responses = await this.repository.responsesForProposals(rows.map((proposal) => proposal.id));
    const names = new Map<string, string>();
    const now = this.now();
    const proposals: PublicLeadProposal[] = [];
    for (const row of rows) {
      const assignment = byId.get(row.leadAssignmentId);
      let proposal = row;
      const status = this.publicStatus(proposal, assignment, quote, now);
      if (status === "sent") {
        proposal = await this.repository.updateLifecycle(row.id, { status: "viewed", viewedAt: now });
        this.auditViewed(actor, proposal, "space_opened");
      }
      const visibleStatus: PublicProposalStatus = status === "sent" ? "viewed" : status;
      if (assignment && (visibleStatus === "viewed" || visibleStatus === "responded")) {
        const current = activeProposalAt.get(assignment.id);
        if (!current || current < proposal.sentAt) activeProposalAt.set(assignment.id, proposal.sentAt);
      }
      if (!names.has(proposal.partnerTenantId)) names.set(proposal.partnerTenantId, await this.deps.partnerName(proposal.partnerTenantId));
      const latest = responses.filter((response) => response.proposalId === proposal.id).at(-1);
      proposals.push(this.toPublic(proposal, names.get(proposal.partnerTenantId) ?? "", visibleStatus, quote, latest));
    }
    return { proposals, activeProposalAt };
  }

  /** `GET /quote-requests/:ref/proposals/:id/document?token=`: clean file only, audited. */
  async visitorDocument(publicReference: string, token: string, proposalId: string, context: { ipAddress?: string; actor?: ActorContext } = {}): Promise<ProposalFile> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "proposal_document", ipAddress: context.ipAddress, limitPerWindow: DOCUMENT_LIMIT_PER_IP, windowSeconds: VISITOR_WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const proposal = await this.repository.find(proposalId);
    if (!proposal || proposal.quoteRequestId !== quote.id || proposal.status === "withdrawn" || consentWithdrawn(quote)) {
      if (proposal && proposal.quoteRequestId === quote.id) this.auditDownload(actor, proposal, "refused", proposal.status === "withdrawn" ? "proposal_withdrawn" : "consent_withdrawn", "visitor");
      throw visitorAccessDenied();
    }
    const file = await this.readDocument(proposal);
    if (!file) {
      this.auditDownload(actor, proposal, "refused", "document_unavailable", "visitor");
      throw visitorAccessDenied();
    }
    if (proposal.status === "sent") {
      await this.repository.updateLifecycle(proposal.id, { status: "viewed", viewedAt: this.now() });
      this.auditViewed(actor, proposal, "document_downloaded");
    }
    this.auditDownload(actor, proposal, "success", undefined, "visitor");
    return file;
  }

  /**
   * FR-006: "interested" (callback request, never a subscription), "declined" or a short question.
   * Rate limited; each response is kept, the latest prevails; the broker is notified. The CRM
   * status is never touched (FR-007).
   */
  async visitorRespond(publicReference: string, token: string, proposalId: string, input: unknown, context: { ipAddress?: string; actor?: ActorContext } = {}): Promise<VisitorProposalResponseResult> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "proposal_response", ipAddress: context.ipAddress, limitPerWindow: RESPONSE_LIMIT_PER_IP, windowSeconds: VISITOR_WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const proposal = await this.repository.find(proposalId);
    if (!proposal || proposal.quoteRequestId !== quote.id) throw visitorAccessDenied();
    if (this.deps.redis) {
      const count = await this.deps.redis.incr(QuoteRedisKeys.publicScopeRateLimit("proposal_response_proposal", proposal.id), VISITOR_WINDOW_SECONDS);
      if (count > RESPONSE_LIMIT_PER_PROPOSAL) throw new Error("Rate limit exceeded for public submissions");
    }
    const parsed = visitorProposalResponseCreateSchema.parse(input);
    const assignment = await this.deps.assignments.require(proposal.leadAssignmentId).catch(() => undefined);
    const now = this.now();
    const status = proposal.status === "withdrawn" ? "withdrawn" : this.publicStatus(proposal, assignment, quote, now);
    if (consentWithdrawn(quote) || !["sent", "viewed", "responded"].includes(status)) {
      const reason = consentWithdrawn(quote) ? "consent_withdrawn" : status;
      this.deps.audit.write({
        actor,
        action: LeadProposalAuditActions.visitorResponseRefused,
        targetType: "LeadProposal",
        targetId: proposal.id,
        scope: { quoteRequestId: quote.id, partnerTenantId: proposal.partnerTenantId },
        result: "refused",
        reason,
        context: { type: parsed.type }
      });
      throw conflict(ErrorCodes.PROPOSAL_NOT_RESPONDABLE, "This proposal can no longer receive a response");
    }
    const response: VisitorProposalResponseRecord = await this.repository.addResponse({
      id: crypto.randomUUID(),
      proposalId: proposal.id,
      leadAssignmentId: proposal.leadAssignmentId,
      quoteRequestId: quote.id,
      partnerTenantId: proposal.partnerTenantId,
      type: parsed.type,
      ...(parsed.callbackSlot ? { callbackSlot: parsed.callbackSlot } : {}),
      ...(parsed.declineReason ? { declineReason: parsed.declineReason } : {}),
      ...(parsed.question ? { question: parsed.question } : {}),
      createdAt: now
    });
    await this.repository.updateLifecycle(proposal.id, { status: "responded", respondedAt: now, ...(proposal.viewedAt ? {} : { viewedAt: now }) });
    await this.deps.leadHistory.append({ leadAssignmentId: proposal.leadAssignmentId, partnerTenantId: proposal.partnerTenantId, eventType: "visitor_responded", comment: parsed.type });
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.visitorResponded,
      targetType: "LeadProposal",
      targetId: proposal.id,
      scope: { quoteRequestId: quote.id, partnerTenantId: proposal.partnerTenantId, leadAssignmentId: proposal.leadAssignmentId },
      result: "success",
      context: { type: parsed.type, responseId: response.id, ...(parsed.declineReason ? { declineReason: parsed.declineReason } : {}) }
    });
    await this.deps.notifications?.queueBrokerVisitorResponse(quote, {
      assignmentId: proposal.leadAssignmentId,
      partnerTenantId: proposal.partnerTenantId,
      proposalId: proposal.id,
      responseId: response.id,
      responseType: parsed.type
    }, actor);
    return { recorded: true, proposalId: proposal.id, type: parsed.type, at: now.toISOString() };
  }

  /** Spec 046: retention anonymization of the proposals and responses of these assignments. */
  anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    return this.repository.anonymizeForAssignments(leadAssignmentIds, marker, now);
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private assertRead(channel: LeadProposalChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertLeadRead(actor, assignment);
    else this.deps.starterAccess.assertLeadAccess(actor, assignment);
  }

  private assertMutation(channel: LeadProposalChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertMutation(actor, assignment);
    else this.deps.starterAccess.assertMutationAccess(actor, assignment);
  }

  /** Only the proposals the current broker sent: a reassigned lead never shows the previous broker's. */
  private async ownProposals(assignment: LeadAssignmentRecord): Promise<LeadProposalRecord[]> {
    return (await this.repository.listForAssignment(assignment.id)).filter((proposal) => proposal.partnerTenantId === assignment.partnerTenantId);
  }

  private async ownProposal(assignment: LeadAssignmentRecord, proposalId: string): Promise<LeadProposalRecord> {
    const proposal = await this.repository.find(proposalId);
    if (!proposal || proposal.leadAssignmentId !== assignment.id || proposal.partnerTenantId !== assignment.partnerTenantId) {
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Proposal not found" });
    }
    return proposal;
  }

  private isActive(proposal: LeadProposalRecord, now: Date): boolean {
    return proposal.status !== "withdrawn" && proposal.validUntil.getTime() > now.getTime();
  }

  private effectiveStatus(proposal: LeadProposalRecord, now: Date): LeadProposalStatus {
    if (proposal.status === "withdrawn") return "withdrawn";
    if (proposal.validUntil.getTime() <= now.getTime()) return "expired";
    return proposal.status;
  }

  /** Visitor status of a non-withdrawn proposal; `closed` after a reassignment or a closed lead. */
  private publicStatus(proposal: LeadProposalRecord, assignment: LeadAssignmentRecord | undefined, quote: ProposalQuote, now: Date): PublicProposalStatus {
    if (consentWithdrawn(quote)) return "closed";
    if (!assignment || assignment.partnerTenantId !== proposal.partnerTenantId || leadState(assignment) === "closed") return "closed";
    const status = this.effectiveStatus(proposal, now);
    return status === "withdrawn" ? "closed" : status;
  }

  private blockers(assignment: LeadAssignmentRecord, quote: ProposalQuote | undefined, activeCount: number): LeadProposalBlocker[] {
    const blockers: LeadProposalBlocker[] = [];
    const state = leadState(assignment);
    if (state === "closed") blockers.push("lead_closed");
    if (state === "not_accepted") blockers.push("not_accepted");
    if (consentWithdrawn(quote)) blockers.push("consent_withdrawn");
    if (activeCount >= LEAD_PROPOSAL_MAX_ACTIVE) blockers.push("limit_reached");
    return blockers;
  }

  private suggest(assignment: LeadAssignmentRecord, type: string): BrokerCrmPipelineStatus | undefined {
    const suggestion = SUGGESTED_STATUS[type];
    if (!suggestion || leadState(assignment) === "closed") return undefined;
    const current = crmStatusOf(assignment);
    if (suggestion === "perdu") return "perdu";
    return CRM_ORDER.indexOf(current) < CRM_ORDER.indexOf(suggestion) ? suggestion : undefined;
  }

  /**
   * FR-011: a CRM lead less advanced than "devis envoyé" moves there (audited pipeline change), and
   * the assignment moves to "contacted" (Starter and CRM). Neither ever goes backwards.
   */
  private async advanceLead(channel: LeadProposalChannel, assignment: LeadAssignmentRecord, actor: ActorContext): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    if (channel === "crm") {
      const current = crmStatusOf(assignment);
      if (CRM_ORDER.indexOf(current) < CRM_ORDER.indexOf("devis_envoye")) {
        await this.deps.crmPipeline.changeStatus(assignment.id, { status: "devis_envoye" }, actor);
        result.crmStatus = { previous: current, next: "devis_envoye" };
      }
    }
    if (assignment.status !== "contacted") {
      const previous = assignment.status;
      await this.deps.assignments.updateStatus(assignment.id, "contacted", actor, "proposal_sent");
      result.assignmentStatus = { previous, next: "contacted" };
    }
    return result;
  }

  private async readDocument(proposal: LeadProposalRecord): Promise<ProposalFile | undefined> {
    const document = proposal.document;
    if (!document || document.scanStatus !== "clean") return undefined;
    const bytes = await this.deps.upload.storage.get(document.storageKey);
    if (!bytes) return undefined;
    return { bytes, fileName: document.fileName, mimeType: document.mimeType };
  }

  private async verifyVisitor(publicReference: string, token: string, actor: ActorContext): Promise<ProposalQuote> {
    const grant = await this.deps.visitorAccess?.verify(publicReference, token, actor);
    if (!grant) throw visitorAccessDenied();
    return grant.quote;
  }

  private toBroker(proposal: LeadProposalRecord, responses: VisitorProposalResponseRecord[], now: Date): BrokerLeadProposal {
    return {
      id: proposal.id,
      leadAssignmentId: proposal.leadAssignmentId,
      status: this.effectiveStatus(proposal, now),
      message: proposal.message,
      ...(proposal.priceMin !== undefined ? { priceMin: proposal.priceMin } : {}),
      ...(proposal.priceMax !== undefined ? { priceMax: proposal.priceMax } : {}),
      currency: proposal.currency,
      guarantees: [...proposal.guarantees],
      validUntil: proposal.validUntil.toISOString(),
      ...(proposal.document ? { document: { fileName: proposal.document.fileName, mimeType: proposal.document.mimeType, sizeBytes: proposal.document.sizeBytes } } : {}),
      sentAt: proposal.sentAt.toISOString(),
      ...(proposal.viewedAt ? { viewedAt: proposal.viewedAt.toISOString() } : {}),
      ...(proposal.respondedAt ? { respondedAt: proposal.respondedAt.toISOString() } : {}),
      ...(proposal.withdrawnAt ? { withdrawnAt: proposal.withdrawnAt.toISOString() } : {}),
      ...(proposal.withdrawReason ? { withdrawReason: proposal.withdrawReason } : {}),
      ...(proposal.authorId ? { authorId: proposal.authorId } : {}),
      nonContractualNotice: LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE.fr,
      responses: responses.map((response) => ({
        id: response.id,
        type: response.type,
        ...(response.callbackSlot ? { callbackSlot: response.callbackSlot } : {}),
        ...(response.declineReason ? { declineReason: response.declineReason } : {}),
        ...(response.question ? { question: response.question } : {}),
        createdAt: response.createdAt.toISOString()
      }))
    };
  }

  private toPublic(proposal: LeadProposalRecord, partnerName: string, status: PublicProposalStatus, quote: ProposalQuote, latest: VisitorProposalResponseRecord | undefined): PublicLeadProposal {
    return {
      id: proposal.id,
      partnerName,
      message: proposal.message,
      ...(proposal.priceMin !== undefined ? { priceMin: proposal.priceMin } : {}),
      ...(proposal.priceMax !== undefined ? { priceMax: proposal.priceMax } : {}),
      currency: proposal.currency,
      guarantees: [...proposal.guarantees],
      validUntil: proposal.validUntil.toISOString(),
      hasDocument: proposal.document?.scanStatus === "clean",
      status,
      sentAt: proposal.sentAt.toISOString(),
      nonContractualNotice: LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE[locale(quote)],
      canRespond: status === "sent" || status === "viewed" || status === "responded",
      ...(latest ? {
        visitorResponse: {
          type: latest.type,
          ...(latest.callbackSlot ? { callbackSlot: latest.callbackSlot } : {}),
          ...(latest.declineReason ? { declineReason: latest.declineReason } : {}),
          ...(latest.question ? { question: latest.question } : {}),
          at: latest.createdAt.toISOString()
        }
      } : {})
    };
  }

  private auditViewed(actor: ActorContext, proposal: LeadProposalRecord, via: string): void {
    this.deps.audit.write({
      actor,
      action: LeadProposalAuditActions.viewedByVisitor,
      targetType: "LeadProposal",
      targetId: proposal.id,
      scope: { quoteRequestId: proposal.quoteRequestId, partnerTenantId: proposal.partnerTenantId },
      result: "success",
      context: { via }
    });
  }

  private auditDownload(actor: ActorContext, proposal: LeadProposalRecord, result: "success" | "refused", reason: string | undefined, by: "broker" | "visitor"): void {
    this.deps.audit.write({
      actor,
      action: result === "success" ? LeadProposalAuditActions.documentDownloaded : LeadProposalAuditActions.documentDownloadRefused,
      targetType: "LeadProposal",
      targetId: proposal.id,
      scope: { quoteRequestId: proposal.quoteRequestId, partnerTenantId: proposal.partnerTenantId },
      result,
      ...(reason ? { reason } : {}),
      context: { by }
    });
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
