import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema, e164PhoneSchema, emailSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";
import {
  PARTNER_INSURERS_MAX,
  type AccreditationDocumentStatus,
  type AccreditationScanStatus,
  type PartnerCapacityStatus,
  type PartnerEffectiveStatus,
  type PartnerLicenseStatus,
  type PartnerPlan,
  type PartnerStatus
} from "./partner.contracts";

/* ------------------------------------------------------------------ enums */

/** Spec 053 R3: one table for the identity change requests (G-01) and the coverage extensions (G-04). */
export const partnerChangeRequestTypeSchema = z.enum(["profile_change", "coverage_extension"]);
export const partnerChangeRequestStatusSchema = z.enum(["pending", "accepted", "rejected", "cancelled"]);

/** Spec 053 R5: roles a broker owner or manager may give; the owner role stays an admin decision (051 R11). */
export const brokerTeamRoleSchema = z.enum(["broker_manager", "broker_agent", "broker_read_only"]);

const justificationSchema = z.string().trim().min(10, "A justification of at least 10 characters is required").max(1000);
const optionalCommentSchema = z.string().trim().max(500).optional();

/* -------------------------------------------------------- broker requests */

/**
 * Spec 053 R2 / FR-002: the only partner fields a broker owner or manager edits directly (contacts
 * and commercial presentation). `strict()`: any other key (legal name, RCCM, country, plan, quota,
 * status...) is refused with 400 instead of being silently ignored.
 */
export const brokerProfileUpdateSchema = z.object({
  primaryEmail: emailSchema.optional(),
  primaryWhatsApp: e164PhoneSchema.optional(),
  city: z.string().trim().min(2).max(120).optional(),
  adminContactName: z.string().trim().min(2).max(120).optional(),
  adminContactEmail: emailSchema.optional(),
  adminContactPhone: e164PhoneSchema.optional(),
  commercialContactName: z.string().trim().min(2).max(120).optional(),
  commercialContactEmail: emailSchema.optional(),
  commercialContactPhone: e164PhoneSchema.optional(),
  partnerInsurers: z.array(z.string().trim().min(1).max(120)).max(PARTNER_INSURERS_MAX).optional(),
  /** Optimistic concurrency: the `updatedAt` the broker loaded (409 when the record changed since). */
  expectedUpdatedAt: dateTimeStringSchema.optional(),
  reason: optionalCommentSchema
}).strict();

/** Spec 053 FR-003: identity fields only change through a request decided by the admin. */
export const PROFILE_CHANGE_FIELDS = ["legalName", "tradeName", "registrationNumber", "countryId"] as const;

export const partnerProfileChangeRequestSchema = z.object({
  legalName: z.string().trim().min(2).max(160).optional(),
  tradeName: z.string().trim().min(2).max(160).optional(),
  registrationNumber: z.string().trim().min(2).max(64).optional(),
  countryId: uuidSchema.optional(),
  justification: justificationSchema
}).strict().refine((value) => PROFILE_CHANGE_FIELDS.some((field) => value[field] !== undefined), {
  message: "At least one identity field must be requested",
  path: ["legalName"]
});

/** Spec 053 FR-013: one country or one product per extension request. */
export const partnerCoverageExtensionRequestSchema = z.object({
  countryId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  justification: justificationSchema
}).strict().refine((value) => (value.countryId === undefined) !== (value.productId === undefined), {
  message: "Request exactly one country or one product",
  path: ["countryId"]
});

export const partnerRequestCancelSchema = z.object({ reason: optionalCommentSchema }).strict();

/** Spec 053 R4: a renewal keeps the country of the licence it renews. */
export const brokerLicenseRenewalSchema = z.object({
  licenseNumber: z.string().trim().min(3).max(64),
  issuingAuthority: z.string().trim().min(2).max(160),
  /** Empty means every product of the country, as for an admin-created licence. */
  productIds: z.array(uuidSchema).max(50).default([]),
  effectiveDate: dateStringSchema,
  expirationDate: dateStringSchema,
  reason: optionalCommentSchema
}).strict().refine((value) => value.effectiveDate <= value.expirationDate, {
  message: "expirationDate must not precede effectiveDate",
  path: ["expirationDate"]
});

/** Multipart text fields that accompany `file` on POST /broker/licenses/:id/documents. */
export const brokerLicenseProofUploadSchema = z.object({ reason: optionalCommentSchema });

export const brokerTeamInviteSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(120),
  role: brokerTeamRoleSchema,
  reason: optionalCommentSchema
}).strict();

export const brokerTeamRoleChangeSchema = z.object({ role: brokerTeamRoleSchema, reason: reasonSchema }).strict();
export const brokerTeamActionSchema = z.object({ reason: reasonSchema }).strict();

/* --------------------------------------------------------- admin requests */

export const partnerRequestDecisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: reasonSchema
}).strict();

export const adminPartnerRequestListQuerySchema = z.object({
  partnerTenantId: uuidSchema.optional(),
  status: partnerChangeRequestStatusSchema.optional(),
  type: partnerChangeRequestTypeSchema.optional()
});

/* ------------------------------------------------------------------ views */

export interface PartnerChangeRequestView {
  id: string;
  partnerTenantId: string;
  type: PartnerChangeRequestType;
  status: PartnerChangeRequestStatus;
  requestedChanges: Record<string, string>;
  previousValues: Record<string, string | null>;
  justification: string;
  requestedById: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerCoverageItemView {
  scopeId: string;
  name: string;
  /** ISO code for a country, product key for a product. */
  code: string;
  /** Covered by at least one valid, unexpired licence of the partner. */
  licensed: boolean;
}

export interface BrokerCatalogChoiceView {
  id: string;
  name: string;
  code: string;
}

/** Spec 053 FR-013: targets of an extension request (catalogue entries that are not retired). */
export interface BrokerCatalogChoicesView {
  countries: BrokerCatalogChoiceView[];
  products: BrokerCatalogChoiceView[];
}

export interface BrokerCoverageView {
  countries: BrokerCoverageItemView[];
  products: BrokerCoverageItemView[];
}

export interface BrokerAccountView {
  id: string;
  legalName: string;
  tradeName: string | null;
  registrationNumber: string | null;
  countryId: string | null;
  countryName: string | null;
  city: string | null;
  primaryEmail: string;
  primaryWhatsApp: string;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  commercialContactName: string | null;
  commercialContactEmail: string | null;
  commercialContactPhone: string | null;
  partnerInsurers: string[];
  plan: PartnerPlan;
  status: PartnerStatus;
  effectiveStatus: PartnerEffectiveStatus;
  quotaMonthlyLeads: number;
  capacityStatus: PartnerCapacityStatus;
  /** Contractual first-action target set by the admin (051 R9). */
  slaTargetMinutes: number | null;
  nextLicenseExpiration: string | null;
  coverage: BrokerCoverageView;
  pendingRequests: PartnerChangeRequestView[];
  updatedAt: string;
}

export interface BrokerLicenseDocumentView {
  id: string;
  fileName: string | null;
  sizeBytes: number | null;
  scanStatus: AccreditationScanStatus;
  status: AccreditationDocumentStatus;
  quarantined: boolean;
  createdAt: string;
}

/** Status history without the internal compliance reasons (spec 053 assumption). */
export interface BrokerLicenseHistoryView {
  fromStatus: PartnerLicenseStatus | null;
  toStatus: PartnerLicenseStatus;
  createdAt: string;
}

export interface BrokerLicenseView {
  id: string;
  licenseNumber: string;
  issuingAuthority: string;
  countryId: string;
  countryName: string | null;
  productIds: string[];
  productNames: string[];
  status: PartnerLicenseStatus;
  effectiveStatus: PartnerLicenseStatus;
  effectiveDate: string;
  expirationDate: string;
  renewsLicenseId: string | null;
  /** A renewal of this licence is in progress (draft or pending review). */
  pendingRenewalId: string | null;
  canRenew: boolean;
  canUploadProof: boolean;
  history: BrokerLicenseHistoryView[];
  documents: BrokerLicenseDocumentView[];
  createdAt: string;
}

export interface BrokerTeamMemberView {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  status: string;
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  isSelf: boolean;
  isOwner: boolean;
  createdAt: string;
}

export interface BrokerTeamInviteResult {
  member: BrokerTeamMemberView;
  emailStatus: string;
  expiresAt: string;
}

/* ------------------------------------------------------------------ types */

export type PartnerChangeRequestType = z.output<typeof partnerChangeRequestTypeSchema>;
export type PartnerChangeRequestStatus = z.output<typeof partnerChangeRequestStatusSchema>;
export type BrokerTeamRole = z.output<typeof brokerTeamRoleSchema>;
export type BrokerProfileUpdateInput = z.output<typeof brokerProfileUpdateSchema>;
export type PartnerProfileChangeRequestInput = z.output<typeof partnerProfileChangeRequestSchema>;
export type PartnerCoverageExtensionRequestInput = z.output<typeof partnerCoverageExtensionRequestSchema>;
export type BrokerLicenseRenewalInput = z.output<typeof brokerLicenseRenewalSchema>;
export type BrokerTeamInviteInput = z.output<typeof brokerTeamInviteSchema>;
export type PartnerRequestDecisionInput = z.output<typeof partnerRequestDecisionSchema>;
