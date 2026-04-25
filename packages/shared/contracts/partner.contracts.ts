import { z } from "zod";
import { dateStringSchema, e164PhoneSchema, emailSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const partnerCreateSchema = z.object({
  id: uuidSchema.optional(),
  legalName: nonEmptyStringSchema,
  tradeName: z.string().optional(),
  registrationNumber: z.string().optional(),
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  status: z.enum(["draft", "pending_compliance", "active", "suspended", "retired"]).default("draft"),
  suspensionReason: z.string().optional(),
  primaryEmail: emailSchema,
  primaryWhatsApp: e164PhoneSchema,
  quotaMonthlyLeads: z.number().int().min(0).default(0),
  capacityStatus: z.enum(["available", "limited", "full", "blocked"]).default("available")
});

export const partnerUpdateSchema = partnerCreateSchema.partial().extend({
  reason: reasonSchema
});

export const partnerLicenseSchema = z.object({
  id: uuidSchema.optional(),
  partnerTenantId: uuidSchema,
  licenseNumber: nonEmptyStringSchema,
  issuingAuthority: nonEmptyStringSchema,
  countryId: uuidSchema,
  productIds: z.array(uuidSchema).default([]),
  status: z.enum(["draft", "pending_review", "valid", "expired", "suspended", "invalid", "revoked"]).default("draft"),
  effectiveDate: dateStringSchema,
  expirationDate: dateStringSchema
});

export const accreditationDocumentSchema = z.object({
  id: uuidSchema.optional(),
  partnerTenantId: uuidSchema,
  licenseId: uuidSchema.optional(),
  documentType: z.enum(["license", "registration", "identity", "mandate", "compliance_certificate", "other"]),
  storageKey: nonEmptyStringSchema,
  checksum: nonEmptyStringSchema,
  status: z.enum(["uploaded", "pending_review", "accepted", "rejected", "expired", "superseded"]).default("uploaded"),
  expirationDate: dateStringSchema.optional()
});

export type PartnerDto = z.input<typeof partnerCreateSchema>;
export type PartnerRecord = z.output<typeof partnerCreateSchema>;
export type PartnerLicenseDto = z.input<typeof partnerLicenseSchema>;
export type PartnerLicenseRecord = z.output<typeof partnerLicenseSchema>;
export type AccreditationDocumentDto = z.input<typeof accreditationDocumentSchema>;
export type AccreditationDocumentRecord = z.output<typeof accreditationDocumentSchema>;
