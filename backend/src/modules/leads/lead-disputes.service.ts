import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import {
  adminLeadDisputeQuerySchema,
  leadDisputeDecisionRequestSchema,
  leadDisputeWindowFor,
  type AdminLeadDispute,
  type AdminLeadDisputeList,
  type AdminLeadDisputeQuery,
  type BrokerLeadDisputeView,
  type LeadDisputeCreditMode,
  type LeadDisputeSource,
  type LeadDisputeWindow
} from "../../../../packages/shared/contracts/lead-disputes.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { BillingAuditActions } from "../billing/billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "../billing/billing-foundation.service";
import { countryCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import type { ActorContext } from "../common/types";
import { DisputeStatusConflictError, MemoryCrmActivityRepository, type CrmActivityRepository, type LeadDisputeRecord } from "./crm-activity.repository";
import type { LeadAssignmentRecord, LeadAssignmentService } from "./lead-assignment.service";

/** What the invoicing side answers when an accepted dispute has to be credited (spec 063 FR-B06). */
export interface LeadDisputeCreditOutcome {
  creditMode: LeadDisputeCreditMode;
  creditNoteId?: string | undefined;
  creditNoteNumber?: string | undefined;
  /** Credit note total, XOF including VAT. */
  creditAmount?: number | undefined;
  /** Why nothing was credited ("none" mode); audited. */
  reason?: string | undefined;
}

/** Port to the billing module (implemented by `InvoicingService`); bound after construction. */
export interface LeadDisputeCreditPort {
  creditAcceptedDispute(request: {
    disputeId: string;
    leadAssignmentId: string;
    partnerId: string;
    assignedAt: Date;
    recipientCount: number;
    publicReference?: string | undefined;
    decisionReason: string;
  }, actor: ActorContext): Promise<LeadDisputeCreditOutcome>;
  creditNoteNumber(id: string): Promise<string | undefined>;
  /** Credit already issued for the dispute, if any (crash recovery). */
  existingCredit?(disputeId: string): Promise<LeadDisputeCreditOutcome | undefined>;
  /**
   * "draft_invoice" mode: refreshes the not-yet-invoiced draft of the lead's UTC month so it includes
   * the credit (no-op when there is no such draft). Called after the decision is persisted.
   */
  refreshDraft?(partnerId: string, periodFrom: Date, actor: ActorContext): Promise<void>;
}

/** Broker notification of a decision (in-app + pointer e-mail); never carries lead content. */
export interface LeadDisputeNotifier {
  notifyDecision(dispute: LeadDisputeRecord, actor: ActorContext): Promise<void>;
}

export interface LeadDisputesDeps {
  audit: AuditLogWriter;
  assignments: LeadAssignmentService;
  repository?: CrmActivityRepository | undefined;
  partners?: { list(): Promise<Array<{ id: string; legalName: string; tradeName?: string | undefined }>> } | undefined;
  countries?: { listAdmin(): Promise<Array<{ id: string; isoCode: string }>> } | undefined;
  featureFlags?: { isEnabled(key: string): boolean } | undefined;
  now?: (() => Date) | undefined;
}

export type OpenLeadDisputeInput = {
  assignment: LeadAssignmentRecord;
  source: LeadDisputeSource;
  reason: string;
  comment?: string | undefined;
  actor: ActorContext;
};

/** A stored dispute plus the number of its credit note, when one was issued. */
export type LeadDisputeWithNote = LeadDisputeRecord & { creditNoteNumber?: string | undefined };

type DisputeTarget = "LeadDispute";
const TARGET: DisputeTarget = "LeadDispute";

/**
 * Spec 063 (CRM-012): lead disputes end to end. A broker disputes a lead within 30 days after its
 * reception (Starter and CRM routes share `open`); the finance admin accepts or rejects with a
 * mandatory reason; an accepted dispute is credited on the draft invoice or, when the lead is
 * already invoiced, by an automatic partial credit note. Everything is audited without lead content.
 */
export class LeadDisputesService {
  private readonly repository: CrmActivityRepository;
  private credit: LeadDisputeCreditPort | undefined;
  private notifier: LeadDisputeNotifier | undefined;
  /** In-process guards: one dispute per lead and one decision at a time per dispute. */
  private readonly opening = new Set<string>();
  private readonly deciding = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: LeadDisputesDeps) {
    this.repository = deps.repository ?? new MemoryCrmActivityRepository();
  }

  /** Late binding: the billing module is built after the leads module. */
  bindCredit(port: LeadDisputeCreditPort): void {
    this.credit = port;
  }

  bindNotifier(notifier: LeadDisputeNotifier): void {
    this.notifier = notifier;
  }

  // ---------------------------------------------------------------- broker side

  windowFor(assignment: LeadAssignmentRecord): LeadDisputeWindow {
    return leadDisputeWindowFor(assignment.assignedAt, this.now());
  }

  /**
   * Opens the dispute of a lead (the caller already checked the broker's access to the lead).
   * Refusals (window expired, dispute already exists) are audited and create nothing.
   */
  async open(input: OpenLeadDisputeInput): Promise<LeadDisputeRecord> {
    const { assignment, source, actor } = input;
    const refuse = (code: string, reason: string, message: string): never => {
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.disputeOpenRefused,
        targetType: TARGET,
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id },
        result: "refused",
        reason,
        context: { source, deadline: this.windowFor(assignment).deadline }
      });
      throw new ConflictException({ code, message });
    };
    if (!this.windowFor(assignment).open) refuse(ErrorCodes.DISPUTE_WINDOW_EXPIRED, "window_expired", "The 30-day dispute window of this lead is over");
    const key = `${assignment.partnerTenantId}:${assignment.id}`;
    if (this.opening.has(key)) refuse(ErrorCodes.DISPUTE_ALREADY_EXISTS, "already_exists", "A dispute already exists for this lead");
    this.opening.add(key);
    try {
      const existing = (await this.repository.disputesForLead(assignment.id)).some((dispute) => dispute.partnerTenantId === assignment.partnerTenantId);
      if (existing) refuse(ErrorCodes.DISPUTE_ALREADY_EXISTS, "already_exists", "A dispute already exists for this lead");
      const dispute: LeadDisputeRecord = {
        id: crypto.randomUUID(),
        leadAssignmentId: assignment.id,
        partnerTenantId: assignment.partnerTenantId,
        reason: input.reason as LeadDisputeRecord["reason"],
        ...(input.comment ? { comment: input.comment } : {}),
        status: "opened",
        createdAt: this.now().toISOString(),
        source,
        ...(assignment.countryCode ? { countryCode: assignment.countryCode } : {})
      };
      await this.repository.addDispute(dispute);
      // A lead already closed by the Starter flow keeps its final status; every other lead is
      // marked disputed (exempt from the monthly quota, as before).
      if (assignment.status !== "closed") await this.deps.assignments.updateStatus(assignment.id, "disputed", actor, input.reason);
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.disputeOpened,
        targetType: TARGET,
        targetId: dispute.id,
        scope: { partnerTenantId: assignment.partnerTenantId, leadAssignmentId: assignment.id, countryCode: assignment.countryCode ?? null },
        result: "success",
        reason: input.reason,
        context: { source, deadline: this.windowFor(assignment).deadline }
      });
      return dispute;
    } finally {
      this.opening.delete(key);
    }
  }

  /** Disputes of a lead for its own tenant, with the credit note number when one was issued. */
  async forLead(assignment: LeadAssignmentRecord): Promise<LeadDisputeWithNote[]> {
    const rows = (await this.repository.disputesForLead(assignment.id)).filter((dispute) => dispute.partnerTenantId === assignment.partnerTenantId);
    return Promise.all(rows.map((row) => this.withNoteNumber(row)));
  }

  /** `GET /broker/billing/disputes`: the disputes of the caller's tenant, newest first. */
  async listForBroker(actor: ActorContext): Promise<{ items: BrokerLeadDisputeView[] }> {
    const tenantId = this.assertBrokerReader(actor);
    const [rows, assignments] = await Promise.all([this.repository.listDisputes({ partnerTenantId: tenantId }), this.deps.assignments.list()]);
    const referenceById = new Map(assignments.filter((assignment) => assignment.partnerTenantId === tenantId).map((assignment) => [assignment.id, assignment.publicReference]));
    const items = await Promise.all(rows.map(async (row) => this.brokerView(await this.withNoteNumber(row), referenceById.get(row.leadAssignmentId))));
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.disputeRead,
      targetType: TARGET,
      targetId: "broker-list",
      scope: { partnerTenantId: tenantId },
      result: "success",
      context: { total: items.length }
    });
    return { items };
  }

  // ---------------------------------------------------------------- admin side

  async listForAdmin(actor: ActorContext, query: AdminLeadDisputeQuery): Promise<AdminLeadDisputeList> {
    const scope = await this.assertAdmin(actor, "billing:dispute_read", BillingAuditActions.accessRefused);
    const parsed = adminLeadDisputeQuerySchema.parse(query);
    const rows = await this.repository.listDisputes({
      status: parsed.status,
      partnerTenantId: parsed.partnerId,
      from: parsed.from ? new Date(parsed.from) : undefined,
      to: parsed.to ? new Date(parsed.to) : undefined
    });
    const assignments = new Map((await this.deps.assignments.list()).map((assignment) => [assignment.id, assignment]));
    const visible = rows.filter((row) => {
      const country = row.countryCode ?? assignments.get(row.leadAssignmentId)?.countryCode;
      if (parsed.countryCode && country !== parsed.countryCode) return false;
      return this.inScope(scope, country);
    });
    const start = (parsed.page - 1) * parsed.pageSize;
    const partners = await this.partnerNames();
    const items = await Promise.all(visible.slice(start, start + parsed.pageSize).map(async (row) => this.adminView(await this.withNoteNumber(row), assignments.get(row.leadAssignmentId), partners)));
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.disputeRead,
      targetType: TARGET,
      targetId: "list",
      scope: { partnerId: parsed.partnerId ?? null, countryCode: parsed.countryCode ?? null, status: parsed.status ?? null },
      result: "success",
      context: { total: visible.length }
    });
    return { items, page: parsed.page, pageSize: parsed.pageSize, total: visible.length };
  }

  async detailForAdmin(actor: ActorContext, id: string): Promise<AdminLeadDispute> {
    const scope = await this.assertAdmin(actor, "billing:dispute_read", BillingAuditActions.accessRefused);
    const dispute = await this.requireDispute(id);
    const assignment = await this.assignmentOf(dispute);
    this.assertInScope(actor, scope, dispute, assignment, BillingAuditActions.accessRefused);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.disputeRead,
      targetType: TARGET,
      targetId: dispute.id,
      scope: { partnerTenantId: dispute.partnerTenantId, leadAssignmentId: dispute.leadAssignmentId },
      result: "success",
      context: { status: dispute.status }
    });
    return this.adminView(await this.withNoteNumber(dispute), assignment, await this.partnerNames());
  }

  /**
   * Finance decision. Idempotent for the same decision, 409 for the other one, 422 without a
   * reason or when `billing_enabled` is off. The credit note (if any) is issued BEFORE the decision
   * is persisted, and is itself idempotent per dispute, so a retry after a crash converges.
   */
  async decide(actor: ActorContext, id: string, input: unknown): Promise<AdminLeadDispute> {
    const refusedAction = BillingAuditActions.disputeDecisionRefused;
    const scope = await this.assertAdmin(actor, "billing:dispute_decide", refusedAction);
    const parsed = leadDisputeDecisionRequestSchema.safeParse(input ?? {});
    if (!parsed.success) {
      this.audit(actor, refusedAction, id, "refused", "invalid_request", {});
      throw new UnprocessableEntityException({ message: "Validation failed: a decision (accept or reject) and a reason of 10 to 1000 characters are required", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    }
    if (!this.deps.featureFlags?.isEnabled("billing_enabled")) {
      this.audit(actor, refusedAction, id, "refused", "billing_disabled", {});
      throw new BillingDisabledError("billing_disabled");
    }
    return this.exclusive(id, async () => {
      const dispute = await this.requireDispute(id);
      const assignment = await this.assignmentOf(dispute);
      this.assertInScope(actor, scope, dispute, assignment, refusedAction);
      const { decision, reason } = parsed.data;
      const target = decision === "accept" ? "accepted" : "rejected";
      if (dispute.status !== "opened") {
        if (dispute.status === target) {
          this.audit(actor, BillingAuditActions.disputeDecided, dispute.id, "success", reason, { decision, replayed: true, creditMode: dispute.creditMode ?? null, leadAssignmentId: dispute.leadAssignmentId });
          // Converges after a crash between the decision and the draft refresh (the refresh is idempotent).
          if (assignment && dispute.status === "accepted" && dispute.creditMode === "draft_invoice") await this.refreshDraft(dispute, assignment, actor);
          return this.adminView(await this.withNoteNumber(dispute), assignment, await this.partnerNames());
        }
        this.audit(actor, refusedAction, dispute.id, "refused", "already_decided", { decision, currentStatus: dispute.status });
        throw new ConflictException({ code: ErrorCodes.DISPUTE_ALREADY_DECIDED, message: "This dispute was already decided differently" });
      }
      let outcome: LeadDisputeCreditOutcome | undefined;
      if (decision === "reject" && this.credit?.existingCredit && await this.credit.existingCredit(dispute.id)) {
        // An interrupted acceptance already issued the credit note: only "accept" may be replayed.
        this.audit(actor, refusedAction, dispute.id, "refused", "credit_note_already_issued", { decision });
        throw new ConflictException({ code: ErrorCodes.DISPUTE_ALREADY_DECIDED, message: "A credit note was already issued for this dispute: replay the acceptance" });
      }
      if (decision === "accept") {
        if (!this.credit) throw new Error("Lead dispute credit port is not bound");
        if (!assignment) throw new NotFoundException({ code: ErrorCodes.DISPUTE_NOT_FOUND, message: "Lead of this dispute not found" });
        try {
          outcome = await this.credit.creditAcceptedDispute({
            disputeId: dispute.id,
            leadAssignmentId: dispute.leadAssignmentId,
            partnerId: dispute.partnerTenantId,
            assignedAt: assignment.assignedAt,
            recipientCount: assignment.recipientCount ?? 1,
            publicReference: assignment.publicReference,
            decisionReason: reason
          }, actor);
        } catch (error) {
          this.audit(actor, refusedAction, dispute.id, "refused", error instanceof Error ? error.name : "credit_failed", { decision });
          throw error;
        }
      }
      const decided: LeadDisputeRecord = {
        ...dispute,
        status: target,
        decidedAt: this.now().toISOString(),
        ...(actor.actorId ? { decidedById: actor.actorId } : {}),
        decisionReason: reason,
        ...(outcome ? { creditMode: outcome.creditMode } : {}),
        ...(outcome?.creditNoteId ? { creditNoteId: outcome.creditNoteId } : {}),
        ...(outcome?.creditAmount !== undefined ? { creditAmount: outcome.creditAmount } : {})
      };
      let saved: LeadDisputeRecord;
      try {
        saved = await this.repository.updateDispute(decided, "opened");
      } catch (error) {
        if (!(error instanceof DisputeStatusConflictError)) throw error;
        this.audit(actor, refusedAction, dispute.id, "refused", "already_decided", { decision, concurrent: true });
        throw new ConflictException({ code: ErrorCodes.DISPUTE_ALREADY_DECIDED, message: "This dispute was decided concurrently" });
      }
      this.audit(actor, BillingAuditActions.disputeDecided, saved.id, "success", reason, {
        decision,
        leadAssignmentId: saved.leadAssignmentId,
        partnerTenantId: saved.partnerTenantId,
        creditMode: saved.creditMode ?? null,
        creditNoteId: saved.creditNoteId ?? null,
        creditAmount: saved.creditAmount ?? null,
        ...(outcome?.reason ? { creditSkippedReason: outcome.reason } : {})
      });
      if (assignment && saved.status === "accepted" && saved.creditMode === "draft_invoice") await this.refreshDraft(saved, assignment, actor);
      await this.notify(saved, actor);
      return this.adminView({ ...saved, ...(outcome?.creditNoteNumber ? { creditNoteNumber: outcome.creditNoteNumber } : {}) }, assignment, await this.partnerNames());
    });
  }

  // ---------------------------------------------------------------- internals

  /** A stale draft is a money risk but must not undo the decision: a failure is audited for finance. */
  private async refreshDraft(dispute: LeadDisputeRecord, assignment: LeadAssignmentRecord, actor: ActorContext): Promise<void> {
    if (!this.credit?.refreshDraft) return;
    const periodFrom = new Date(Date.UTC(assignment.assignedAt.getUTCFullYear(), assignment.assignedAt.getUTCMonth(), 1));
    try {
      await this.credit.refreshDraft(dispute.partnerTenantId, periodFrom, actor);
    } catch (error) {
      this.audit(actor, BillingAuditActions.draftComputed, dispute.id, "failed", "dispute_credit_refresh_failed", { error: error instanceof Error ? error.name : "unknown", partnerTenantId: dispute.partnerTenantId });
    }
  }

  private async notify(dispute: LeadDisputeRecord, actor: ActorContext): Promise<void> {
    if (!this.notifier) return;
    try {
      await this.notifier.notifyDecision(dispute, actor);
    } catch (error) {
      // A failed notification never undoes the decision (FR-B08); it is audited for the operator.
      this.audit(actor, BillingAuditActions.disputeNotificationFailed, dispute.id, "failed", "broker_notice_failed", { error: error instanceof Error ? error.name : "unknown", partnerTenantId: dispute.partnerTenantId });
    }
  }

  private audit(actor: ActorContext, action: string, targetId: string, result: "success" | "refused" | "failed", reason: string, context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: TARGET,
      targetId,
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result,
      reason,
      context: { ...context, paymentsEnabled: false }
    });
  }

  /** One decision at a time per dispute inside this process. */
  private async exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.deciding.get(id) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const settled = run.catch(() => undefined);
    this.deciding.set(id, settled);
    try {
      return await run;
    } finally {
      if (this.deciding.get(id) === settled) this.deciding.delete(id);
    }
  }

  private async requireDispute(id: string): Promise<LeadDisputeRecord> {
    const dispute = await this.repository.findDispute(id);
    if (!dispute) throw new NotFoundException({ code: ErrorCodes.DISPUTE_NOT_FOUND, message: "Dispute not found" });
    return dispute;
  }

  private async assignmentOf(dispute: LeadDisputeRecord): Promise<LeadAssignmentRecord | undefined> {
    return this.deps.assignments.require(dispute.leadAssignmentId).catch(() => undefined);
  }

  private async withNoteNumber(dispute: LeadDisputeRecord): Promise<LeadDisputeWithNote> {
    if (!dispute.creditNoteId || !this.credit) return dispute;
    const number = await this.credit.creditNoteNumber(dispute.creditNoteId).catch(() => undefined);
    return number ? { ...dispute, creditNoteNumber: number } : dispute;
  }

  private brokerView(dispute: LeadDisputeWithNote, publicReference: string | undefined): BrokerLeadDisputeView {
    return {
      id: dispute.id,
      leadAssignmentId: dispute.leadAssignmentId,
      ...(publicReference ? { publicReference } : {}),
      source: dispute.source ?? "crm",
      status: dispute.status === "accepted" || dispute.status === "rejected" ? dispute.status : "opened",
      reason: dispute.reason,
      ...(dispute.comment ? { comment: dispute.comment } : {}),
      createdAt: dispute.createdAt,
      ...(dispute.decidedAt ? { decidedAt: dispute.decidedAt } : {}),
      ...(dispute.decisionReason ? { decisionReason: dispute.decisionReason } : {}),
      ...(dispute.creditMode ? { creditMode: dispute.creditMode } : {}),
      ...(dispute.creditNoteId ? { creditNoteId: dispute.creditNoteId } : {}),
      ...(dispute.creditNoteNumber ? { creditNoteNumber: dispute.creditNoteNumber } : {}),
      ...(dispute.creditAmount !== undefined ? { creditAmount: dispute.creditAmount } : {})
    };
  }

  /** Admin DTO: reference, country, product and dates of the lead; never its contact or answers. */
  private adminView(dispute: LeadDisputeWithNote, assignment: LeadAssignmentRecord | undefined, partners: Map<string, string>): AdminLeadDispute {
    const countryCode = dispute.countryCode ?? assignment?.countryCode;
    const partnerName = partners.get(dispute.partnerTenantId);
    return {
      ...this.brokerView(dispute, assignment?.publicReference),
      partnerTenantId: dispute.partnerTenantId,
      ...(partnerName ? { partnerName } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(assignment?.productKey ? { productKey: assignment.productKey } : {}),
      ...(assignment ? { assignedAt: assignment.assignedAt.toISOString() } : {}),
      ...(dispute.decidedById ? { decidedById: dispute.decidedById } : {})
    };
  }

  private async partnerNames(): Promise<Map<string, string>> {
    const partners = (await this.deps.partners?.list()) ?? [];
    return new Map(partners.map((partner) => [partner.id, partner.tradeName ?? partner.legalName]));
  }

  /** Same rules as the invoicing admin routes: MFA, permission, then the country scope (null = every country). */
  private async assertAdmin(actor: ActorContext, permission: "billing:dispute_read" | "billing:dispute_decide", action: string): Promise<Set<string> | null> {
    if (actor.mfaVerified !== true) this.refuseAccess(actor, action, "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuseAccess(actor, action, "forbidden_role");
    if (actor.roles.includes("super_admin") || !actor.countryScopes?.length) return null;
    return new Set(resolveScopeCodes(actor.countryScopes, countryCatalog((await this.deps.countries?.listAdmin()) ?? [])));
  }

  private inScope(scope: Set<string> | null, countryCode: string | undefined): boolean {
    return scope === null || (countryCode !== undefined && scope.has(countryCode));
  }

  private assertInScope(actor: ActorContext, scope: Set<string> | null, dispute: LeadDisputeRecord, assignment: LeadAssignmentRecord | undefined, action: string): void {
    if (!this.inScope(scope, dispute.countryCode ?? assignment?.countryCode)) this.refuseAccess(actor, action, "out_of_scope_country", dispute.id);
  }

  /** Spec 060 FR-16: owner, manager and read-only brokers read billing; agents never do. */
  private assertBrokerReader(actor: ActorContext): string {
    const action = BillingAuditActions.accessRefused;
    if (actor.mfaVerified !== true) this.refuseAccess(actor, action, "mfa_required");
    if (!actor.partnerTenantId) this.refuseAccess(actor, action, "missing_broker_tenant");
    if (!actor.roles.some((role) => role.startsWith("broker_") && roleHasPermission(role, "billing:read_own"))) this.refuseAccess(actor, action, "forbidden_role");
    return actor.partnerTenantId;
  }

  private refuseAccess(actor: ActorContext, action: string, reason: string, targetId = "disputes"): never {
    this.audit(actor, action, targetId, "refused", reason, {});
    throw new BillingAccessRefusedError(reason);
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
