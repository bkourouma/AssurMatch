import { OFFER_AI_SUMMARY_DISCLAIMER, OFFER_AI_SUMMARY_LABEL, type OfferAiSummaryView } from "../../../../packages/shared/contracts/ai.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { AiAuditActions } from "../ai/core/ai-audit-actions";
import type { AiGatewayScope } from "../ai/core/ai-gateway.service";
import type { AiInteractionRecord } from "../ai/core/ai-interactions.repository";
import { offerForbidden, offerNotFound } from "./offer-errors";
import type { OfferRecord } from "./offers.module";

/** Minimal gateway surface used here (the real `AiGateway` satisfies it). */
export interface OfferAiSummaryGateway {
  isEnabled(assistType: "offer_summary", scope: AiGatewayScope): { enabled: boolean; reasons: string[] };
  listForTarget(targetType: string, targetId: string): Promise<AiInteractionRecord[]>;
}

export interface OfferAiSummaryDeps {
  offers: { find(id: string): Promise<OfferRecord | undefined> };
  gateway: OfferAiSummaryGateway;
  audit: AuditLogWriter;
  /** Optional: country/product AI flags of the offer scope (closed when a flag is provided and not true). */
  scopeFlags?: ((offer: OfferRecord) => Promise<Pick<AiGatewayScope, "countryId" | "countryFlags" | "productId" | "productFlags">>) | undefined;
}

/**
 * OFFER-010 / PRD §13: read-only access to the LAST AI summary of an offer that an administrator has
 * validated. Closed by default (feature flags). Nobody can trigger a generation from here: the
 * generation goes through `POST /admin/ai/insights/offer_summary`. A summary written before the last
 * offer change is withheld (it may no longer describe the offer). Reads are audited without the text.
 */
export class OfferAiSummaryService {
  constructor(private readonly deps: OfferAiSummaryDeps) {}

  async forAdmin(offerId: string, actor: ActorContext): Promise<OfferAiSummaryView> {
    if (actor.mfaVerified !== true) this.refuse(actor, offerId, "admin", "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "offers:read"))) this.refuse(actor, offerId, "admin", "forbidden_role");
    const offer = await this.deps.offers.find(offerId);
    if (!offer) throw offerNotFound();
    if (actor.countryScopes?.length && !actor.countryScopes.includes(offer.countryId)) this.refuse(actor, offerId, "admin", "out_of_scope_country");
    if (actor.productScopes?.length && !actor.productScopes.includes(offer.productId)) this.refuse(actor, offerId, "admin", "out_of_scope_product");
    return this.read(offer, actor, "admin", {});
  }

  async forBroker(offerId: string, actor: ActorContext): Promise<OfferAiSummaryView> {
    const isBroker = actor.roles.some((role) => role.startsWith("broker_"));
    if (!isBroker || !actor.partnerTenantId) this.refuse(actor, offerId, "broker", "missing_broker_tenant");
    if (actor.mfaVerified !== true) this.refuse(actor, offerId, "broker", "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "broker_offers:read"))) this.refuse(actor, offerId, "broker", "forbidden_role");
    const offer = await this.deps.offers.find(offerId);
    if (!offer || offer.partnerTenantId !== actor.partnerTenantId) {
      // Same answer as for a missing offer (spec 052 FR-008).
      this.audit(actor, offerId, "broker", "refused", { reason: offer ? "cross_tenant" : "offer_not_found" }, offer);
      throw offerNotFound();
    }
    return this.read(offer, actor, "broker", { partnerTenantId: actor.partnerTenantId, plan: actor.partnerPlan });
  }

  private async read(offer: OfferRecord, actor: ActorContext, audience: "admin" | "broker", base: AiGatewayScope): Promise<OfferAiSummaryView> {
    const flags = this.deps.scopeFlags ? await this.deps.scopeFlags(offer) : {};
    const access = this.deps.gateway.isEnabled("offer_summary", { ...base, ...flags });
    if (!access.enabled) {
      this.audit(actor, offer.id, audience, "success", { enabled: false, available: false }, offer);
      return this.view({ enabled: false, reasons: access.reasons, available: false });
    }
    const latest = (await this.deps.gateway.listForTarget("Offer", offer.id))
      .filter((record) => record.assistType === "offer_summary" && record.surface === "admin_platform" && record.status === "completed"
        && record.guardrailResult === "approved" && record.humanValidationStatus === "approved" && Boolean(record.outputText))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    if (!latest) {
      this.audit(actor, offer.id, audience, "success", { enabled: true, available: false }, offer);
      return this.view({ enabled: true, reasons: ["no_validated_summary"], available: false });
    }
    if (offer.updatedAt.getTime() > (latest.completedAt ?? latest.createdAt).getTime()) {
      this.audit(actor, offer.id, audience, "success", { enabled: true, available: false, interactionId: latest.id, stale: true }, offer);
      return this.view({ enabled: true, reasons: ["offer_modified_since_validation"], available: false });
    }
    this.audit(actor, offer.id, audience, "success", { enabled: true, available: true, interactionId: latest.id }, offer);
    return this.view({
      enabled: true,
      reasons: [],
      available: true,
      summary: latest.outputText as string,
      generatedAt: (latest.completedAt ?? latest.createdAt).toISOString(),
      validatedAt: latest.updatedAt.toISOString()
    });
  }

  private view(partial: Pick<OfferAiSummaryView, "enabled" | "reasons" | "available"> & Partial<OfferAiSummaryView>): OfferAiSummaryView {
    return { ...partial, label: OFFER_AI_SUMMARY_LABEL, disclaimer: OFFER_AI_SUMMARY_DISCLAIMER };
  }

  private audit(actor: ActorContext, offerId: string, audience: string, result: "success" | "refused", context: Record<string, unknown>, offer?: OfferRecord): void {
    this.deps.audit.write({
      actor,
      action: result === "refused" ? "offer.access_refused" : AiAuditActions.offerSummaryRead,
      targetType: "Offer",
      targetId: offerId,
      scope: { audience, partnerTenantId: actor.partnerTenantId ?? null, countryId: offer?.countryId ?? null, productId: offer?.productId ?? null },
      result,
      ...(typeof context.reason === "string" ? { reason: context.reason } : {}),
      context: { assistType: "offer_summary", ...context }
    });
  }

  private refuse(actor: ActorContext, offerId: string, audience: string, reason: string): never {
    this.deps.audit.write({
      actor,
      action: "offer.access_refused",
      targetType: "Offer",
      targetId: offerId,
      scope: { audience },
      result: "refused",
      reason,
      context: { assistType: "offer_summary" }
    });
    throw offerForbidden();
  }
}
