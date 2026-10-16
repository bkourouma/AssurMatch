import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const partnerAgencyStatusSchema = z.enum(["active", "suspended"]);

/**
 * Spec 064: optional `agencyId` query parameter of the Enterprise lead and dashboard views. It is a
 * display filter only (never an access restriction): the uuid of an agency of the caller's tenant, or
 * the literal `none` for the leads without agency ("Sans agence"). A tenant that is not Enterprise
 * ignores it.
 */
export const AGENCY_FILTER_NONE = "none" as const;
export const agencyFilterSchema = z.union([uuidSchema, z.literal(AGENCY_FILTER_NONE)]);

export const partnerAgencySchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  name: nonEmptyStringSchema.max(120),
  countryCode: isoCountrySchema,
  city: z.string().trim().max(80).nullable(),
  status: partnerAgencyStatusSchema,
  memberCount: z.number().int().min(0),
  /** Spec 064: ids of the members of the agency (tenant-internal), used to default to the user's own agency. */
  memberIds: z.array(z.string()),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const partnerAgencyCreateSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  countryCode: isoCountrySchema,
  city: z.string().trim().max(80).optional(),
  reason: reasonSchema
});

export const partnerAgencyUpdateSchema = z.object({
  name: nonEmptyStringSchema.max(120).optional(),
  city: z.string().trim().max(80).optional(),
  status: partnerAgencyStatusSchema.optional(),
  reason: reasonSchema
}).refine((input) => input.name !== undefined || input.city !== undefined || input.status !== undefined, "At least one agency field must change");

export const partnerAgencyMemberSchema = z.object({ memberId: nonEmptyStringSchema.max(80), reason: reasonSchema });

/**
 * Permissions a tenant custom role may grant. The catalogue is deliberately limited to broker CRM
 * and lead capabilities: a custom role can never reach admin, billing or platform permissions.
 */
export const brokerCustomPermissions = [
  "broker_leads:read",
  "broker_leads:update",
  "broker_leads:export",
  "broker_crm:read",
  "broker_crm:read_assigned",
  "broker_crm:update",
  "broker_crm:update_assigned",
  "broker_crm:assign",
  "broker_crm:export",
  "notifications:read"
] as const;
export const brokerCustomPermissionSchema = z.enum(brokerCustomPermissions);

export const partnerCustomRoleSchema = z.object({
  id: uuidSchema,
  partnerTenantId: uuidSchema,
  name: nonEmptyStringSchema.max(60),
  permissions: z.array(brokerCustomPermissionSchema),
  rejectedPermissions: z.array(z.string()),
  /** Spec 064: ids of the members holding this role (a member holds at most one custom role). */
  memberIds: z.array(z.string()),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const partnerCustomRoleCreateSchema = z.object({
  name: nonEmptyStringSchema.max(60),
  permissions: z.array(z.string().trim().max(60)).min(1).max(20),
  reason: reasonSchema
});

/**
 * Spec 064: assigns (or clears, with `null`) the custom role of a member of the same tenant.
 * The effective permissions stay the intersection of the base role and the custom role.
 */
export const partnerCustomRoleAssignSchema = z.object({
  customRoleId: uuidSchema.nullable(),
  reason: reasonSchema
});

export const partnerCustomRoleAssignmentSchema = z.object({
  userId: z.string().min(1).max(80),
  customRole: z.object({ id: uuidSchema, name: nonEmptyStringSchema.max(60) }).nullable()
});

export const partnerCustomRoleUpdateSchema = z.object({
  permissions: z.array(z.string().trim().max(60)).min(1).max(20),
  reason: reasonSchema
});

export const partnerSlaSchema = z.object({
  partnerTenantId: uuidSchema,
  firstActionTargetMinutes: z.number().int().min(5).max(10_080),
  windowDays: z.number().int().min(1).max(90),
  leadsMeasured: z.number().int().min(0),
  leadsWithinTarget: z.number().int().min(0),
  complianceRate: z.number().min(0).max(1),
  averageFirstActionMinutes: z.number().nullable(),
  /** Spec 062 E-08: first reply the visitor sees (first proposal or first broker message); additive, optional. */
  averageFirstVisibleReplyMinutes: z.number().nullable().optional(),
  firstVisibleReplyMeasured: z.number().int().min(0).optional(),
  firstVisibleReplyWithinTarget: z.number().int().min(0).optional(),
  firstVisibleReplyComplianceRate: z.number().min(0).max(1).nullable().optional(),
  updatedAt: dateTimeStringSchema.nullable()
});

export const partnerSlaUpdateSchema = z.object({
  firstActionTargetMinutes: z.number().int().min(5).max(10_080),
  reason: reasonSchema
});

export const brokerBrandingSchema = z.object({
  partnerTenantId: uuidSchema,
  displayLabel: nonEmptyStringSchema.max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Always present: the broker portal must keep stating who operates the platform. */
  platformMention: z.literal("Plateforme technique AssurMatch"),
  updatedAt: dateTimeStringSchema.nullable()
});

export const brokerBrandingUpdateSchema = z.object({
  displayLabel: nonEmptyStringSchema.max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  reason: reasonSchema
});

export const adminPartnerSlaRowSchema = z.object({
  partnerTenantId: uuidSchema,
  partnerName: nonEmptyStringSchema,
  plan: z.enum(["starter", "pro", "enterprise"]),
  firstActionTargetMinutes: z.number().int().min(5).max(10_080),
  leadsMeasured: z.number().int().min(0),
  leadsWithinTarget: z.number().int().min(0),
  complianceRate: z.number().min(0).max(1),
  averageFirstActionMinutes: z.number().nullable(),
  /** Spec 062 E-08: first reply the visitor sees (first proposal or first broker message); additive, optional. */
  averageFirstVisibleReplyMinutes: z.number().nullable().optional(),
  firstVisibleReplyMeasured: z.number().int().min(0).optional(),
  firstVisibleReplyWithinTarget: z.number().int().min(0).optional(),
  firstVisibleReplyComplianceRate: z.number().min(0).max(1).nullable().optional()
});

export type PartnerAgency = z.infer<typeof partnerAgencySchema>;
export type PartnerAgencyCreate = z.infer<typeof partnerAgencyCreateSchema>;
export type PartnerAgencyUpdate = z.infer<typeof partnerAgencyUpdateSchema>;
export type BrokerCustomPermission = z.infer<typeof brokerCustomPermissionSchema>;
export type PartnerCustomRole = z.infer<typeof partnerCustomRoleSchema>;
export type PartnerCustomRoleAssign = z.infer<typeof partnerCustomRoleAssignSchema>;
export type PartnerCustomRoleAssignment = z.infer<typeof partnerCustomRoleAssignmentSchema>;
export type PartnerSla = z.infer<typeof partnerSlaSchema>;
export type BrokerBranding = z.infer<typeof brokerBrandingSchema>;
export type AdminPartnerSlaRow = z.infer<typeof adminPartnerSlaRowSchema>;
