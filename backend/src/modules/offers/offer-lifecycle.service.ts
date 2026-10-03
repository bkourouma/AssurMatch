import {
  hasIndicativeDisclaimer,
  offerCompleteness,
  type BrokerOfferCoverageItem,
  type OfferBlocker
} from "../../../../packages/shared/contracts/offer-content";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { OfferErrorCodes, offerConflict, offerUnprocessable } from "./offer-errors";
import { OFFER_CONTENT_KEYS, OFFER_EXPIRY_WARNING_DAYS, daysUntil, pendingVersion, publishedVersion, versionContent } from "./offer-views";
import type { OfferPatch, OfferRecord, OfferVersionContent, OfferVersionRecord } from "./offers.module";
import type { OffersRepository } from "./offers.repository";

export const OfferAuditActions = {
  created: QuoteAuditActions.offerAdminCreated,
  validated: QuoteAuditActions.offerAdminValidated,
  suspended: QuoteAuditActions.offerAdminSuspended,
  versionCreated: "offer.version_created",
  versionUpdated: "offer.version_updated",
  submitted: "offer.submitted",
  rejected: "offer.rejected",
  reinstated: "offer.reinstated",
  withdrawn: "offer.withdrawn",
  renewed: "offer.renewed",
  accessRefused: "offer.access_refused",
  actionRefused: "offer.action_refused",
  expiringNotified: "offer.expiring_notified"
} as const;

export type OfferAuthorRole = "broker" | "admin";

/** In-app inbox of the partner (`MessagingDispatchService`). */
export interface OfferNotifierPort {
  publishInApp(input: { scopeId: string; template: string; title: string; body: string; targetType?: string; targetId?: string }): Promise<unknown>;
  listInApp(scopeId: string, limit?: number): Promise<Array<{ type: string; targetId?: string | null }>>;
}

/**
 * Runtime integrations resolved lazily (the offers module is built before the routing and partner
 * services it reads). Every one is optional, so a bare module still works in unit tests.
 */
export interface OfferIntegrations {
  /** Spec 052 R3: same eligibility as the public catalogue (active, capacity, authorisations, licence). */
  partnerEligibility?: (partnerTenantId: string, countryId: string, productId: string) => Promise<{ eligible: boolean; reasons: string[] }>;
  /** FR-007: blocker codes when the partner's licence and authorisations do not cover the scope. */
  coverage?: (partnerTenantId: string, countryId: string, productId: string) => Promise<string[]>;
  /**
   * Candidate pairs for the broker coverage list (active country x active product authorisations,
   * retired catalogue entries excluded). Each is then filtered through `coverage`, so the list and
   * the write check cannot disagree.
   */
  coverageCandidates?: (partnerTenantId: string) => Promise<BrokerOfferCoverageItem[]>;
  partnerName?: (partnerTenantId: string) => Promise<string | undefined>;
  partnerStatus?: (partnerTenantId: string) => Promise<string | undefined>;
  notifier?: OfferNotifierPort;
}

export interface OfferCreateInput {
  id?: string | undefined;
  countryId: string;
  productId: string;
  partnerTenantId?: string | undefined;
  publicKey?: string | undefined;
  offerType?: "indicative" | "partner" | undefined;
  content: OfferVersionContent;
}

const NOTIFICATIONS = {
  offer_validated: { title: "Offre validee", body: (name: string) => `Votre offre "${name}" a ete validee et publiee. Elle reste indicative et a confirmer par votre cabinet.` },
  offer_rejected: { title: "Offre refusee", body: (name: string, reason?: string) => `La version soumise de votre offre "${name}" a ete refusee. Motif : ${reason ?? "non precise"}.` },
  offer_suspended: { title: "Offre suspendue", body: (name: string, reason?: string) => `Votre offre "${name}" a ete suspendue et n'est plus visible du public. Motif : ${reason ?? "non precise"}.` },
  offer_expiring: { title: "Offre bientot expiree", body: (name: string, days?: string) => `Votre offre "${name}" expire dans ${days ?? "quelques"} jour(s). Renouvelez-la pour qu'elle reste visible.` }
} as const;
export type OfferNotificationType = keyof typeof NOTIFICATIONS;

function slug(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "offre";
}

/**
 * Spec 052 R1/R2: versions and lifecycle of an offer. The `Offer` row stays the projection of the
 * published version: a draft or a submitted version never touches its content columns, so the
 * public catalogue (which reads `Offer`) cannot change before a validation.
 */
export class OfferLifecycleService {
  integrations: OfferIntegrations = {};

  constructor(private readonly repository: OffersRepository, private readonly audit: AuditLogWriter) {}

  /** Versions of an offer; an offer stored before spec 052 (or created directly) gets its v1 here. */
  async versions(offer: OfferRecord): Promise<OfferVersionRecord[]> {
    const versions = await this.repository.listVersions(offer.id);
    if (versions.length > 0) return versions;
    const published = offer.validationStatus === "validated" && (offer.status === "active" || offer.status === "validated");
    const now = new Date();
    const baseline = await this.repository.createVersion({
      ...versionContent(this.contentFromOffer(offer)),
      id: crypto.randomUUID(),
      offerId: offer.id,
      versionNumber: 1,
      status: published ? "published" : "draft",
      completenessScore: this.score(this.contentFromOffer(offer)),
      authorRole: "admin",
      ...(offer.createdById ? { authorId: offer.createdById } : {}),
      ...(published && offer.validatedAt ? { submittedAt: offer.validatedAt, decidedAt: offer.validatedAt } : {}),
      ...(published && offer.validatedById ? { decidedById: offer.validatedById } : {}),
      ...(published ? { lastDecision: "validated" as const } : {}),
      createdAt: offer.createdAt ?? now,
      updatedAt: offer.updatedAt ?? now
    });
    await this.repository.update(offer.id, published ? { publishedVersionId: baseline.id } : { pendingVersionId: baseline.id });
    if (published) offer.publishedVersionId = baseline.id;
    else offer.pendingVersionId = baseline.id;
    return [baseline];
  }

  async create(input: OfferCreateInput, actor: ActorContext, authorRole: OfferAuthorRole, reason: string): Promise<{ offer: OfferRecord; version: OfferVersionRecord }> {
    const now = new Date();
    const offerId = input.id ?? crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const content = input.content;
    const offer: OfferRecord = {
      ...this.projection(content),
      id: offerId,
      countryId: input.countryId,
      productId: input.productId,
      ...(input.partnerTenantId ? { partnerTenantId: input.partnerTenantId } : {}),
      publicKey: input.publicKey ?? await this.uniquePublicKey(input.countryId, input.productId, content.name),
      status: "draft",
      validationStatus: "pending",
      offerType: input.offerType ?? "indicative",
      pendingVersionId: versionId,
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    } as OfferRecord;
    for (const key of Object.keys(offer) as Array<keyof OfferRecord>) if (offer[key] === undefined) delete offer[key];
    await this.repository.create(offer);
    const version = await this.repository.createVersion({
      ...versionContent(content),
      id: versionId,
      offerId,
      versionNumber: 1,
      status: "draft",
      completenessScore: this.score(content),
      authorRole,
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      createdAt: now,
      updatedAt: now
    });
    await this.history(offerId, "created", undefined, { versionNumber: 1, status: "draft", authorRole }, reason, actor);
    this.audit.write({
      actor,
      action: OfferAuditActions.created,
      targetType: "Offer",
      targetId: offerId,
      scope: this.scope(offer),
      result: "success",
      reason,
      context: { before: null, after: { status: "draft", versionNumber: 1, versionId, authorRole, isSponsored: content.isSponsored } }
    });
    return { offer, version };
  }

  /**
   * FR-014 / US3: edits the version in progress, or creates version N+1 from the published one. A
   * submitted version goes back to draft (the reviewer never sees content changing under review).
   */
  async saveContent(offer: OfferRecord, content: OfferVersionContent, options: { actor: ActorContext; authorRole: OfferAuthorRole; reason: string; expectedUpdatedAt?: string | undefined }): Promise<OfferVersionRecord> {
    const versions = await this.versions(offer);
    const pending = pendingVersion(offer, versions);
    const token = pending?.updatedAt ?? offer.updatedAt;
    if (options.expectedUpdatedAt && new Date(options.expectedUpdatedAt).getTime() !== new Date(token).getTime()) {
      throw offerConflict("Offer update conflict: the offer changed since it was loaded; reload and retry", OfferErrorCodes.versionConflict);
    }
    const now = new Date();
    let version: OfferVersionRecord;
    if (pending) {
      const before = { versionNumber: pending.versionNumber, status: pending.status };
      version = await this.repository.updateVersion(pending.id, {
        ...this.explicitContent(content),
        status: "draft",
        submittedAt: undefined,
        completenessScore: this.score(content),
        authorRole: options.authorRole,
        ...(options.actor.actorId ? { authorId: options.actor.actorId } : {}),
        updatedAt: now
      });
      await this.history(offer.id, "version_updated", before, { versionNumber: version.versionNumber, status: "draft" }, options.reason, options.actor);
      this.audit.write({
        actor: options.actor,
        action: OfferAuditActions.versionUpdated,
        targetType: "OfferVersion",
        targetId: version.id,
        scope: this.scope(offer),
        result: "success",
        reason: options.reason,
        context: { offerId: offer.id, before, after: { versionNumber: version.versionNumber, status: "draft" }, authorRole: options.authorRole }
      });
    } else {
      const versionNumber = Math.max(0, ...versions.map((candidate) => candidate.versionNumber)) + 1;
      version = await this.repository.createVersion({
        ...versionContent(content),
        id: crypto.randomUUID(),
        offerId: offer.id,
        versionNumber,
        status: "draft",
        completenessScore: this.score(content),
        authorRole: options.authorRole,
        ...(options.actor.actorId ? { authorId: options.actor.actorId } : {}),
        createdAt: now,
        updatedAt: now
      });
      await this.repository.update(offer.id, { pendingVersionId: version.id });
      offer.pendingVersionId = version.id;
      await this.history(offer.id, "version_created", undefined, { versionNumber, status: "draft" }, options.reason, options.actor);
      this.audit.write({
        actor: options.actor,
        action: OfferAuditActions.versionCreated,
        targetType: "OfferVersion",
        targetId: version.id,
        scope: this.scope(offer),
        result: "success",
        reason: options.reason,
        context: { offerId: offer.id, before: null, after: { versionNumber, status: "draft" }, authorRole: options.authorRole }
      });
    }
    await this.syncUnpublished(offer, version, now);
    return version;
  }

  /** FR-004: a draft is submitted only when the minimum completeness is reached. */
  async submit(offer: OfferRecord, actor: ActorContext, reason: string): Promise<OfferVersionRecord> {
    const versions = await this.versions(offer);
    const pending = pendingVersion(offer, versions);
    if (!pending || pending.status !== "draft") {
      this.refused(actor, offer, "submit", "no_draft_version");
      throw offerConflict("Offer transition invalid: no draft version to submit");
    }
    const completeness = offerCompleteness(pending);
    if (!completeness.complete) {
      this.refused(actor, offer, "submit", "offer_incomplete", { missing: completeness.missing });
      throw offerUnprocessable(OfferErrorCodes.incomplete, "Offer is incomplete", completeness.missing.map((field) => ({ code: "missing_field", field })));
    }
    const now = new Date();
    const version = await this.repository.updateVersion(pending.id, { status: "submitted", submittedAt: now, completenessScore: completeness.score, updatedAt: now });
    await this.history(offer.id, "submitted", { status: "draft" }, { versionNumber: version.versionNumber, status: "submitted" }, reason, actor);
    this.audit.write({
      actor,
      action: OfferAuditActions.submitted,
      targetType: "OfferVersion",
      targetId: version.id,
      scope: this.scope(offer),
      result: "success",
      reason,
      context: { offerId: offer.id, before: { status: "draft" }, after: { status: "submitted", versionNumber: version.versionNumber }, completenessScore: completeness.score }
    });
    return version;
  }

  /** FR-012: controls a version must pass to be published (or a suspended offer to be reinstated). */
  async validationBlockers(offer: OfferRecord, version: OfferVersionRecord, now = new Date()): Promise<OfferBlocker[]> {
    const blockers: OfferBlocker[] = [];
    const completeness = offerCompleteness(version, now);
    for (const field of completeness.missing) {
      if (field !== "validUntil") blockers.push({ code: "missing_field", field });
    }
    if (!hasIndicativeDisclaimer(version.publicDisclaimers)) blockers.push({ code: "indicative_disclaimer_missing", field: "publicDisclaimers" });
    if (version.validUntil <= version.validFrom) blockers.push({ code: "dates_invalid", field: "validUntil" });
    if (version.validUntil <= now) blockers.push({ code: "offer_expired", field: "validUntil" });
    if (version.indicativePriceMin !== undefined && version.indicativePriceMax !== undefined && version.indicativePriceMin > version.indicativePriceMax) {
      blockers.push({ code: "price_range_invalid", field: "indicativePriceMax" });
    }
    if (!offer.partnerTenantId) {
      blockers.push({ code: "partner_missing", field: "partnerTenantId" });
    } else if (this.integrations.partnerEligibility) {
      const eligibility = await this.integrations.partnerEligibility(offer.partnerTenantId, offer.countryId, offer.productId).catch(() => ({ eligible: false, reasons: ["partner_not_found"] }));
      for (const reason of eligibility.eligible ? [] : eligibility.reasons) blockers.push({ code: reason });
    }
    return blockers;
  }

  /**
   * Publishes the submitted version (copy into `Offer`, previous published version archived), or
   * reinstates a suspended offer after the same controls.
   */
  async validate(offer: OfferRecord, actor: ActorContext, reason: string): Promise<OfferRecord> {
    const versions = await this.versions(offer);
    const pending = pendingVersion(offer, versions);
    const published = publishedVersion(offer, versions);
    const now = new Date();
    if (pending?.status === "submitted") {
      const blockers = await this.validationBlockers(offer, pending, now);
      if (blockers.length) {
        this.refused(actor, offer, "validate", "validation_blocked", { blockers });
        throw offerUnprocessable(OfferErrorCodes.validationBlocked, "Offer validation blocked", blockers);
      }
      if (published) await this.repository.updateVersion(published.id, { status: "archived", updatedAt: now });
      const version = await this.repository.updateVersion(pending.id, {
        status: "published",
        lastDecision: "validated",
        decisionReason: reason,
        decidedAt: now,
        ...(actor.actorId ? { decidedById: actor.actorId } : {}),
        completenessScore: offerCompleteness(pending, now).score,
        updatedAt: now
      });
      const before = { status: offer.status, validationStatus: offer.validationStatus, publishedVersionId: offer.publishedVersionId ?? null };
      const update: OfferPatch<OfferRecord> = {
        ...this.projection(version),
        status: "active",
        validationStatus: "validated",
        validatedAt: now,
        validatedById: actor.actorId,
        publishedVersionId: version.id,
        pendingVersionId: undefined,
        withdrawnAt: undefined,
        updatedAt: now
      };
      const saved = await this.repository.update(offer.id, update);
      Object.assign(offer, saved);
      await this.history(offer.id, "validated", before, { status: "active", versionNumber: version.versionNumber }, reason, actor);
      this.audit.write({
        actor,
        action: OfferAuditActions.validated,
        targetType: "Offer",
        targetId: offer.id,
        scope: this.scope(offer),
        result: "success",
        reason,
        context: { before, after: { status: "active", validationStatus: "validated", publishedVersionId: version.id, versionNumber: version.versionNumber }, archivedVersionId: published?.id ?? null }
      });
      await this.notify(offer, "offer_validated", version.name);
      return offer;
    }
    if (offer.status === "suspended" && published) {
      const blockers = await this.validationBlockers(offer, published, now);
      if (blockers.length) {
        this.refused(actor, offer, "reinstate", "validation_blocked", { blockers });
        throw offerUnprocessable(OfferErrorCodes.validationBlocked, "Offer validation blocked", blockers);
      }
      const saved = await this.repository.update(offer.id, { status: "active", validatedAt: now, validatedById: actor.actorId, updatedAt: now });
      Object.assign(offer, saved);
      await this.history(offer.id, "reinstated", { status: "suspended" }, { status: "active", versionNumber: published.versionNumber }, reason, actor);
      this.audit.write({
        actor,
        action: OfferAuditActions.reinstated,
        targetType: "Offer",
        targetId: offer.id,
        scope: this.scope(offer),
        result: "success",
        reason,
        context: { before: { status: "suspended" }, after: { status: "active" }, publishedVersionId: published.id }
      });
      await this.notify(offer, "offer_validated", published.name);
      return offer;
    }
    this.refused(actor, offer, "validate", "no_submitted_version");
    throw offerConflict("Offer transition invalid: no submitted version to validate");
  }

  /** US2-2 / US3-3: the submitted version returns to draft with the reason; the published one stays. */
  async reject(offer: OfferRecord, actor: ActorContext, reason: string): Promise<OfferVersionRecord> {
    const versions = await this.versions(offer);
    const pending = pendingVersion(offer, versions);
    if (pending?.status !== "submitted") {
      this.refused(actor, offer, "reject", "no_submitted_version");
      throw offerConflict("Offer transition invalid: no submitted version to reject");
    }
    const now = new Date();
    const version = await this.repository.updateVersion(pending.id, {
      status: "draft",
      lastDecision: "rejected",
      decisionReason: reason,
      decidedAt: now,
      ...(actor.actorId ? { decidedById: actor.actorId } : {}),
      updatedAt: now
    });
    await this.history(offer.id, "rejected", { status: "submitted" }, { status: "draft", versionNumber: version.versionNumber }, reason, actor);
    this.audit.write({
      actor,
      action: OfferAuditActions.rejected,
      targetType: "OfferVersion",
      targetId: version.id,
      scope: this.scope(offer),
      result: "success",
      reason,
      context: { offerId: offer.id, before: { status: "submitted" }, after: { status: "draft", lastDecision: "rejected" } }
    });
    await this.notify(offer, "offer_rejected", version.name, reason);
    return version;
  }

  /** US2-6: the offer leaves the public catalogue at once (the policy excludes `suspended`). */
  async suspend(offer: OfferRecord, actor: ActorContext, reason: string): Promise<OfferRecord> {
    if (offer.status !== "active" && offer.status !== "validated") {
      this.refused(actor, offer, "suspend", "offer_not_published");
      throw offerConflict("Offer transition invalid: only a published offer can be suspended");
    }
    const now = new Date();
    const before = { status: offer.status };
    const saved = await this.repository.update(offer.id, { status: "suspended", updatedAt: now });
    Object.assign(offer, saved);
    await this.history(offer.id, "suspended", before, { status: "suspended" }, reason, actor);
    this.audit.write({
      actor,
      action: OfferAuditActions.suspended,
      targetType: "Offer",
      targetId: offer.id,
      scope: this.scope(offer),
      result: "success",
      reason,
      context: { before, after: { status: "suspended" } }
    });
    await this.notify(offer, "offer_suspended", offer.name, reason);
    return offer;
  }

  /** US3-5: withdraws the version in progress or retires the offer (history kept). */
  async withdraw(offer: OfferRecord, actor: ActorContext, reason: string, target?: "pending" | "offer"): Promise<OfferRecord> {
    const versions = await this.versions(offer);
    const pending = pendingVersion(offer, versions);
    const published = publishedVersion(offer, versions);
    const scope = target ?? (pending ? "pending" : "offer");
    const now = new Date();
    if (scope === "pending" && !pending) {
      this.refused(actor, offer, "withdraw", "no_pending_version");
      throw offerConflict("Offer transition invalid: no version in progress");
    }
    if (scope === "offer" && offer.status === "retired") {
      this.refused(actor, offer, "withdraw", "offer_already_withdrawn");
      throw offerConflict("Offer transition invalid: offer already withdrawn");
    }
    const before = { status: offer.status, pendingVersionId: offer.pendingVersionId ?? null, publishedVersionId: offer.publishedVersionId ?? null };
    const update: OfferPatch<OfferRecord> = { updatedAt: now };
    if (pending) {
      await this.repository.updateVersion(pending.id, { status: "withdrawn", updatedAt: now });
      update.pendingVersionId = undefined;
    }
    const retire = scope === "offer" || !published;
    if (retire) {
      if (published) await this.repository.updateVersion(published.id, { status: "withdrawn", updatedAt: now });
      update.status = "retired";
      update.withdrawnAt = now;
      update.publishedVersionId = undefined;
    }
    const saved = await this.repository.update(offer.id, update);
    Object.assign(offer, saved);
    const after = { status: offer.status, withdrawn: retire ? "offer" : "pending" };
    await this.history(offer.id, "withdrawn", before, after, reason, actor);
    this.audit.write({ actor, action: OfferAuditActions.withdrawn, targetType: "Offer", targetId: offer.id, scope: this.scope(offer), result: "success", reason, context: { before, after } });
    return offer;
  }

  /** US5-3: renewal is a new draft version carrying new dates (only one version in progress). */
  async renew(offer: OfferRecord, dates: { validFrom: Date; validUntil: Date }, actor: ActorContext, authorRole: OfferAuthorRole, reason: string): Promise<OfferVersionRecord> {
    const versions = await this.versions(offer);
    if (pendingVersion(offer, versions)) {
      this.refused(actor, offer, "renew", "pending_version_exists");
      throw offerConflict("Offer transition invalid: a version is already in progress");
    }
    const base = publishedVersion(offer, versions) ?? [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const content: OfferVersionContent = { ...(base ? versionContent(base) : versionContent(this.contentFromOffer(offer))), validFrom: dates.validFrom, validUntil: dates.validUntil };
    const version = await this.saveContent(offer, content, { actor, authorRole, reason });
    this.audit.write({ actor, action: OfferAuditActions.renewed, targetType: "OfferVersion", targetId: version.id, scope: this.scope(offer), result: "success", reason, context: { offerId: offer.id, validFrom: dates.validFrom.toISOString(), validUntil: dates.validUntil.toISOString() } });
    return version;
  }

  /** R9: one `offer_expiring` notification per published version entering the 15 day window. */
  async notifyExpiring(offers: OfferRecord[], now = new Date()): Promise<number> {
    const notifier = this.integrations.notifier;
    if (!notifier) return 0;
    let created = 0;
    const seenByPartner = new Map<string, Set<string>>();
    for (const offer of offers) {
      if (!offer.partnerTenantId || (offer.status !== "active" && offer.status !== "validated")) continue;
      const versions = await this.versions(offer);
      const published = publishedVersion(offer, versions);
      if (!published) continue;
      const days = daysUntil(published.validUntil, now);
      if (days < 0 || days > OFFER_EXPIRY_WARNING_DAYS || published.validUntil <= now) continue;
      let seen = seenByPartner.get(offer.partnerTenantId);
      if (!seen) {
        const inbox = await notifier.listInApp(offer.partnerTenantId, 500).catch(() => []);
        seen = new Set(inbox.filter((item) => item.type === "offer_expiring" && item.targetId).map((item) => String(item.targetId)));
        seenByPartner.set(offer.partnerTenantId, seen);
      }
      if (seen.has(published.id)) continue;
      seen.add(published.id);
      await notifier.publishInApp({
        scopeId: offer.partnerTenantId,
        template: "offer_expiring",
        title: NOTIFICATIONS.offer_expiring.title,
        body: NOTIFICATIONS.offer_expiring.body(published.name, String(days)),
        targetType: "OfferVersion",
        targetId: published.id
      }).catch(() => undefined);
      this.audit.write({ action: OfferAuditActions.expiringNotified, targetType: "OfferVersion", targetId: published.id, scope: this.scope(offer), result: "success", context: { offerId: offer.id, daysLeft: days } });
      created += 1;
    }
    return created;
  }

  /** Last suspension reason (shown to the broker, FR-011). */
  async suspensionReason(offer: OfferRecord): Promise<string | undefined> {
    if (offer.status !== "suspended") return undefined;
    const entries = (await this.repository.history()).filter((entry) => entry.offerId === offer.id && entry.changeType === "suspended");
    return entries.at(-1)?.reason;
  }

  refused(actor: ActorContext, offer: Pick<OfferRecord, "id" | "countryId" | "productId" | "partnerTenantId"> | undefined, operation: string, refusal: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action: OfferAuditActions.actionRefused,
      targetType: "Offer",
      targetId: offer?.id ?? "new",
      scope: offer ? this.scope(offer) : {},
      result: "refused",
      reason: refusal,
      context: { operation, ...context }
    });
  }

  /** Content columns of `Offer` for a version, every key present so a missing field is cleared. */
  projection(content: OfferVersionContent): OfferPatch<OfferRecord> {
    return Object.fromEntries(OFFER_CONTENT_KEYS.map((key) => [key, content[key]])) as OfferPatch<OfferRecord>;
  }

  contentFromOffer(offer: OfferRecord): OfferVersionContent {
    return versionContent({
      ...offer,
      guarantees: offer.guarantees ?? [],
      requiredDocuments: offer.requiredDocuments ?? []
    } as OfferVersionContent);
  }

  private score(content: OfferVersionContent): number {
    return offerCompleteness(content).score;
  }

  /** Keys with `undefined` clear the stored value (the version takes the submitted content as a whole). */
  private explicitContent(content: OfferVersionContent): OfferPatch<OfferVersionRecord> {
    return versionContent(content);
  }

  /** A never published offer mirrors its draft for the admin list (it is not public: status draft). */
  private async syncUnpublished(offer: OfferRecord, version: OfferVersionRecord, now: Date): Promise<void> {
    if (offer.publishedVersionId || offer.status !== "draft") return;
    const saved = await this.repository.update(offer.id, { ...this.projection(version), updatedAt: now });
    Object.assign(offer, saved);
  }

  private async uniquePublicKey(countryId: string, productId: string, name: string): Promise<string> {
    const base = slug(name);
    const taken = new Set((await this.repository.list()).filter((offer) => offer.countryId === countryId && offer.productId === productId).map((offer) => offer.publicKey));
    if (!taken.has(base)) return base;
    for (let index = 2; ; index += 1) if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
  }

  private async notify(offer: OfferRecord, type: OfferNotificationType, name: string, detail?: string): Promise<void> {
    if (!offer.partnerTenantId || !this.integrations.notifier) return;
    const template = NOTIFICATIONS[type];
    await this.integrations.notifier.publishInApp({
      scopeId: offer.partnerTenantId,
      template: type,
      title: template.title,
      body: template.body(name, detail),
      targetType: "Offer",
      targetId: offer.id
    }).catch(() => undefined);
  }

  private scope(offer: Pick<OfferRecord, "countryId" | "productId" | "partnerTenantId">): Record<string, unknown> {
    return { countryId: offer.countryId, productId: offer.productId, partnerTenantId: offer.partnerTenantId ?? null };
  }

  private async history(offerId: string, changeType: string, previousValue: unknown, nextValue: unknown, reason: string, actor: ActorContext): Promise<void> {
    await this.repository.appendHistory({
      id: crypto.randomUUID(),
      offerId,
      ...(actor.actorId ? { changedById: actor.actorId } : {}),
      changeType,
      previousValue,
      nextValue,
      reason,
      changedAt: new Date()
    });
  }
}
