import type { BillingPlanPrice, BillingPlanPriceUpsert } from "../../../../packages/shared/contracts/billing.contracts";
import { billingPlanPriceUpsertSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "./billing-foundation.service";
import type { BillingPlanPriceRecord, BillingRepository } from "./billing.repository";

export interface BillingPlansDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  countries: CountriesService;
  repository: BillingRepository;
}

/** Plan pricing per country and plan. Prices drive draft totals only; nothing is ever collected. */
export class BillingPlansService {
  constructor(private readonly deps: BillingPlansDeps) {}

  async list(actor: ActorContext): Promise<BillingPlanPrice[]> {
    this.assertAccess(actor, "read");
    return (await this.deps.repository.listPlanPrices()).map((record) => this.toDto(record));
  }

  async upsert(input: BillingPlanPriceUpsert, actor: ActorContext): Promise<BillingPlanPrice> {
    this.assertAccess(actor, "write");
    const parsed = billingPlanPriceUpsertSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "BillingPlanPrice");
    const country = await this.deps.countries.findByIsoCode(parsed.countryCode);
    if (!country) throw new Error("Country not found");
    const existing = (await this.deps.repository.listPlanPrices()).find((price) => price.plan === parsed.plan && price.countryCode === parsed.countryCode);
    const now = new Date();
    const record: BillingPlanPriceRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      plan: parsed.plan,
      countryCode: parsed.countryCode,
      monthlySubscription: parsed.monthlySubscription,
      perLeadPrice: parsed.perLeadPrice,
      sharedLeadPriceMultiplier: parsed.sharedLeadPriceMultiplier,
      setupFee: parsed.setupFee,
      currency: "XOF",
      reason: parsed.reason,
      updatedById: actor.actorId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const saved = await this.deps.repository.upsertPlanPrice(record);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.planPriceChanged,
      targetType: "BillingPlanPrice",
      targetId: saved.id,
      scope: { plan: saved.plan, countryCode: saved.countryCode },
      result: "success",
      reason: parsed.reason,
      context: {
        previous: existing ? { monthlySubscription: existing.monthlySubscription, perLeadPrice: existing.perLeadPrice, setupFee: existing.setupFee } : null,
        next: { monthlySubscription: saved.monthlySubscription, perLeadPrice: saved.perLeadPrice, setupFee: saved.setupFee },
        paymentsEnabled: false
      }
    });
    return this.toDto(saved);
  }

  private toDto(record: BillingPlanPriceRecord): BillingPlanPrice {
    return {
      id: record.id,
      plan: record.plan,
      countryCode: record.countryCode,
      monthlySubscription: record.monthlySubscription,
      perLeadPrice: record.perLeadPrice,
      sharedLeadPriceMultiplier: record.sharedLeadPriceMultiplier,
      setupFee: record.setupFee,
      currency: "XOF",
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private assertAccess(actor: ActorContext, mode: "read" | "write"): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    const permission = mode === "write" ? "billing:*" : "billing:read";
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "forbidden_role");
  }

  private refuseDisabled(actor: ActorContext, targetType: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accessRefused,
      targetType,
      targetId: "plans",
      scope: { roles: actor.roles },
      result: "refused",
      reason: "billing_disabled",
      context: { paymentsEnabled: false }
    });
    throw new BillingDisabledError("billing_disabled");
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accessRefused,
      targetType: "BillingPlanPrice",
      targetId: "plans",
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: { paymentsEnabled: false }
    });
    throw new BillingAccessRefusedError(reason);
  }
}
