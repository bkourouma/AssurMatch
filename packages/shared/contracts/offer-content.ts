import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";
import { findForbiddenWording } from "./content-safety";

/**
 * Spec 052 R3: the content of an offer version, shared by the API, the admin back-office and the
 * broker portal. This module imports nothing from `quote.contracts.ts` (which re-exports the
 * guarantee and payment schemas from here), so there is no import cycle.
 */

export const offerContentGuaranteeSchema = z.object({
  key: nonEmptyStringSchema.max(64),
  label: nonEmptyStringSchema.max(120),
  included: z.boolean(),
  detail: z.string().max(300).optional()
});
export const offerContentPaymentFlexibilitySchema = z.enum(["annual", "semiannual", "quarterly", "monthly"]);

/** Mentions every public offer carries (publication policy requires "offre indicative"). */
export const OFFER_INDICATIVE_DISCLAIMERS = ["offre indicative", "prix a confirmer par le courtier partenaire"] as const;
export const OFFER_INDICATIVE_MARKER = "offre indicative";
export const OFFER_MAX_GUARANTEES = 50;

export const offerTypeSchema = z.enum(["indicative", "partner"]);
export const offerVersionStatusSchema = z.enum(["draft", "submitted", "published", "archived", "withdrawn"]);
export const offerVersionDecisionSchema = z.enum(["validated", "rejected"]);
/** Effective status of an offer as shown in the back-offices (`expired` is computed from `validUntil`). */
export const offerEffectiveStatusSchema = z.enum(["draft", "submitted", "published", "suspended", "withdrawn", "expired"]);

const contentFields = {
  name: nonEmptyStringSchema.max(160),
  shortDescription: z.string().max(1000).optional(),
  guaranteeSummary: z.string().max(1000).optional(),
  insurerName: z.string().trim().max(120).optional(),
  indicativePriceMin: z.number().nonnegative().optional(),
  indicativePriceMax: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("XOF"),
  pricingUnit: z.string().max(40).optional(),
  validFrom: dateTimeStringSchema,
  validUntil: dateTimeStringSchema,
  publicDisclaimers: z.array(nonEmptyStringSchema.max(300)).max(10).default([...OFFER_INDICATIVE_DISCLAIMERS]),
  guaranteeLevel: z.number().int().min(1).max(5).optional(),
  deductibleAmount: z.number().nonnegative().optional(),
  coverageCeiling: z.number().nonnegative().optional(),
  processingDelayDays: z.number().int().nonnegative().max(365).optional(),
  paymentFlexibility: offerContentPaymentFlexibilitySchema.optional(),
  guarantees: z.array(offerContentGuaranteeSchema).max(OFFER_MAX_GUARANTEES).default([]),
  exclusionsSummary: z.string().max(1000).optional(),
  requiredDocuments: z.array(nonEmptyStringSchema.max(120)).max(30).default([]),
  sourceOfInformation: z.string().trim().max(200).optional()
};

const sponsorshipFields = {
  isSponsored: z.boolean().default(false),
  sponsorLabel: z.string().max(60).optional(),
  displayPriority: z.number().int().min(0).max(1000).optional()
};

/** Keys only the platform admin may send (FR-013). A broker payload carrying one is refused. */
export const OFFER_SPONSORSHIP_KEYS = ["isSponsored", "sponsorLabel", "displayPriority"] as const;

interface RefinableContent {
  name?: string | undefined;
  shortDescription?: string | undefined;
  guaranteeSummary?: string | undefined;
  sponsorLabel?: string | undefined;
  insurerName?: string | undefined;
  exclusionsSummary?: string | undefined;
  sourceOfInformation?: string | undefined;
  pricingUnit?: string | undefined;
  publicDisclaimers?: string[] | undefined;
  requiredDocuments?: string[] | undefined;
  guarantees?: Array<{ label: string; detail?: string | undefined }> | undefined;
  indicativePriceMin?: number | undefined;
  indicativePriceMax?: number | undefined;
  validFrom?: string | undefined;
  validUntil?: string | undefined;
}

/** FR-005: forbidden wording on every text field, price order and date order. */
export function refineOfferContent(value: RefinableContent, ctx: z.RefinementCtx): void {
  const text = [
    value.name,
    value.shortDescription,
    value.guaranteeSummary,
    value.sponsorLabel,
    value.insurerName,
    value.exclusionsSummary,
    value.sourceOfInformation,
    value.pricingUnit,
    ...(value.publicDisclaimers ?? []),
    ...(value.requiredDocuments ?? []),
    ...(value.guarantees ?? []).flatMap((guarantee) => [guarantee.label, guarantee.detail])
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  const forbidden = findForbiddenWording(text);
  if (forbidden.length > 0) ctx.addIssue({ code: "custom", message: `Forbidden regulated wording: ${forbidden.join(", ")}` });
  if (value.validFrom && value.validUntil && new Date(value.validUntil) <= new Date(value.validFrom)) {
    ctx.addIssue({ code: "custom", message: "validUntil must be after validFrom" });
  }
  if (value.indicativePriceMin !== undefined && value.indicativePriceMax !== undefined && value.indicativePriceMin > value.indicativePriceMax) {
    ctx.addIssue({ code: "custom", message: "indicativePriceMin must not exceed indicativePriceMax" });
  }
}

/** Broker content: no sponsorship field (strict, so a sponsorship key never passes silently). */
export const offerContentObjectSchema = z.object(contentFields);
export const offerContentSchema = offerContentObjectSchema.strict().superRefine(refineOfferContent);
/** Admin content: broker content plus sponsorship. */
export const adminOfferContentObjectSchema = z.object({ ...contentFields, ...sponsorshipFields });
export const adminOfferContentSchema = adminOfferContentObjectSchema.superRefine(refineOfferContent);

/** POST /broker/offers */
export const brokerOfferCreateSchema = offerContentObjectSchema.extend({
  countryId: uuidSchema,
  productId: uuidSchema,
  reason: z.string().trim().max(500).optional()
}).strict().superRefine(refineOfferContent);
/** PATCH /broker/offers/:id (full content of the version in progress). */
export const brokerOfferUpdateSchema = offerContentObjectSchema.extend({
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: z.string().trim().max(500).optional()
}).strict().superRefine(refineOfferContent);
export const offerSubmitSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const offerWithdrawSchema = z.object({
  reason: reasonSchema,
  /** `pending` abandons the version in progress, `offer` retires the whole offer; default: pending when one exists. */
  target: z.enum(["pending", "offer"]).optional()
});
export const offerRenewSchema = z.object({
  validFrom: dateTimeStringSchema,
  validUntil: dateTimeStringSchema,
  reason: z.string().trim().max(500).optional()
}).superRefine((value, ctx) => {
  if (new Date(value.validUntil) <= new Date(value.validFrom)) ctx.addIssue({ code: "custom", message: "validUntil must be after validFrom" });
});
export const offerRejectSchema = z.object({ reason: reasonSchema });
export const offerDecisionReasonSchema = z.object({ reason: reasonSchema });

export const brokerOfferListQuerySchema = z.object({
  status: offerEffectiveStatusSchema.optional(),
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional()
});

export const adminOfferListQuerySchema = z.object({
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  partnerTenantId: uuidSchema.optional(),
  status: offerEffectiveStatusSchema.optional(),
  sponsored: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  queue: z.enum(["submitted"]).optional()
});

export type OfferContentInput = z.input<typeof offerContentSchema>;
export type OfferContent = z.output<typeof offerContentObjectSchema>;
export type AdminOfferContent = z.output<typeof adminOfferContentObjectSchema>;
export type BrokerOfferCreateDto = z.input<typeof brokerOfferCreateSchema>;
export type BrokerOfferUpdateDto = z.input<typeof brokerOfferUpdateSchema>;
export type OfferType = z.output<typeof offerTypeSchema>;
export type OfferVersionStatus = z.output<typeof offerVersionStatusSchema>;
export type OfferEffectiveStatus = z.output<typeof offerEffectiveStatusSchema>;
export type AdminOfferListQuery = z.output<typeof adminOfferListQuerySchema>;
export type BrokerOfferListQuery = z.output<typeof brokerOfferListQuerySchema>;

/** FR-004 minimum. Each code names the missing field (also used as the `blockers` of 422 refusals). */
export const OFFER_COMPLETENESS_REQUIRED = ["name", "insurerName", "guarantees", "indicativePrice", "validUntil", "sourceOfInformation"] as const;
export type OfferCompletenessField = (typeof OFFER_COMPLETENESS_REQUIRED)[number];

/** Fields of PRD §13 counted by the completeness score. */
const SCORED_FIELDS = [
  "name",
  "insurerName",
  "shortDescription",
  "guarantees",
  "exclusionsSummary",
  "deductibleAmount",
  "coverageCeiling",
  "requiredDocuments",
  "processingDelayDays",
  "indicativePrice",
  "currency",
  "validity",
  "sourceOfInformation",
  "guaranteeLevel",
  "paymentFlexibility"
] as const;

export interface OfferCompletenessContent {
  name?: string | undefined;
  insurerName?: string | undefined;
  shortDescription?: string | undefined;
  guarantees?: unknown[] | undefined;
  exclusionsSummary?: string | undefined;
  deductibleAmount?: number | undefined;
  coverageCeiling?: number | undefined;
  requiredDocuments?: string[] | undefined;
  processingDelayDays?: number | undefined;
  indicativePriceMin?: number | undefined;
  indicativePriceMax?: number | undefined;
  currency?: string | undefined;
  validFrom?: string | Date | undefined;
  validUntil?: string | Date | undefined;
  sourceOfInformation?: string | undefined;
  guaranteeLevel?: number | undefined;
  paymentFlexibility?: string | undefined;
}

export interface OfferCompleteness {
  /** Percentage (0-100) of the PRD §13 fields filled in. */
  score: number;
  /** Missing minimum fields; empty when the version may be submitted. */
  missing: OfferCompletenessField[];
  complete: boolean;
}

const filled = (value: string | undefined) => Boolean(value && value.trim().length > 0);

/** R3: deterministic completeness, the same function on the server and in both back-offices. */
export function offerCompleteness(content: OfferCompletenessContent, now: Date = new Date()): OfferCompleteness {
  const hasPrice = content.indicativePriceMin !== undefined || content.indicativePriceMax !== undefined;
  const validUntil = content.validUntil ? new Date(content.validUntil) : undefined;
  const missing: OfferCompletenessField[] = [];
  if (!filled(content.name)) missing.push("name");
  if (!filled(content.insurerName)) missing.push("insurerName");
  if (!content.guarantees?.length) missing.push("guarantees");
  if (!hasPrice) missing.push("indicativePrice");
  if (!validUntil || Number.isNaN(validUntil.getTime()) || validUntil <= now) missing.push("validUntil");
  if (!filled(content.sourceOfInformation)) missing.push("sourceOfInformation");
  const present: Record<(typeof SCORED_FIELDS)[number], boolean> = {
    name: filled(content.name),
    insurerName: filled(content.insurerName),
    shortDescription: filled(content.shortDescription),
    guarantees: Boolean(content.guarantees?.length),
    exclusionsSummary: filled(content.exclusionsSummary),
    deductibleAmount: content.deductibleAmount !== undefined,
    coverageCeiling: content.coverageCeiling !== undefined,
    requiredDocuments: Boolean(content.requiredDocuments?.length),
    processingDelayDays: content.processingDelayDays !== undefined,
    indicativePrice: hasPrice,
    currency: filled(content.currency),
    validity: Boolean(content.validFrom && content.validUntil),
    sourceOfInformation: filled(content.sourceOfInformation),
    guaranteeLevel: content.guaranteeLevel !== undefined,
    paymentFlexibility: filled(content.paymentFlexibility)
  };
  const score = Math.round((SCORED_FIELDS.filter((field) => present[field]).length / SCORED_FIELDS.length) * 100);
  return { score, missing, complete: missing.length === 0 };
}

/** Whether the mandatory indicative mention is present (publication policy, FR-012). */
export function hasIndicativeDisclaimer(disclaimers: readonly string[] | undefined): boolean {
  return (disclaimers ?? []).some((item) => item.toLocaleLowerCase("fr-FR").includes(OFFER_INDICATIVE_MARKER));
}

/** Refusal detail of 422 `OFFER_INCOMPLETE`, `OFFER_SCOPE_NOT_COVERED` and `OFFER_VALIDATION_BLOCKED`. */
export interface OfferBlocker {
  code: string;
  field?: string;
}

/** Version as served to both back-offices (content + lifecycle). Dates are ISO strings. */
export interface OfferVersionView {
  id: string;
  versionNumber: number;
  status: OfferVersionStatus;
  authorRole: "broker" | "admin";
  authorId?: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedById?: string;
  lastDecision?: "validated" | "rejected";
  decisionReason?: string;
  completeness: OfferCompleteness;
  content: OfferContent & { isSponsored: boolean; sponsorLabel?: string; displayPriority: number };
  createdAt: string;
  updatedAt: string;
}

/** One changed field between the published version and the version in progress. */
export interface OfferVersionDiffEntry {
  field: string;
  published: unknown;
  pending: unknown;
}

export interface BrokerOfferView {
  id: string;
  publicKey: string;
  countryId: string;
  productId: string;
  offerType: OfferType;
  /** Effective status (expired computed from the published version's `validUntil`). */
  status: OfferEffectiveStatus;
  /** Raw `Offer.status` (draft, active, suspended, retired ...). */
  offerStatus: string;
  isSponsored: boolean;
  published?: OfferVersionView;
  pending?: OfferVersionView;
  /** Last decision reason visible to the broker (refusal of the pending version or suspension). */
  lastDecisionReason?: string;
  suspensionReason?: string;
  expiresAt?: string;
  /** Days left before `validUntil` of the published version (negative when expired). */
  expiresInDays?: number;
  expiringSoon: boolean;
  /** Send back as `expectedUpdatedAt` on PATCH (FR-022). */
  concurrencyToken: string;
  createdAt: string;
  updatedAt: string;
  /** Detail only. */
  versions?: OfferVersionView[];
}

export interface AdminOfferListItem extends BrokerOfferView {
  partnerTenantId?: string;
  partnerName?: string;
}

export interface AdminOfferDetailView extends AdminOfferListItem {
  versions: OfferVersionView[];
  /** Fields that differ between the published and the pending version (empty when either is absent). */
  diff: OfferVersionDiffEntry[];
}
