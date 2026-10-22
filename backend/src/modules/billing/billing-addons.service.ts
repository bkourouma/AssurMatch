import type { BillingAddOnPrice, BillingAddOnPriceUpsert, PartnerAddOn, PartnerAddOnAssign } from "../../../../packages/shared/contracts/billing-addons.contracts";
import { billingAddOnPriceUpsertSchema, partnerAddOnAssignSchema, partnerAddOnEndSchema } from "../../../../packages/shared/contracts/billing-addons.contracts";
import type { BillingPlanKey } from "../../../../packages/shared/contracts/billing.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { PartnersService } from "../partners/partners.module";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "./billing-foundation.service";
import { AdminCountryScope } from "./admin-country-scope";
import type { BillingAddOnPriceRecord, BillingRepository, PartnerAddOnRecord } from "./billing.repository";

/** The add-on or the partner does not exist (HTTP 404). */
export class BillingAddOnNotFoundError extends Error {
  constructor(public readonly reason: string) {
    super(`Billing add-on not found: ${reason}`);
    this.name = "BillingAddOnNotFoundError";
  }
}

/** A business rule refuses the assignment (HTTP 409): no enabled price, or the kind is already assigned. */
export class BillingAddOnConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Billing add-on conflict: ${reason}`);
    this.name = "BillingAddOnConflictError";
  }
}

export interface BillingAddOnsDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  countries: CountriesService;
  partners: PartnersService;
  repository: BillingRepository;
  /** G-06: plan effective now (a plan change is effective next cycle). Absent: the partner's current plan. */
  effectivePlan?: ((partnerId: string, currentPlan: BillingPlanKey, at: Date) => Promise<BillingPlanKey>) | undefined;
  now?: (() => Date) | undefined;
}

/**
 * Lot 5 (spec 071) H4: optional monthly add-ons (API, white label, AI). Prices are DISABLED by default and
 * only an enabled price per kind, plan and country makes an add-on billable. Finance assigns an add-on to
 * one broker (audited); the monthly draft then carries an `add_on` line. Nothing is ever collected online.
 */
export class BillingAddOnsService {
  private readonly scope: AdminCountryScope;

  constructor(private readonly deps: BillingAddOnsDeps) {
    this.scope = new AdminCountryScope({ countries: deps.countries, partners: deps.partners });
  }

  async listPrices(actor: ActorContext): Promise<BillingAddOnPrice[]> {
    this.assertAccess(actor, "read");
    const adminScope = await this.scope.of(actor);
    return (await this.deps.repository.listAddOnPrices()).filter((record) => adminScope === null || adminScope.has(record.countryCode)).map((record) => this.priceDto(record));
  }

  async upsertPrice(input: BillingAddOnPriceUpsert, actor: ActorContext): Promise<BillingAddOnPrice> {
    this.assertAccess(actor, "write");
    const parsed = billingAddOnPriceUpsertSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "BillingAddOnPrice");
    const priceScope = await this.scope.of(actor);
    if (priceScope !== null && !priceScope.has(parsed.countryCode)) this.refuseAccess(actor, "out_of_scope_country");
    const country = await this.deps.countries.findByIsoCode(parsed.countryCode);
    if (!country) throw new BillingAddOnNotFoundError("country_not_found");
    const existing = (await this.deps.repository.listAddOnPrices()).find((price) => price.kind === parsed.kind && price.plan === parsed.plan && price.countryCode === parsed.countryCode);
    const now = this.now();
    const saved = await this.deps.repository.upsertAddOnPrice({
      id: existing?.id ?? crypto.randomUUID(),
      kind: parsed.kind,
      plan: parsed.plan,
      countryCode: parsed.countryCode,
      monthlyAmount: parsed.monthlyAmount,
      enabled: parsed.enabled,
      currency: "XOF",
      reason: parsed.reason,
      updatedById: actor.actorId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnPriceChanged,
      targetType: "BillingAddOnPrice",
      targetId: saved.id,
      scope: { kind: saved.kind, plan: saved.plan, countryCode: saved.countryCode },
      result: "success",
      reason: parsed.reason,
      context: {
        previous: existing ? { monthlyAmount: existing.monthlyAmount, enabled: existing.enabled } : null,
        next: { monthlyAmount: saved.monthlyAmount, enabled: saved.enabled },
        paymentsEnabled: false
      }
    });
    return this.priceDto(saved);
  }

  async list(actor: ActorContext, partnerId?: string): Promise<PartnerAddOn[]> {
    this.assertAccess(actor, "read");
    const adminScope = await this.scope.of(actor);
    if (partnerId && !(await this.scope.partnerInScope(adminScope, partnerId))) this.refuseAccess(actor, "out_of_scope_country");
    const records: PartnerAddOnRecord[] = [];
    for (const record of await this.deps.repository.listPartnerAddOns(partnerId)) {
      if (await this.scope.partnerInScope(adminScope, record.partnerId)) records.push(record);
    }
    return records.map((record) => this.addOnDto(record));
  }

  async assign(input: PartnerAddOnAssign, actor: ActorContext): Promise<PartnerAddOn> {
    this.assertAccess(actor, "write");
    const parsed = partnerAddOnAssignSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "PartnerAddOn");
    const partner = await this.deps.partners.find(parsed.partnerId);
    if (!partner) return this.refuseAssignment(actor, parsed, "partner_not_found", new BillingAddOnNotFoundError("partner_not_found"));
    if (!(await this.scope.partnerInScope(await this.scope.of(actor), partner.id))) return this.refuseAssignment(actor, parsed, "out_of_scope_country", new BillingAccessRefusedError("out_of_scope_country"));
    const now = this.now();
    const currentPlan = partner.plan as BillingPlanKey;
    const plan = (await this.deps.effectivePlan?.(partner.id, currentPlan, now)) ?? currentPlan;
    // Same default country as the monthly draft when the broker has no country yet.
    const country = partner.countryId ? (await this.deps.countries.listAdmin()).find((candidate) => candidate.id === partner.countryId) : undefined;
    const countryCode = country?.isoCode ?? "CI";
    const price = (await this.deps.repository.listAddOnPrices()).find((candidate) => candidate.kind === parsed.kind && candidate.plan === plan && candidate.countryCode === countryCode && candidate.enabled);
    if (!price) return this.refuseAssignment(actor, parsed, "no_enabled_price", new BillingAddOnConflictError("no_enabled_price"), { plan, countryCode });
    const active = (await this.deps.repository.listPartnerAddOns(partner.id)).find((addOn) => addOn.kind === parsed.kind && addOn.status === "active");
    if (active) return this.refuseAssignment(actor, parsed, "already_assigned", new BillingAddOnConflictError("already_assigned"), { plan, countryCode });
    const saved = await this.deps.repository.createPartnerAddOn({
      id: crypto.randomUUID(),
      partnerId: partner.id,
      kind: parsed.kind,
      status: "active",
      reason: parsed.reason,
      assignedById: actor.actorId ?? null,
      endedById: null,
      endedAt: null,
      createdAt: now,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnAssigned,
      targetType: "PartnerAddOn",
      targetId: saved.id,
      scope: { partnerId: partner.id, kind: saved.kind, plan, countryCode },
      result: "success",
      reason: parsed.reason,
      context: { monthlyAmount: price.monthlyAmount, paymentsEnabled: false }
    });
    return this.addOnDto(saved);
  }

  async end(id: string, input: { reason: string }, actor: ActorContext): Promise<PartnerAddOn> {
    this.assertAccess(actor, "write");
    const parsed = partnerAddOnEndSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "PartnerAddOn");
    const existing = (await this.deps.repository.listPartnerAddOns()).find((addOn) => addOn.id === id);
    if (!existing) this.refuseEnd(actor, id, "add_on_not_found", new BillingAddOnNotFoundError("add_on_not_found"));
    if (!(await this.scope.partnerInScope(await this.scope.of(actor), existing.partnerId))) this.refuseEnd(actor, id, "out_of_scope_country", new BillingAccessRefusedError("out_of_scope_country"), existing.partnerId);
    if (existing.status !== "active") this.refuseEnd(actor, id, "already_ended", new BillingAddOnConflictError("already_ended"), existing.partnerId);
    const saved = await this.deps.repository.updatePartnerAddOn(id, { status: "ended", endedAt: this.now(), endedById: actor.actorId ?? null });
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnEnded,
      targetType: "PartnerAddOn",
      targetId: saved.id,
      scope: { partnerId: saved.partnerId, kind: saved.kind },
      result: "success",
      reason: parsed.reason,
      context: { assignedAt: saved.createdAt.toISOString(), paymentsEnabled: false }
    });
    return this.addOnDto(saved);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private priceDto(record: BillingAddOnPriceRecord): BillingAddOnPrice {
    return {
      id: record.id,
      kind: record.kind,
      plan: record.plan,
      countryCode: record.countryCode,
      monthlyAmount: record.monthlyAmount,
      enabled: record.enabled,
      currency: "XOF",
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private addOnDto(record: PartnerAddOnRecord): PartnerAddOn {
    return {
      id: record.id,
      partnerId: record.partnerId,
      kind: record.kind,
      status: record.status,
      reason: record.reason,
      assignedAt: record.createdAt.toISOString(),
      endedAt: record.endedAt ? record.endedAt.toISOString() : null
    };
  }

  private assertAccess(actor: ActorContext, mode: "read" | "write"): void {
    if (actor.mfaVerified !== true) this.refuseAccess(actor, "mfa_required");
    const permission = mode === "write" ? "billing:plan_manage" : "billing:read";
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuseAccess(actor, "forbidden_role");
  }

  private refuseAssignment(actor: ActorContext, input: { partnerId: string; kind: string; reason: string }, reason: string, error: Error, extra: Record<string, unknown> = {}): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnRefused,
      targetType: "PartnerAddOn",
      targetId: input.partnerId,
      scope: { partnerId: input.partnerId, kind: input.kind, ...extra },
      result: "refused",
      reason,
      context: { requestedReason: input.reason, paymentsEnabled: false }
    });
    throw error;
  }

  private refuseEnd(actor: ActorContext, id: string, reason: string, error: Error, partnerId?: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnRefused,
      targetType: "PartnerAddOn",
      targetId: id,
      scope: { partnerId: partnerId ?? null },
      result: "refused",
      reason,
      context: { operation: "end", paymentsEnabled: false }
    });
    throw error;
  }

  private refuseDisabled(actor: ActorContext, targetType: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accessRefused,
      targetType,
      targetId: "add_ons",
      scope: { roles: actor.roles },
      result: "refused",
      reason: "billing_disabled",
      context: { paymentsEnabled: false }
    });
    throw new BillingDisabledError("billing_disabled");
  }

  private refuseAccess(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.addOnRefused,
      targetType: "PartnerAddOn",
      targetId: "add_ons",
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: { paymentsEnabled: false }
    });
    throw new BillingAccessRefusedError(reason);
  }
}
