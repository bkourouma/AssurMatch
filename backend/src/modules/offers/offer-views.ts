import {
  offerCompleteness,
  type AdminOfferDetailView,
  type AdminOfferListItem,
  type BrokerOfferView,
  type OfferEffectiveStatus,
  type OfferVersionDiffEntry,
  type OfferVersionView
} from "../../../../packages/shared/contracts/offer-content";
import type { OfferRecord, OfferVersionContent, OfferVersionRecord } from "./offers.module";

/** FR-021 / R9: reminder window before the end of validity. */
export const OFFER_EXPIRY_WARNING_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export const OFFER_CONTENT_KEYS = [
  "name", "shortDescription", "guaranteeSummary", "exclusionsSummary", "insurerName", "guarantees", "guaranteeLevel",
  "deductibleAmount", "coverageCeiling", "processingDelayDays", "paymentFlexibility", "requiredDocuments",
  "sourceOfInformation", "indicativePriceMin", "indicativePriceMax", "currency", "pricingUnit", "validFrom",
  "validUntil", "publicDisclaimers", "isSponsored", "sponsorLabel", "displayPriority"
] as const satisfies ReadonlyArray<keyof OfferVersionContent>;

/** Content of a version, as a plain object with every key present (undefined when empty). */
export function versionContent(source: OfferVersionContent): OfferVersionContent {
  return Object.fromEntries(OFFER_CONTENT_KEYS.map((key) => [key, source[key]])) as unknown as OfferVersionContent;
}

/** Pending version first, then the published one, then the latest version. */
export function pendingVersion(offer: OfferRecord, versions: OfferVersionRecord[]): OfferVersionRecord | undefined {
  return versions.find((version) => version.id === offer.pendingVersionId && (version.status === "draft" || version.status === "submitted"))
    ?? versions.find((version) => version.status === "draft" || version.status === "submitted");
}

export function publishedVersion(offer: OfferRecord, versions: OfferVersionRecord[]): OfferVersionRecord | undefined {
  return versions.find((version) => version.id === offer.publishedVersionId && version.status === "published")
    ?? versions.find((version) => version.status === "published");
}

export function effectiveOfferStatus(offer: OfferRecord, versions: OfferVersionRecord[], now = new Date()): OfferEffectiveStatus {
  if (offer.status === "suspended") return "suspended";
  if (offer.status === "retired") return "withdrawn";
  const published = publishedVersion(offer, versions);
  if (published && (offer.status === "active" || offer.status === "validated")) {
    return published.validUntil <= now ? "expired" : "published";
  }
  const pending = pendingVersion(offer, versions);
  if (pending?.status === "submitted") return "submitted";
  if (!pending && offer.validUntil <= now) return "expired";
  return "draft";
}

function iso(value: Date | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function toVersionView(version: OfferVersionRecord, now = new Date()): OfferVersionView {
  const content = versionContent(version);
  const completeness = offerCompleteness({ ...content, validFrom: content.validFrom, validUntil: content.validUntil }, now);
  const contentView = Object.fromEntries(Object.entries({
    ...content,
    validFrom: content.validFrom.toISOString(),
    validUntil: content.validUntil.toISOString()
  }).filter(([, value]) => value !== undefined)) as OfferVersionView["content"];
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    authorRole: version.authorRole,
    ...(version.authorId ? { authorId: version.authorId } : {}),
    ...(version.submittedAt ? { submittedAt: iso(version.submittedAt) as string } : {}),
    ...(version.decidedAt ? { decidedAt: iso(version.decidedAt) as string } : {}),
    ...(version.decidedById ? { decidedById: version.decidedById } : {}),
    ...(version.lastDecision ? { lastDecision: version.lastDecision } : {}),
    ...(version.decisionReason ? { decisionReason: version.decisionReason } : {}),
    completeness,
    content: contentView,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}

export function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/** Last suspension reason recorded in the offer history (shown to the broker, FR-011). */
export interface OfferViewExtras {
  suspensionReason?: string | undefined;
  partnerName?: string | undefined;
}

export function toBrokerOfferView(offer: OfferRecord, versions: OfferVersionRecord[], extras: OfferViewExtras = {}, now = new Date()): BrokerOfferView {
  const published = publishedVersion(offer, versions);
  const pending = pendingVersion(offer, versions);
  const status = effectiveOfferStatus(offer, versions, now);
  const expiry = published?.validUntil ?? (status === "expired" ? offer.validUntil : undefined);
  const expiresInDays = expiry ? daysUntil(expiry, now) : undefined;
  const lastRejected = pending?.lastDecision === "rejected" ? pending.decisionReason : undefined;
  return {
    id: offer.id,
    publicKey: offer.publicKey,
    countryId: offer.countryId,
    productId: offer.productId,
    offerType: offer.offerType ?? "indicative",
    status,
    offerStatus: offer.status,
    isSponsored: published?.isSponsored ?? pending?.isSponsored ?? offer.isSponsored,
    ...(published ? { published: toVersionView(published, now) } : {}),
    ...(pending ? { pending: toVersionView(pending, now) } : {}),
    ...(lastRejected ? { lastDecisionReason: lastRejected } : {}),
    ...(status === "suspended" && extras.suspensionReason ? { suspensionReason: extras.suspensionReason } : {}),
    ...(expiry ? { expiresAt: expiry.toISOString() } : {}),
    ...(expiresInDays !== undefined ? { expiresInDays } : {}),
    expiringSoon: status === "published" && expiresInDays !== undefined && expiresInDays <= OFFER_EXPIRY_WARNING_DAYS,
    concurrencyToken: (pending?.updatedAt ?? offer.updatedAt).toISOString(),
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString()
  };
}

export function toAdminOfferListItem(offer: OfferRecord, versions: OfferVersionRecord[], extras: OfferViewExtras = {}, now = new Date()): AdminOfferListItem {
  return {
    ...toBrokerOfferView(offer, versions, extras, now),
    ...(offer.partnerTenantId ? { partnerTenantId: offer.partnerTenantId } : {}),
    ...(extras.partnerName ? { partnerName: extras.partnerName } : {})
  };
}

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value ?? null);
}

/** FR-010: fields that differ between the published version and the version in progress. */
export function diffVersions(published: OfferVersionRecord | undefined, pending: OfferVersionRecord | undefined): OfferVersionDiffEntry[] {
  if (!published || !pending) return [];
  const entries: OfferVersionDiffEntry[] = [];
  for (const key of OFFER_CONTENT_KEYS) {
    const before = published[key];
    const after = pending[key];
    if (comparable(before) === comparable(after)) continue;
    entries.push({
      field: key,
      published: before instanceof Date ? before.toISOString() : before ?? null,
      pending: after instanceof Date ? after.toISOString() : after ?? null
    });
  }
  return entries;
}

export function toAdminOfferDetail(offer: OfferRecord, versions: OfferVersionRecord[], extras: OfferViewExtras = {}, now = new Date()): AdminOfferDetailView {
  return {
    ...toAdminOfferListItem(offer, versions, extras, now),
    versions: [...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => toVersionView(version, now)),
    diff: diffVersions(publishedVersion(offer, versions), pendingVersion(offer, versions))
  };
}
