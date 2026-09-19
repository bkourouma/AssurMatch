import type { LeadPack, LeadPackGrant } from "../../../../packages/shared/contracts/billing.contracts";
import { leadPackGrantSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { PartnersService } from "../partners/partners.module";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "./billing-foundation.service";
import type { BillingRepository, LeadPackRecord } from "./billing.repository";

export interface LeadPacksDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  repository: BillingRepository;
}

/**
 * Prepaid lead credits (PRD §6.4 "Pack de leads"). Granting a pack records an internal credit only:
 * no payment is captured, no invoice is issued, and drafts consume credits before charging leads.
 */
export class LeadPacksService {
  constructor(private readonly deps: LeadPacksDeps) {}

  async list(actor: ActorContext, partnerId?: string): Promise<LeadPack[]> {
    this.assertAccess(actor, "read");
    return (await this.deps.repository.listPacks(partnerId)).map((record) => this.toDto(record));
  }

  async grant(input: LeadPackGrant, actor: ActorContext): Promise<LeadPack> {
    this.assertAccess(actor, "write");
    const parsed = leadPackGrantSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "LeadPack");
    const partner = (await this.deps.partners.list()).find((candidate) => candidate.id === parsed.partnerId);
    if (!partner) throw new Error("Partner not found");
    const now = new Date();
    const record: LeadPackRecord = {
      id: crypto.randomUUID(),
      partnerId: parsed.partnerId,
      creditsGranted: parsed.credits,
      creditsConsumed: 0,
      reason: parsed.reason,
      grantedById: actor.actorId ?? null,
      grantedAt: now,
      updatedAt: now
    };
    const saved = await this.deps.repository.createPack(record);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.packGranted,
      targetType: "LeadPack",
      targetId: saved.id,
      scope: { partnerId: saved.partnerId },
      result: "success",
      reason: parsed.reason,
      context: { credits: saved.creditsGranted, paymentCaptured: false }
    });
    return this.toDto(saved);
  }

  async remainingCredits(partnerId: string): Promise<number> {
    return (await this.deps.repository.listPacks(partnerId)).reduce((sum, pack) => sum + Math.max(0, pack.creditsGranted - pack.creditsConsumed), 0);
  }

  /** Consumes up to `units` credits oldest-pack-first; returns how many were actually applied. */
  async consume(partnerId: string, units: number, actor: ActorContext): Promise<number> {
    if (units <= 0) return 0;
    let remaining = units;
    let applied = 0;
    for (const pack of await this.deps.repository.listPacks(partnerId)) {
      if (remaining === 0) break;
      const available = Math.max(0, pack.creditsGranted - pack.creditsConsumed);
      if (available === 0) continue;
      const used = Math.min(available, remaining);
      await this.deps.repository.updatePackConsumption(pack.id, pack.creditsConsumed + used);
      remaining -= used;
      applied += used;
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.packConsumed,
        targetType: "LeadPack",
        targetId: pack.id,
        scope: { partnerId },
        result: "success",
        context: { used, remainingInPack: available - used }
      });
    }
    return applied;
  }

  private toDto(record: LeadPackRecord): LeadPack {
    return {
      id: record.id,
      partnerId: record.partnerId,
      creditsGranted: record.creditsGranted,
      creditsConsumed: record.creditsConsumed,
      creditsRemaining: Math.max(0, record.creditsGranted - record.creditsConsumed),
      reason: record.reason,
      grantedAt: record.grantedAt.toISOString()
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
      targetId: "packs",
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
      targetType: "LeadPack",
      targetId: "packs",
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: { paymentsEnabled: false }
    });
    throw new BillingAccessRefusedError(reason);
  }
}
