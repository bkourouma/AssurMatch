import {
  OFFER_SPONSORSHIP_KEYS,
  brokerOfferCreateSchema,
  brokerOfferListQuerySchema,
  brokerOfferUpdateSchema,
  offerRenewSchema,
  offerSubmitSchema,
  offerWithdrawSchema,
  type BrokerOfferView,
  type OfferVersionView
} from "../../../../packages/shared/contracts/offer-content";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { contentFromInput, parseOfferInput } from "./offer-admin.service";
import { OfferErrorCodes, offerForbidden, offerNotFound, offerUnprocessable } from "./offer-errors";
import { OfferAuditActions, type OfferLifecycleService } from "./offer-lifecycle.service";
import { effectiveOfferStatus, publishedVersion, pendingVersion, toBrokerOfferView, toVersionView } from "./offer-views";
import type { OfferRecord } from "./offers.module";
import type { OffersRepository } from "./offers.repository";

const DEFAULT_BROKER_REASON = "Gestion de l'offre par le courtier";

/** Platform user ids (author, decider) are not shown to the broker. */
function stripVersion(version: OfferVersionView): OfferVersionView {
  const copy: Partial<OfferVersionView> = { ...version };
  delete copy.decidedById;
  delete copy.authorId;
  return copy as OfferVersionView;
}

function brokerSafe(view: BrokerOfferView): BrokerOfferView {
  const copy: BrokerOfferView = { ...view };
  if (copy.published) copy.published = stripVersion(copy.published);
  if (copy.pending) copy.pending = stripVersion(copy.pending);
  if (copy.versions) copy.versions = copy.versions.map(stripVersion);
  return copy;
}

/**
 * Spec 052 US1/US3 (R5): a broker manages the offers of its own partner only. Owners and managers
 * write (`broker_offers:write`), agents and read-only users read. Another partner's offer is
 * answered "not found" (FR-008); writes are only possible on a scope covered by a valid licence and
 * active authorisations (FR-007). The suspended-partner guard runs in the HTTP layer before this.
 */
export class BrokerOffersService {
  constructor(
    private readonly repository: OffersRepository,
    private readonly lifecycle: OfferLifecycleService,
    private readonly audit: AuditLogWriter
  ) {}

  async list(query: unknown, actor: ActorContext): Promise<BrokerOfferView[]> {
    const partnerTenantId = this.requireBroker(actor, "broker_offers:read", "list");
    const parsed = parseOfferInput(brokerOfferListQuerySchema, query ?? {});
    const now = new Date();
    const own = (await this.repository.list()).filter((offer) => offer.partnerTenantId === partnerTenantId);
    await this.lifecycle.notifyExpiring(own, now);
    const views: BrokerOfferView[] = [];
    for (const offer of own) {
      if (parsed.countryId && offer.countryId !== parsed.countryId) continue;
      if (parsed.productId && offer.productId !== parsed.productId) continue;
      const versions = await this.lifecycle.versions(offer);
      if (parsed.status && effectiveOfferStatus(offer, versions, now) !== parsed.status) continue;
      views.push(toBrokerOfferView(offer, versions, { suspensionReason: await this.lifecycle.suspensionReason(offer) }, now));
    }
    return views.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(brokerSafe);
  }

  async detail(id: string, actor: ActorContext): Promise<BrokerOfferView> {
    this.requireBroker(actor, "broker_offers:read", "detail");
    const offer = await this.requireOwn(id, actor, "detail");
    return this.view(offer);
  }

  async create(input: unknown, actor: ActorContext): Promise<BrokerOfferView> {
    const partnerTenantId = this.requireBroker(actor, "broker_offers:write", "create");
    this.refuseSponsorship(input, actor, undefined);
    await this.requireActivePartner(partnerTenantId, actor);
    const parsed = parseOfferInput(brokerOfferCreateSchema, input);
    await this.assertCoverage(actor, partnerTenantId, parsed.countryId, parsed.productId);
    const { offer } = await this.lifecycle.create({
      countryId: parsed.countryId,
      productId: parsed.productId,
      partnerTenantId,
      offerType: "indicative",
      content: contentFromInput(parsed, { isSponsored: false })
    }, actor, "broker", parsed.reason ?? DEFAULT_BROKER_REASON);
    return this.view(offer);
  }

  async update(id: string, input: unknown, actor: ActorContext): Promise<BrokerOfferView> {
    const partnerTenantId = this.requireBroker(actor, "broker_offers:write", "update");
    const offer = await this.requireOwn(id, actor, "update");
    this.refuseSponsorship(input, actor, offer);
    const parsed = parseOfferInput(brokerOfferUpdateSchema, input);
    await this.assertCoverage(actor, partnerTenantId, offer.countryId, offer.productId, offer);
    // Sponsorship is admin-only (FR-013): a broker version keeps the sponsorship of its base.
    const versions = await this.lifecycle.versions(offer);
    const base = pendingVersion(offer, versions) ?? publishedVersion(offer, versions);
    const content = contentFromInput(parsed, {
      isSponsored: base?.isSponsored ?? false,
      sponsorLabel: base?.sponsorLabel,
      displayPriority: base?.displayPriority
    });
    await this.lifecycle.saveContent(offer, content, { actor, authorRole: "broker", reason: parsed.reason ?? DEFAULT_BROKER_REASON, expectedUpdatedAt: parsed.expectedUpdatedAt });
    return this.view(offer);
  }

  async submit(id: string, input: unknown, actor: ActorContext): Promise<BrokerOfferView> {
    const partnerTenantId = this.requireBroker(actor, "broker_offers:write", "submit");
    const offer = await this.requireOwn(id, actor, "submit");
    const parsed = parseOfferInput(offerSubmitSchema, input ?? {});
    await this.assertCoverage(actor, partnerTenantId, offer.countryId, offer.productId, offer);
    await this.lifecycle.submit(offer, actor, parsed.reason ?? DEFAULT_BROKER_REASON);
    return this.view(offer);
  }

  async withdraw(id: string, input: unknown, actor: ActorContext): Promise<BrokerOfferView> {
    this.requireBroker(actor, "broker_offers:write", "withdraw");
    const offer = await this.requireOwn(id, actor, "withdraw");
    const parsed = parseOfferInput(offerWithdrawSchema, input ?? {});
    await this.lifecycle.withdraw(offer, actor, parsed.reason, parsed.target);
    return this.view(offer);
  }

  async renew(id: string, input: unknown, actor: ActorContext): Promise<BrokerOfferView> {
    const partnerTenantId = this.requireBroker(actor, "broker_offers:write", "renew");
    const offer = await this.requireOwn(id, actor, "renew");
    const parsed = parseOfferInput(offerRenewSchema, input ?? {});
    await this.assertCoverage(actor, partnerTenantId, offer.countryId, offer.productId, offer);
    await this.lifecycle.renew(offer, { validFrom: new Date(parsed.validFrom), validUntil: new Date(parsed.validUntil) }, actor, "broker", parsed.reason ?? DEFAULT_BROKER_REASON);
    return this.view(offer);
  }

  private async view(offer: OfferRecord): Promise<BrokerOfferView> {
    const fresh = await this.repository.require(offer.id);
    const versions = await this.lifecycle.versions(fresh);
    return brokerSafe({
      ...toBrokerOfferView(fresh, versions, { suspensionReason: await this.lifecycle.suspensionReason(fresh) }),
      versions: [...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => toVersionView(version))
    });
  }

  private requireBroker(actor: ActorContext, permission: "broker_offers:read" | "broker_offers:write", operation: string): string {
    const isBroker = actor.roles.some((role) => role.startsWith("broker_"));
    if (!isBroker || !actor.partnerTenantId) this.refuse(actor, operation, "missing_broker_tenant");
    if (actor.mfaVerified !== true) this.refuse(actor, operation, "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, operation, "forbidden_role");
    return actor.partnerTenantId as string;
  }

  private async requireActivePartner(partnerTenantId: string, actor: ActorContext): Promise<void> {
    const status = await this.lifecycle.integrations.partnerStatus?.(partnerTenantId);
    if (status !== undefined && status !== "active" && status !== "active_test") this.refuse(actor, "create", "partner_not_active", { partnerStatus: status });
  }

  /** FR-008: an offer of another partner is indistinguishable from a missing one. */
  private async requireOwn(id: string, actor: ActorContext, operation: string): Promise<OfferRecord> {
    const offer = await this.repository.find(id);
    if (!offer || offer.partnerTenantId !== actor.partnerTenantId) {
      this.audit.write({
        actor,
        action: OfferAuditActions.accessRefused,
        targetType: "Offer",
        targetId: id,
        scope: { partnerTenantId: actor.partnerTenantId ?? null },
        result: "refused",
        reason: offer ? "cross_tenant" : "offer_not_found",
        context: { operation }
      });
      throw offerNotFound();
    }
    return offer;
  }

  private refuseSponsorship(input: unknown, actor: ActorContext, offer: OfferRecord | undefined): void {
    if (!input || typeof input !== "object") return;
    const keys = OFFER_SPONSORSHIP_KEYS.filter((key) => key in (input as Record<string, unknown>));
    if (!keys.length) return;
    this.refuse(actor, offer ? "update" : "create", "sponsorship_admin_only", { keys, offerId: offer?.id ?? null });
  }

  private async assertCoverage(actor: ActorContext, partnerTenantId: string, countryId: string, productId: string, offer?: OfferRecord): Promise<void> {
    const blockers = await this.lifecycle.integrations.coverage?.(partnerTenantId, countryId, productId) ?? [];
    if (!blockers.length) return;
    this.lifecycle.refused(actor, offer ?? { id: "new", countryId, productId, partnerTenantId }, offer ? "write" : "create", "scope_not_covered", { blockers });
    throw offerUnprocessable(OfferErrorCodes.scopeNotCovered, "Your licence and authorisations do not cover this country and product", blockers.map((code) => ({ code })));
  }

  private refuse(actor: ActorContext, operation: string, refusal: string, context: Record<string, unknown> = {}): never {
    this.audit.write({
      actor,
      action: OfferAuditActions.accessRefused,
      targetType: "Offer",
      targetId: "broker_offers",
      scope: { partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason: refusal,
      context: { operation, roles: actor.roles, ...context }
    });
    throw offerForbidden(refusal === "sponsorship_admin_only" ? "RBAC denied: sponsorship is reserved to the platform" : "RBAC denied");
  }
}
