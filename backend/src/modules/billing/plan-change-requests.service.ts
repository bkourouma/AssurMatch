import type { BillingPlanKey } from "../../../../packages/shared/contracts/billing.contracts";
import {
  planChangeDecisionSchema,
  planChangeRequestCreateSchema,
  planChangeRequestQuerySchema,
  type PlanChangeRequest
} from "../../../../packages/shared/contracts/billing-plan-change.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { PartnersService } from "../partners/partners.module";
import { AdminCountryScope } from "./admin-country-scope";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError } from "./billing-foundation.service";
import type { InvoiceInAppPublisher } from "./invoicing.service";
import { PlanChangeConflictError, PlanChangeNotFoundError } from "./plan-change-errors";
import type { PlanChangeRequestRecord, PlanChangeRequestsRepository } from "./plan-change-requests.repository";

export interface PlanChangeRequestsDeps {
  audit: AuditLogWriter;
  partners: PartnersService;
  /** Admin country scope (finance admins limited to some countries). */
  countries?: CountriesService | undefined;
  repository: PlanChangeRequestsRepository;
  inApp?: InvoiceInAppPublisher | undefined;
  now?: (() => Date) | undefined;
}

const TARGET_TYPE = "PlanChangeRequest";

/** First day (UTC, 00:00) of the month following `at`; December rolls over to January. */
export function nextCycleStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/** Most recent acceptance first (by effectiveAt, then decision time). */
function byLatestAcceptance(left: PlanChangeRequestRecord, right: PlanChangeRequestRecord): number {
  return (right.effectiveAt?.getTime() ?? 0) - (left.effectiveAt?.getTime() ?? 0) || (right.decidedAt?.getTime() ?? 0) - (left.decidedAt?.getTime() ?? 0);
}

/**
 * Lot 5 (spec 071) G-06: a broker owner requests a plan change, an admin accepts or refuses it. No online
 * payment, and NO change of `PartnerTenant.plan`, roles or access rights: an accepted change is a billing
 * effect only, read by invoicing through `effectivePlan`, from the first day of the next monthly cycle.
 */
export class PlanChangeRequestsService {
  private readonly scope: AdminCountryScope | undefined;

  constructor(private readonly deps: PlanChangeRequestsDeps) {
    this.scope = deps.countries ? new AdminCountryScope({ countries: deps.countries, partners: deps.partners }) : undefined;
  }

  async create(actor: ActorContext, input: unknown): Promise<PlanChangeRequest> {
    const tenantId = this.assertBroker(actor, "create");
    const parsed = planChangeRequestCreateSchema.parse(input);
    const partner = await this.deps.partners.find(tenantId);
    if (!partner) this.refuse(actor, "create", tenantId, "partner_not_found", new PlanChangeNotFoundError("partner_not_found"));
    const now = this.now();
    const history = await this.deps.repository.listForPartner(tenantId);
    // The plan that will apply last: a change accepted but not yet effective counts as the baseline.
    const latestAccepted = history.filter((request) => request.status === "accepted" && request.effectiveAt !== null).sort(byLatestAcceptance)[0];
    const baseline = latestAccepted?.requestedPlan ?? partner.plan;
    if (parsed.requestedPlan === baseline) {
      this.refuse(actor, "create", tenantId, "same_plan", new PlanChangeConflictError("same_plan"), { requestedPlan: parsed.requestedPlan });
    }
    if (history.some((request) => request.status === "pending")) {
      this.refuse(actor, "create", tenantId, "pending_request_exists", new PlanChangeConflictError("pending_request_exists"));
    }
    const record: PlanChangeRequestRecord = {
      id: crypto.randomUUID(),
      partnerTenantId: tenantId,
      currentPlan: this.effectiveFrom(history, partner.plan, now),
      requestedPlan: parsed.requestedPlan,
      status: "pending",
      justification: parsed.justification,
      requestedById: actor.actorId ?? null,
      decidedById: null,
      decidedAt: null,
      decisionReason: null,
      effectiveAt: null,
      createdAt: now,
      updatedAt: now
    };
    let saved: PlanChangeRequestRecord;
    try {
      saved = await this.deps.repository.create(record);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        this.refuse(actor, "create", tenantId, "pending_request_exists", new PlanChangeConflictError("pending_request_exists"));
      }
      throw error;
    }
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.planChangeRequested,
      targetType: TARGET_TYPE,
      targetId: saved.id,
      scope: { partnerTenantId: tenantId },
      result: "success",
      reason: saved.justification,
      context: { currentPlan: saved.currentPlan, requestedPlan: saved.requestedPlan, paymentCaptured: false }
    });
    return this.toView(saved, partner.legalName);
  }

  async listOwn(actor: ActorContext): Promise<PlanChangeRequest[]> {
    const tenantId = this.assertBroker(actor, "list");
    const partner = await this.deps.partners.find(tenantId);
    return (await this.deps.repository.listForPartner(tenantId)).map((record) => this.toView(record, partner?.legalName ?? null));
  }

  async cancel(actor: ActorContext, id: string): Promise<PlanChangeRequest> {
    const tenantId = this.assertBroker(actor, "cancel");
    const request = await this.deps.repository.find(id);
    // Another tenant's request is reported as unknown so its existence does not leak.
    if (!request || request.partnerTenantId !== tenantId) {
      this.refuse(actor, "cancel", id, "request_not_found", new PlanChangeNotFoundError("request_not_found"));
    }
    if (request.status !== "pending") {
      this.refuse(actor, "cancel", id, "request_not_pending", new PlanChangeConflictError("request_not_pending"), { status: request.status });
    }
    const closed = await this.deps.repository.decide(id, { status: "cancelled", decidedById: actor.actorId ?? null, decidedAt: this.now(), decisionReason: null, effectiveAt: null });
    if (!closed) this.refuse(actor, "cancel", id, "request_not_pending", new PlanChangeConflictError("request_not_pending"));
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.planChangeCancelled,
      targetType: TARGET_TYPE,
      targetId: id,
      scope: { partnerTenantId: tenantId },
      result: "success",
      context: { before: { status: "pending" }, after: { status: "cancelled" }, requestedPlan: closed.requestedPlan }
    });
    const partner = await this.deps.partners.find(tenantId);
    return this.toView(closed, partner?.legalName ?? null);
  }

  async list(actor: ActorContext, query: unknown = {}): Promise<{ items: PlanChangeRequest[]; total: number }> {
    this.assertAdmin(actor, "list");
    const filter = planChangeRequestQuerySchema.parse(query ?? {});
    const adminScope = (await this.scope?.of(actor)) ?? null;
    const all = await this.deps.repository.listAll(filter);
    // A country-scoped admin only lists the requests of brokers of its countries.
    const records: typeof all = [];
    for (const record of all) {
      if (!this.scope || (await this.scope.partnerInScope(adminScope, record.partnerTenantId))) records.push(record);
    }
    const names = new Map<string, string | null>();
    for (const record of records) {
      if (!names.has(record.partnerTenantId)) {
        names.set(record.partnerTenantId, (await this.deps.partners.find(record.partnerTenantId))?.legalName ?? null);
      }
    }
    // Pending first, then newest first (the repository already sorts newest first and the sort is stable).
    const items = records
      .map((record) => this.toView(record, names.get(record.partnerTenantId) ?? null))
      .sort((left, right) => Number(right.status === "pending") - Number(left.status === "pending"));
    return { items, total: items.length };
  }

  async decide(actor: ActorContext, id: string, input: unknown): Promise<PlanChangeRequest> {
    this.assertAdmin(actor, "decide", id);
    const { decision, reason } = planChangeDecisionSchema.parse(input);
    const request = await this.deps.repository.find(id);
    if (!request) this.refuse(actor, "decide", id, "request_not_found", new PlanChangeNotFoundError("request_not_found"));
    if (this.scope && !(await this.scope.partnerInScope(await this.scope.of(actor), request.partnerTenantId))) {
      this.refuse(actor, "decide", id, "out_of_scope_country", new BillingAccessRefusedError("out_of_scope_country"));
    }
    if (request.status !== "pending") {
      this.refuse(actor, "decide", id, "request_not_pending", new PlanChangeConflictError("request_not_pending"), { status: request.status, decision });
    }
    const now = this.now();
    const accepted = decision === "accept";
    const closed = await this.deps.repository.decide(id, {
      status: accepted ? "accepted" : "refused",
      decidedById: actor.actorId ?? null,
      decidedAt: now,
      decisionReason: reason,
      effectiveAt: accepted ? nextCycleStart(now) : null
    });
    if (!closed) this.refuse(actor, "decide", id, "request_not_pending", new PlanChangeConflictError("request_not_pending"), { decision });
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.planChangeDecided,
      targetType: TARGET_TYPE,
      targetId: id,
      scope: { partnerTenantId: closed.partnerTenantId },
      result: "success",
      reason,
      context: {
        decision,
        before: { status: "pending", plan: closed.currentPlan },
        after: { status: closed.status, plan: accepted ? closed.requestedPlan : closed.currentPlan, effectiveAt: closed.effectiveAt?.toISOString() ?? null },
        requestedPlan: closed.requestedPlan
      }
    });
    const partner = await this.deps.partners.find(closed.partnerTenantId);
    await this.notifyBroker(actor, closed, accepted);
    return this.toView(closed, partner?.legalName ?? null);
  }

  /**
   * Billing read port: the plan to price `partnerId` with at `at` = the requested plan of the most recent
   * accepted request whose effectiveAt <= at, else `currentPlan`. Not audited and without permission check
   * (called by the billing services, which authorize their own callers).
   */
  async effectivePlan(partnerId: string, currentPlan: BillingPlanKey, at: Date): Promise<BillingPlanKey> {
    return this.effectiveFrom(await this.deps.repository.listForPartner(partnerId), currentPlan, at);
  }

  private effectiveFrom(history: PlanChangeRequestRecord[], currentPlan: BillingPlanKey, at: Date): BillingPlanKey {
    const applied = history
      .filter((request) => request.status === "accepted" && request.effectiveAt !== null && request.effectiveAt.getTime() <= at.getTime())
      .sort(byLatestAcceptance)[0];
    return applied?.requestedPlan ?? currentPlan;
  }

  private async notifyBroker(actor: ActorContext, request: PlanChangeRequestRecord, accepted: boolean): Promise<void> {
    if (!this.deps.inApp) return;
    const effective = request.effectiveAt?.toISOString().slice(0, 10);
    const template = accepted ? "plan_change_accepted" : "plan_change_refused";
    try {
      await this.deps.inApp.publishInApp({
        scopeId: request.partnerTenantId,
        template,
        title: accepted ? "Changement de plan accepte" : "Changement de plan refuse",
        body: accepted
          ? `Votre passage au plan ${request.requestedPlan} est accepte. Il s'appliquera a la facturation a partir du ${effective}.`
          : `Votre demande de passage au plan ${request.requestedPlan} est refusee. Motif: ${request.decisionReason ?? ""}`,
        targetType: TARGET_TYPE,
        targetId: request.id
      });
    } catch (error) {
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.invoiceNotificationFailed,
        targetType: TARGET_TYPE,
        targetId: request.id,
        scope: { partnerTenantId: request.partnerTenantId },
        result: "failed",
        reason: "broker_notice_failed",
        context: { template, error: error instanceof Error ? error.name : "unknown" }
      });
    }
  }

  private toView(record: PlanChangeRequestRecord, partnerName: string | null): PlanChangeRequest {
    return {
      id: record.id,
      partnerId: record.partnerTenantId,
      partnerName,
      currentPlan: record.currentPlan,
      requestedPlan: record.requestedPlan,
      status: record.status,
      justification: record.justification,
      requestedAt: record.createdAt.toISOString(),
      decidedAt: record.decidedAt?.toISOString() ?? null,
      decisionReason: record.decisionReason,
      effectiveAt: record.effectiveAt?.toISOString() ?? null
    };
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Tenant side: MFA, a tenant actor and `billing:plan_change_request`. Returns the actor's own tenant. */
  private assertBroker(actor: ActorContext, operation: string): string {
    const tenantId = actor.partnerTenantId;
    if (actor.mfaVerified !== true) this.refuse(actor, operation, tenantId ?? "plan-change", "mfa_required", new BillingAccessRefusedError("mfa_required"));
    if (!tenantId) this.refuse(actor, operation, "plan-change", "tenant_required", new BillingAccessRefusedError("tenant_required"));
    if (!actor.roles.some((role) => roleHasPermission(role, "billing:plan_change_request"))) {
      this.refuse(actor, operation, tenantId, "forbidden_role", new BillingAccessRefusedError("forbidden_role"));
    }
    return tenantId;
  }

  /** Admin side: MFA, no tenant context and `billing:plan_manage`. */
  private assertAdmin(actor: ActorContext, operation: string, targetId = "plan-change"): void {
    if (actor.mfaVerified !== true) this.refuse(actor, operation, targetId, "mfa_required", new BillingAccessRefusedError("mfa_required"));
    if (actor.partnerTenantId || !actor.roles.some((role) => roleHasPermission(role, "billing:plan_manage"))) {
      this.refuse(actor, operation, targetId, "forbidden_role", new BillingAccessRefusedError("forbidden_role"));
    }
  }

  private refuse(actor: ActorContext, operation: string, targetId: string, reason: string, error: Error, context: Record<string, unknown> = {}): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.planChangeRefused,
      targetType: TARGET_TYPE,
      targetId,
      scope: actor.partnerTenantId ? { partnerTenantId: actor.partnerTenantId } : { roles: actor.roles },
      result: "refused",
      reason,
      context: { operation, ...context }
    });
    throw error;
  }
}
