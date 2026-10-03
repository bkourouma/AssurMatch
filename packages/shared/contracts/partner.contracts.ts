import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema, e164PhoneSchema, emailSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";
import { toPatchSchema } from "../validation/patch.schemas";

/* ------------------------------------------------------------------ enums */

/**
 * Spec 051 R1: stored partner statuses. PRD labels: draft = Prospect, pending_compliance = En
 * vérification, active_test = Actif test, active = Actif public, suspended = Suspendu,
 * retired = Résilié. Only `active` is routable and public.
 */
export const partnerStatusSchema = z.enum(["draft", "pending_compliance", "active_test", "active", "suspended", "retired"]);
/** R1: "expired" is computed (an active or active_test partner without any valid, unexpired licence). */
export const partnerEffectiveStatusSchema = z.enum(["draft", "pending_compliance", "active_test", "active", "suspended", "expired", "retired"]);
export const partnerPlanSchema = z.enum(["starter", "pro", "enterprise"]);
export const partnerCapacityStatusSchema = z.enum(["available", "limited", "full", "blocked"]);
export const partnerLicenseStatusSchema = z.enum(["draft", "pending_review", "valid", "expired", "suspended", "invalid", "revoked", "superseded"]);
export const accreditationDocumentTypeSchema = z.enum(["license", "registration", "identity", "mandate", "compliance_certificate", "partnership_contract", "other"]);
export const accreditationDocumentStatusSchema = z.enum(["uploaded", "pending_review", "accepted", "rejected", "expired", "superseded"]);
export const accreditationScanStatusSchema = z.enum(["pending", "clean", "infected", "failed"]);
export const partnerAuthorizationStatusSchema = z.enum(["active", "withdrawn"]);
/** Roles a partner user can receive from the partner page (R11). */
export const partnerUserRoleSchema = z.enum(["broker_owner_starter", "broker_owner_pro", "broker_manager", "broker_agent", "broker_read_only"]);

export const PARTNER_SLA_TARGET_MIN_MINUTES = 5;
export const PARTNER_SLA_TARGET_MAX_MINUTES = 10_080;
export const PARTNER_INSURERS_MAX = 20;
/** FR-008: same limits as the quote documents (spec 033). */
export const accreditationDocumentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ACCREDITATION_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/* ------------------------------------------------------- internal records */

/**
 * Internal create schema (seeds, imports, tests and the admin service). It still accepts a status
 * so seeds can create routable partners directly; the admin route always creates `draft`.
 */
export const partnerCreateSchema = z.object({
  id: uuidSchema.optional(),
  legalName: nonEmptyStringSchema,
  tradeName: z.string().optional(),
  countryId: uuidSchema.optional(),
  city: z.string().trim().max(120).optional(),
  registrationNumber: z.string().optional(),
  plan: partnerPlanSchema.default("starter"),
  status: partnerStatusSchema.default("draft"),
  statusReason: z.string().optional(),
  previousActiveStatus: z.enum(["active_test", "active"]).optional(),
  suspensionReason: z.string().optional(),
  primaryEmail: emailSchema,
  primaryWhatsApp: e164PhoneSchema,
  adminContactName: z.string().trim().max(120).optional(),
  adminContactEmail: emailSchema.optional(),
  adminContactPhone: e164PhoneSchema.optional(),
  commercialContactName: z.string().trim().max(120).optional(),
  commercialContactEmail: emailSchema.optional(),
  commercialContactPhone: e164PhoneSchema.optional(),
  partnerInsurers: z.array(z.string().trim().min(1).max(120)).max(PARTNER_INSURERS_MAX).default([]),
  quotaMonthlyLeads: z.number().int().min(0).default(0),
  capacityStatus: partnerCapacityStatusSchema.default("available"),
  slaTargetMinutes: z.number().int().min(PARTNER_SLA_TARGET_MIN_MINUTES).max(PARTNER_SLA_TARGET_MAX_MINUTES).optional()
});

export const partnerUpdateSchema = toPatchSchema(partnerCreateSchema).omit({ id: true }).extend({
  reason: reasonSchema
});

export const partnerLicenseSchema = z.object({
  id: uuidSchema.optional(),
  partnerTenantId: uuidSchema,
  licenseNumber: nonEmptyStringSchema,
  issuingAuthority: nonEmptyStringSchema,
  countryId: uuidSchema,
  productIds: z.array(uuidSchema).default([]),
  status: partnerLicenseStatusSchema.default("draft"),
  statusReason: z.string().optional(),
  renewsLicenseId: uuidSchema.optional(),
  effectiveDate: dateStringSchema,
  expirationDate: dateStringSchema
});

export const accreditationDocumentSchema = z.object({
  id: uuidSchema.optional(),
  partnerTenantId: uuidSchema,
  licenseId: uuidSchema.optional(),
  documentType: accreditationDocumentTypeSchema,
  storageKey: nonEmptyStringSchema,
  checksum: nonEmptyStringSchema,
  status: accreditationDocumentStatusSchema.default("uploaded"),
  expirationDate: dateStringSchema.optional()
});

/* -------------------------------------------------------- admin requests */

const partnerAdminShape = {
  legalName: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).optional(),
  countryId: uuidSchema,
  city: z.string().trim().max(120).optional(),
  registrationNumber: z.string().trim().min(2).max(64).optional(),
  primaryEmail: emailSchema,
  primaryWhatsApp: e164PhoneSchema,
  adminContactName: z.string().trim().min(2).max(120).optional(),
  adminContactEmail: emailSchema.optional(),
  adminContactPhone: e164PhoneSchema.optional(),
  commercialContactName: z.string().trim().min(2).max(120).optional(),
  commercialContactEmail: emailSchema.optional(),
  commercialContactPhone: e164PhoneSchema.optional(),
  partnerInsurers: z.array(z.string().trim().min(1).max(120)).max(PARTNER_INSURERS_MAX).default([]),
  plan: partnerPlanSchema.default("starter"),
  quotaMonthlyLeads: z.number().int().min(0).max(100_000).default(0),
  capacityStatus: partnerCapacityStatusSchema.default("available"),
  slaTargetMinutes: z.number().int().min(PARTNER_SLA_TARGET_MIN_MINUTES).max(PARTNER_SLA_TARGET_MAX_MINUTES).optional()
};

/** POST /admin/partners: always created as `draft` (Prospect). */
export const partnerAdminCreateSchema = z.object({ ...partnerAdminShape, reason: reasonSchema });

/** PATCH /admin/partners/:id: status is never changed here (use the status route). */
export const partnerAdminUpdateSchema = toPatchSchema(z.object(partnerAdminShape)).extend({
  /** FR-026: optimistic concurrency, the `updatedAt` the admin loaded. */
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: reasonSchema
});

export const adminPartnerListQuerySchema = z.object({
  status: partnerEffectiveStatusSchema.optional(),
  countryId: uuidSchema.optional(),
  plan: partnerPlanSchema.optional(),
  licenseExpiringWithinDays: z.coerce.number().int().min(1).max(730).optional()
});

/** POST /admin/partners/:id/status (`draft` is never a target). */
export const partnerStatusTransitionSchema = z.object({
  status: partnerStatusSchema.exclude(["draft"]),
  reason: reasonSchema
});

export const partnerActionReasonSchema = z.object({ reason: reasonSchema });
export const partnerCountryAuthorizationSchema = z.object({ countryId: uuidSchema, reason: reasonSchema });
export const partnerProductAuthorizationSchema = z.object({ productId: uuidSchema, reason: reasonSchema });

const partnerLicenseFieldsShape = {
  licenseNumber: z.string().trim().min(3).max(64),
  issuingAuthority: z.string().trim().min(2).max(160),
  countryId: uuidSchema,
  /** Empty means every product of the country. */
  productIds: z.array(uuidSchema).max(50).default([]),
  effectiveDate: dateStringSchema,
  expirationDate: dateStringSchema,
  reason: reasonSchema
};

const licenseDatesOrdered = (value: { effectiveDate: string; expirationDate: string }) => value.effectiveDate <= value.expirationDate;

export const partnerLicenseCreateSchema = z.object(partnerLicenseFieldsShape)
  .refine(licenseDatesOrdered, { message: "expirationDate must not precede effectiveDate", path: ["expirationDate"] });
/** Renewal: a new licence referencing the previous one; the country defaults to the previous licence's. */
export const partnerLicenseRenewSchema = z.object({ ...partnerLicenseFieldsShape, countryId: uuidSchema.optional() })
  .refine(licenseDatesOrdered, { message: "expirationDate must not precede effectiveDate", path: ["expirationDate"] });
export const partnerLicenseActionSchema = z.object({ reason: reasonSchema });

/** Multipart text fields that accompany `file` on POST /admin/partners/:id/documents. */
export const accreditationDocumentUploadSchema = z.object({
  documentType: accreditationDocumentTypeSchema,
  licenseId: uuidSchema.optional(),
  expirationDate: dateStringSchema.optional(),
  reason: reasonSchema
});

export const accreditationDocumentReviewSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: reasonSchema
});

export const partnerContractCreateSchema = z.object({
  version: z.string().trim().min(1).max(32),
  signedAt: dateStringSchema,
  signatoryName: z.string().trim().min(2).max(120),
  documentId: uuidSchema,
  reason: reasonSchema
});

/** POST /admin/partners/:id/users (lot B). The owner role follows the plan (R11). */
export const partnerUserInviteSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(120),
  role: partnerUserRoleSchema,
  reason: reasonSchema
});

/* ------------------------------------------------------------ admin views */

export interface PartnerActivationBlocker {
  section: string;
  control: string;
  label: string;
  evidence: string;
}

export interface PartnerStatusHistoryView {
  id: string;
  fromStatus: PartnerStatus | null;
  toStatus: PartnerStatus;
  reason: string;
  actorId: string | null;
  createdAt: string;
}

export interface PartnerLicenseHistoryView {
  id: string;
  licenseId: string;
  fromStatus: PartnerLicenseStatus | null;
  toStatus: PartnerLicenseStatus;
  reason: string;
  actorId: string | null;
  createdAt: string;
}

export interface AdminPartnerLicenseView {
  id: string;
  partnerTenantId: string;
  licenseNumber: string;
  issuingAuthority: string;
  countryId: string;
  productIds: string[];
  status: PartnerLicenseStatus;
  /** `expired` when a stored `valid` licence is past its expiration date. */
  effectiveStatus: PartnerLicenseStatus;
  statusReason: string | null;
  renewsLicenseId: string | null;
  effectiveDate: string;
  expirationDate: string;
  validatedById: string | null;
  validatedAt: string | null;
  history: PartnerLicenseHistoryView[];
  createdAt: string;
  updatedAt: string;
}

/** Never carries the storage key; bytes go through the audited download route only. */
export interface AdminAccreditationDocumentView {
  id: string;
  partnerTenantId: string;
  licenseId: string | null;
  documentType: AccreditationDocumentType;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string;
  scanStatus: AccreditationScanStatus;
  scanEngine: string | null;
  scannedAt: string | null;
  status: AccreditationDocumentStatus;
  quarantined: boolean;
  reviewReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  expirationDate: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPartnerContractView {
  id: string;
  partnerTenantId: string;
  version: string;
  signedAt: string;
  signatoryName: string;
  documentId: string;
  recordedById: string | null;
  createdAt: string;
}

export interface AdminPartnerAuthorizationView {
  /** countryId or productId depending on the list. */
  scopeId: string;
  status: PartnerAuthorizationStatus;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPartnerUserView {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  status: string;
}

export interface AdminPartnerView {
  id: string;
  legalName: string;
  tradeName: string | null;
  countryId: string | null;
  city: string | null;
  registrationNumber: string | null;
  plan: PartnerPlan;
  status: PartnerStatus;
  effectiveStatus: PartnerEffectiveStatus;
  statusReason: string | null;
  quotaMonthlyLeads: number;
  capacityStatus: PartnerCapacityStatus;
  slaTargetMinutes: number | null;
  /** Earliest expiration date among the partner's valid, unexpired licences. */
  nextLicenseExpiration: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPartnerDetailView extends AdminPartnerView {
  primaryEmail: string;
  primaryWhatsApp: string;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  commercialContactName: string | null;
  commercialContactEmail: string | null;
  commercialContactPhone: string | null;
  partnerInsurers: string[];
  previousActiveStatus: PartnerStatus | null;
  licenses: AdminPartnerLicenseView[];
  documents: AdminAccreditationDocumentView[];
  contracts: AdminPartnerContractView[];
  coverage: { countries: AdminPartnerAuthorizationView[]; products: AdminPartnerAuthorizationView[] };
  users: AdminPartnerUserView[];
  statusHistory: PartnerStatusHistoryView[];
  /** FR-004: empty when every activation condition is met. */
  activationBlockers: PartnerActivationBlocker[];
  /** Status targets the transition graph accepts from the current status (conditions apart). */
  allowedTransitions: PartnerStatus[];
}

/* ------------------------------------------------------------------ types */

export type PartnerStatus = z.output<typeof partnerStatusSchema>;
export type PartnerEffectiveStatus = z.output<typeof partnerEffectiveStatusSchema>;
export type PartnerPlan = z.output<typeof partnerPlanSchema>;
export type PartnerCapacityStatus = z.output<typeof partnerCapacityStatusSchema>;
export type PartnerLicenseStatus = z.output<typeof partnerLicenseStatusSchema>;
export type AccreditationDocumentType = z.output<typeof accreditationDocumentTypeSchema>;
export type AccreditationDocumentStatus = z.output<typeof accreditationDocumentStatusSchema>;
export type AccreditationScanStatus = z.output<typeof accreditationScanStatusSchema>;
export type PartnerAuthorizationStatus = z.output<typeof partnerAuthorizationStatusSchema>;
export type PartnerUserRole = z.output<typeof partnerUserRoleSchema>;
export type PartnerDto = z.input<typeof partnerCreateSchema>;
export type PartnerRecord = z.output<typeof partnerCreateSchema>;
export type PartnerLicenseDto = z.input<typeof partnerLicenseSchema>;
export type PartnerLicenseRecord = z.output<typeof partnerLicenseSchema>;
export type AccreditationDocumentDto = z.input<typeof accreditationDocumentSchema>;
export type AccreditationDocumentRecord = z.output<typeof accreditationDocumentSchema>;
export type PartnerAdminCreateDto = z.input<typeof partnerAdminCreateSchema>;
export type PartnerAdminCreateInput = z.output<typeof partnerAdminCreateSchema>;
export type PartnerAdminUpdateDto = z.input<typeof partnerAdminUpdateSchema>;
export type PartnerAdminUpdateInput = z.output<typeof partnerAdminUpdateSchema>;
export type AdminPartnerListQuery = z.output<typeof adminPartnerListQuerySchema>;
export type PartnerStatusTransitionDto = z.input<typeof partnerStatusTransitionSchema>;
export type PartnerLicenseCreateDto = z.input<typeof partnerLicenseCreateSchema>;
export type PartnerLicenseCreateInput = z.output<typeof partnerLicenseCreateSchema>;
export type PartnerLicenseRenewInput = z.output<typeof partnerLicenseRenewSchema>;
export type AccreditationDocumentUploadInput = z.output<typeof accreditationDocumentUploadSchema>;
export type AccreditationDocumentReviewDto = z.input<typeof accreditationDocumentReviewSchema>;
export type PartnerContractCreateDto = z.input<typeof partnerContractCreateSchema>;
export type PartnerContractCreateInput = z.output<typeof partnerContractCreateSchema>;
export type PartnerUserInviteDto = z.input<typeof partnerUserInviteSchema>;
export type PartnerUserInviteInput = z.output<typeof partnerUserInviteSchema>;
