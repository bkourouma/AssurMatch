import type { PartnerSubscription, PartnerSubscriptionUpdate } from "../../../../packages/shared/contracts/billing-addons.contracts";
import { partnerSubscriptionUpdateSchema } from "../../../../packages/shared/contracts/billing-addons.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { PartnersService } from "../partners/partners.module";
import { AdminCountryScope } from "./admin-country-scope";
import type { PartnerCommercialState } from "../routing/routing-controls.ports";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError } from "./billing-foundation.service";
import { BillingAddOnNotFoundError } from "./billing-addons.service";
import type { BillingRepository, PartnerSubscriptionRecord } from "./billing.repository";

export interface PartnerSubscriptionsDeps {
  audit: AuditLogWriter;
  partners: PartnersService;
  countries?: CountriesService | undefined;
  repository: BillingRepository;
  now?: (() => Date) | undefined;
}

/**
 * Lot 5 (spec 071): commercial state of a broker (active, suspended, cancelled) and end of its contract
 * validity window, set by finance. It feeds routing controls 9 and 11. Updating it is NOT gated by
 * `billing_enabled` because it protects routing; a broker without a row is active without expiry.
 */
export class PartnerSubscriptionsService {
  private readonly scope: AdminCountryScope | undefined;

  constructor(private readonly deps: PartnerSubscriptionsDeps) {
    this.scope = deps.countries ? new AdminCountryScope({ countries: deps.countries, partners: deps.partners }) : undefined;
  }

  async get(actor: ActorContext, partnerId: string): Promise<PartnerSubscription> {
    this.assertAccess(actor, "read");
    await this.assertInScope(actor, partnerId);
    return this.toDto(partnerId, await this.deps.repository.getSubscription(partnerId));
  }

  async update(actor: ActorContext, partnerId: string, input: PartnerSubscriptionUpdate): Promise<PartnerSubscription> {
    this.assertAccess(actor, "write");
    const parsed = partnerSubscriptionUpdateSchema.parse(input);
    const partner = await this.deps.partners.find(partnerId);
    if (!partner) {
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.subscriptionRefused,
        targetType: "PartnerSubscription",
        targetId: partnerId,
        scope: { partnerId },
        result: "refused",
        reason: "partner_not_found",
        context: { requestedStatus: parsed.status }
      });
      throw new BillingAddOnNotFoundError("partner_not_found");
    }
    await this.assertInScope(actor, partnerId);
    const existing = await this.deps.repository.getSubscription(partnerId);
    const now = this.now();
    // contractExpiresAt: omitted keeps the stored value, null clears it, a date sets it (end of that UTC day).
    const contractExpiresAt = parsed.contractExpiresAt === undefined
      ? existing?.contractExpiresAt ?? null
      : parsed.contractExpiresAt === null ? null : new Date(`${parsed.contractExpiresAt}T23:59:59.999Z`);
    const saved = await this.deps.repository.upsertSubscription({
      partnerId,
      status: parsed.status,
      contractExpiresAt,
      reason: parsed.reason,
      updatedById: actor.actorId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.subscriptionChanged,
      targetType: "PartnerSubscription",
      targetId: partnerId,
      scope: { partnerId },
      result: "success",
      reason: parsed.reason,
      context: {
        previous: { status: existing?.status ?? "active", contractExpiresAt: existing?.contractExpiresAt?.toISOString() ?? null },
        next: { status: saved.status, contractExpiresAt: saved.contractExpiresAt?.toISOString() ?? null }
      }
    });
    return this.toDto(partnerId, saved);
  }

  /**
   * System read for routing controls 9 and 11 (no actor, NO audit: it runs at every submission).
   * No row means an active subscription without expiry so legacy brokers keep routing.
   */
  async commercialState(partnerId: string): Promise<PartnerCommercialState> {
    const row = await this.deps.repository.getSubscription(partnerId);
    return { subscriptionStatus: row?.status ?? "active", contractExpiresAt: row?.contractExpiresAt ?? null };
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private toDto(partnerId: string, record: PartnerSubscriptionRecord | undefined): PartnerSubscription {
    return {
      partnerId,
      status: record?.status ?? "active",
      contractExpiresAt: record?.contractExpiresAt ? record.contractExpiresAt.toISOString().slice(0, 10) : null,
      reason: record?.reason ?? null,
      updatedAt: record ? record.updatedAt.toISOString() : null
    };
  }

  private async assertInScope(actor: ActorContext, partnerId: string): Promise<void> {
    if (!this.scope) return;
    if (!(await this.scope.partnerInScope(await this.scope.of(actor), partnerId))) this.refuse(actor, "out_of_scope_country");
  }

  private assertAccess(actor: ActorContext, mode: "read" | "write"): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    const permission = mode === "write" ? "billing:plan_manage" : "billing:read";
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "forbidden_role");
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.subscriptionRefused,
      targetType: "PartnerSubscription",
      targetId: "subscriptions",
      scope: { roles: actor.roles },
      result: "refused",
      reason
    });
    throw new BillingAccessRefusedError(reason);
  }
}
