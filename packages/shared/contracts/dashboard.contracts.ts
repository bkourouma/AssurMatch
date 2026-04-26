import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

const MAX_WINDOW_DAYS = 365;
const MIN_WINDOW_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const baseTimeWindowObject = z.object({
  from: dateTimeStringSchema.optional(),
  to: dateTimeStringSchema.optional()
});

function refineWindow(value: { from?: string | undefined; to?: string | undefined }, ctx: z.RefinementCtx): void {
  if (!value.from && !value.to) return;
  if (!value.from || !value.to) return;
  const fromDate = new Date(value.from).getTime();
  const toDate = new Date(value.to).getTime();
  if (Number.isNaN(fromDate) || Number.isNaN(toDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid window timestamps" });
    return;
  }
  if (fromDate >= toDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Window from must be before to" });
    return;
  }
  const span = toDate - fromDate;
  if (span > MAX_WINDOW_DAYS * DAY_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Window exceeds 365 days" });
    return;
  }
  if (span < MIN_WINDOW_DAYS * DAY_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Window is shorter than 1 day" });
    return;
  }
  if (toDate > Date.now() + DAY_MS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Window cannot extend into the future" });
  }
}

export const dashboardTimeWindowSchema = baseTimeWindowObject.superRefine(refineWindow);

const baseScopeQueryObject = baseTimeWindowObject.extend({
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  partnerId: uuidSchema.optional(),
  agentId: uuidSchema.optional()
});

export const dashboardScopeQuerySchema = baseScopeQueryObject.superRefine(refineWindow);

export const complianceAlertCategorySchema = z.enum([
  "consent_missing",
  "crm_flag_closed",
  "rbac_denied",
  "cross_tenant_attempt",
  "other"
]);

const baseComplianceAlertsQueryObject = baseTimeWindowObject.extend({
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  partnerId: uuidSchema.optional(),
  category: complianceAlertCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const complianceAlertsQuerySchema = baseComplianceAlertsQueryObject.superRefine(refineWindow);

export const dashboardWindowDtoSchema = z.object({ from: dateTimeStringSchema, to: dateTimeStringSchema });

export const licenseAlertItemSchema = z.object({
  licenseId: nonEmptyStringSchema,
  partnerTenantId: uuidSchema,
  countryCode: isoCountrySchema,
  productKey: nonEmptyStringSchema.nullable(),
  status: z.enum(["expired", "expiring_soon"]),
  expiresAt: dateTimeStringSchema
});

export const brokerStarterDashboardSectionSchema = z.object({
  received: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  disputed: z.number().int().min(0),
  pendingAction: z.number().int().min(0),
  averageFirstActionMinutes: z.number().nullable(),
  byProduct: z.array(z.object({ productKey: nonEmptyStringSchema, total: z.number().int().min(0) })),
  byCountry: z.array(z.object({ countryCode: isoCountrySchema, total: z.number().int().min(0) }))
});

export const brokerCrmDashboardSectionSchema = z.object({
  pipeline: z.array(z.object({ status: nonEmptyStringSchema, total: z.number().int().min(0) })),
  byAssignedAdvisor: z.array(z.object({ advisorId: nonEmptyStringSchema, total: z.number().int().min(0) })),
  conversionByProduct: z.array(z.object({
    productKey: nonEmptyStringSchema,
    received: z.number().int().min(0),
    accepted: z.number().int().min(0),
    rate: z.number().min(0).max(1)
  })),
  averageReceptionToFirstActivityMinutes: z.number().nullable(),
  upcomingTasks: z.number().int().min(0),
  upcomingReminders: z.number().int().min(0)
});

export const brokerDashboardResponseSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
  window: dashboardWindowDtoSchema,
  starter: brokerStarterDashboardSectionSchema,
  crm: brokerCrmDashboardSectionSchema.optional(),
  licenseAlerts: z.array(licenseAlertItemSchema)
});

export const adminDashboardScopeSchema = z.object({
  countries: z.array(isoCountrySchema),
  products: z.array(nonEmptyStringSchema),
  partnerId: uuidSchema.nullable(),
  role: z.enum(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin"])
});

export const routingRefusalReasonCountSchema = z.object({ reason: nonEmptyStringSchema, total: z.number().int().min(0) });

export const featureFlagSummarySchema = z.object({
  key: nonEmptyStringSchema,
  scopeType: nonEmptyStringSchema,
  scopeId: nonEmptyStringSchema.nullable(),
  value: z.boolean()
});

export const adminDashboardResponseSchema = z.object({
  window: dashboardWindowDtoSchema,
  scope: adminDashboardScopeSchema,
  leadVolumes: z.object({
    received: z.number().int().min(0),
    transmitted: z.number().int().min(0),
    refused: z.number().int().min(0),
    nonRouted: z.number().int().min(0)
  }),
  nonRoutedReasons: z.array(routingRefusalReasonCountSchema),
  byCountry: z.array(z.object({ countryCode: isoCountrySchema, total: z.number().int().min(0) })),
  byProduct: z.array(z.object({ productKey: nonEmptyStringSchema, total: z.number().int().min(0) })),
  partners: z.object({ active: z.number().int().min(0), inactive: z.number().int().min(0) }),
  expiredOffersStillReferenced: z.number().int().min(0),
  licenseAlerts: z.object({ expired: z.number().int().min(0), expiringSoon: z.number().int().min(0) }),
  complianceAlertCounts: z.object({
    consentMissing: z.number().int().min(0),
    crmFlagClosed: z.number().int().min(0),
    rbacDenied: z.number().int().min(0),
    crossTenantAttempt: z.number().int().min(0),
    other: z.number().int().min(0)
  }),
  sensitiveFeatureFlags: z.array(featureFlagSummarySchema)
});

export const complianceAlertItemSchema = z.object({
  id: nonEmptyStringSchema,
  occurredAt: dateTimeStringSchema,
  category: complianceAlertCategorySchema,
  reason: nonEmptyStringSchema,
  actorId: nonEmptyStringSchema.nullable(),
  actorRoles: z.array(nonEmptyStringSchema),
  targetType: nonEmptyStringSchema,
  targetId: nonEmptyStringSchema.nullable(),
  partnerTenantId: nonEmptyStringSchema.nullable()
});

export const complianceAlertsResponseSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  items: z.array(complianceAlertItemSchema)
});

export type DashboardTimeWindowQuery = z.infer<typeof dashboardTimeWindowSchema>;
export type DashboardScopeQuery = z.infer<typeof dashboardScopeQuerySchema>;
export type DashboardWindowDto = z.infer<typeof dashboardWindowDtoSchema>;
export type ComplianceAlertCategory = z.infer<typeof complianceAlertCategorySchema>;
export type ComplianceAlertsQuery = z.infer<typeof complianceAlertsQuerySchema>;
export type LicenseAlertItem = z.infer<typeof licenseAlertItemSchema>;
export type BrokerStarterDashboardSection = z.infer<typeof brokerStarterDashboardSectionSchema>;
export type BrokerCrmDashboardSection = z.infer<typeof brokerCrmDashboardSectionSchema>;
export type BrokerDashboardResponse = z.infer<typeof brokerDashboardResponseSchema>;
export type AdminDashboardScope = z.infer<typeof adminDashboardScopeSchema>;
export type RoutingRefusalReasonCount = z.infer<typeof routingRefusalReasonCountSchema>;
export type FeatureFlagSummary = z.infer<typeof featureFlagSummarySchema>;
export type AdminDashboardResponse = z.infer<typeof adminDashboardResponseSchema>;
export type ComplianceAlertItem = z.infer<typeof complianceAlertItemSchema>;
export type ComplianceAlertsResponse = z.infer<typeof complianceAlertsResponseSchema>;

export const DashboardWindowDefaults = {
  defaultDays: 30,
  maxDays: MAX_WINDOW_DAYS,
  minDays: MIN_WINDOW_DAYS
} as const;

export const SensitiveFeatureFlagKeys = [
  "broker_dashboard_enabled",
  "broker_crm_enabled",
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "ai_lead_scoring_enabled",
  "ai_summary_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled"
] as const;
