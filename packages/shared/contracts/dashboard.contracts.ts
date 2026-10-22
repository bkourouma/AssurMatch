import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";
import { agencyFilterSchema } from "./enterprise.contracts";

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

export const dashboardCompareSchema = z.enum(["previous"]);

const baseScopeQueryObject = baseTimeWindowObject.extend({
  compare: dashboardCompareSchema.optional(),
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  partnerId: uuidSchema.optional(),
  agentId: uuidSchema.optional(),
  /** Spec 064: Enterprise display filter by agency (uuid or `none`); ignored by other plans. */
  agencyId: agencyFilterSchema.optional()
});

export const dashboardScopeQuerySchema = baseScopeQueryObject.superRefine(refineWindow);

export const complianceAlertCategorySchema = z.enum([
  "consent_missing",
  "crm_flag_closed",
  "rbac_denied",
  "cross_tenant_attempt",
  "broker_satisfaction_concern",
  "routing_anomaly",
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

export const brokerSatisfactionSummarySchema = z.object({
  averageRating: z.number().nullable(),
  responseCount: z.number().int().min(0),
  flaggedCount: z.number().int().min(0)
});

export type BrokerSatisfactionSummary = z.infer<typeof brokerSatisfactionSummarySchema>;

export const brokerStarterDashboardSectionSchema = z.object({
  received: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  disputed: z.number().int().min(0),
  pendingAction: z.number().int().min(0),
  averageFirstActionMinutes: z.number().nullable(),
  /** Spec 062 E-08: additive, optional. */
  averageFirstVisibleReplyMinutes: z.number().nullable().optional(),
  firstVisibleReplyMeasured: z.number().int().min(0).optional(),
  byProduct: z.array(z.object({ productKey: nonEmptyStringSchema, total: z.number().int().min(0) })),
  byCountry: z.array(z.object({ countryCode: isoCountrySchema, total: z.number().int().min(0) })),
  satisfaction: brokerSatisfactionSummarySchema.optional()
});

/** One source of requests (DASH-B-008). The CRM `source` of the lead is used: no UTM/marketing attribution is captured. */
export const brokerCrmSourceRowSchema = z.object({
  source: nonEmptyStringSchema,
  received: z.number().int().min(0),
  won: z.number().int().min(0),
  /** won / received, 0 when nothing was received. */
  conversionRate: z.number().min(0).max(1)
});

/** Estimated lead cost from the billing tariff of the plan (DASH-B-009); never an invoice amount. */
export const brokerLeadCostSchema = z.object({
  currency: nonEmptyStringSchema,
  estimatedTotal: z.number().min(0),
  perLead: z.number().min(0),
  /** null when no lead was won in the scope. */
  perWonLead: z.number().min(0).nullable(),
  basis: z.literal("billing_tariff_estimate")
});

/**
 * Pro/Enterprise CRM KPIs (PRD §20, DASH-B-001..009), computed on the same scope as the dashboard
 * (window, filters, agency). Rates are ratios in [0, 1] over the leads received.
 * - contactRate: leads that reached a "contacted" status (contacte, qualifie, documents_demandes,
 *   devis_en_preparation, devis_envoye, negociation, gagne; `contact_tente` does not count).
 * - averageFirstContactMinutes: assignment -> first transition to such a status. Distinct from
 *   `starter.averageFirstActionMinutes` (first view) and from `averageReceptionToFirstActivityMinutes`
 *   (first history event of any kind).
 * - qualificationRate: leads that reached `qualifie` or a later status.
 * - quotesSent: distinct leads with a CRM proposal or having reached `devis_envoye`, and the total of CRM proposals.
 */
export const brokerCrmKpisSchema = z.object({
  contactRate: z.number().min(0).max(1),
  averageFirstContactMinutes: z.number().nullable(),
  qualificationRate: z.number().min(0).max(1),
  quotesSent: z.object({ leads: z.number().int().min(0), proposals: z.number().int().min(0) }),
  topSources: z.array(brokerCrmSourceRowSchema),
  leadCost: brokerLeadCostSchema.optional()
});

export const brokerCrmDashboardSectionSchema = z.object({
  pipeline: z.array(z.object({ status: nonEmptyStringSchema, total: z.number().int().min(0) })),
  byAssignedAdvisor: z.array(z.object({ advisorId: nonEmptyStringSchema, total: z.number().int().min(0) })),
  conversionByProduct: z.array(z.object({
    productKey: nonEmptyStringSchema,
    received: z.number().int().min(0),
    accepted: z.number().int().min(0),
    /** Leads won (crmStatus `gagne`); `rate` is won / received. */
    won: z.number().int().min(0).optional(),
    rate: z.number().min(0).max(1)
  })),
  /** Global conversion = leads won / leads received (0 when nothing was received). */
  conversionRate: z.number().min(0).max(1).optional(),
  kpis: brokerCrmKpisSchema.optional(),
  averageReceptionToFirstActivityMinutes: z.number().nullable(),
  upcomingTasks: z.number().int().min(0),
  upcomingReminders: z.number().int().min(0),
  satisfaction: brokerSatisfactionSummarySchema.optional()
});

export const brokerDashboardResponseSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
  window: dashboardWindowDtoSchema,
  starter: brokerStarterDashboardSectionSchema,
  crm: brokerCrmDashboardSectionSchema.optional(),
  licenseAlerts: z.array(licenseAlertItemSchema),
  comparison: z.lazy(() => dashboardComparisonSchema).optional()
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
    brokerSatisfactionConcern: z.number().int().min(0).optional(),
    routingAnomaly: z.number().int().min(0).optional(),
    other: z.number().int().min(0)
  }),
  sensitiveFeatureFlags: z.array(featureFlagSummarySchema),
  comparison: z.lazy(() => dashboardComparisonSchema).optional()
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
  "ai_broker_assistant_enabled",
  "ai_routing_anomaly_detection_enabled"
] as const;

export const dashboardComparisonSchema = z.object({
  previousWindow: dashboardWindowDtoSchema,
  previous: z.object({
    received: z.number().int().min(0),
    accepted: z.number().int().min(0),
    refused: z.number().int().min(0)
  }),
  delta: z.object({
    received: z.number().int(),
    accepted: z.number().int(),
    refused: z.number().int()
  })
});

export const advisorPerformanceRowSchema = z.object({
  advisorId: nonEmptyStringSchema,
  received: z.number().int().min(0),
  accepted: z.number().int().min(0),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  conversionRate: z.number().min(0).max(1),
  averageFirstActionMinutes: z.number().nullable()
});

export type DashboardComparison = z.infer<typeof dashboardComparisonSchema>;
export type AdvisorPerformanceRow = z.infer<typeof advisorPerformanceRowSchema>;


export const routingAnomalyTypeSchema = z.enum([
  "unassigned_leads",
  "sla_breach_risk",
  "quota_saturation",
  "distribution_skew"
]);
export type RoutingAnomalyType = z.infer<typeof routingAnomalyTypeSchema>;

export const routingAnomalySeveritySchema = z.enum(["warning", "critical"]);
export type RoutingAnomalySeverity = z.infer<typeof routingAnomalySeveritySchema>;

export const routingAnomalyItemSchema = z.object({
  id: nonEmptyStringSchema,
  type: routingAnomalyTypeSchema,
  severity: routingAnomalySeveritySchema,
  detectedAt: dateTimeStringSchema,
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  targetId: nonEmptyStringSchema.optional(),
  details: z.string(),
  metricValue: z.number().optional(),
  metricThreshold: z.number().optional()
});
export type RoutingAnomalyItem = z.infer<typeof routingAnomalyItemSchema>;

export const routingAnomalyReportSchema = z.object({
  generatedAt: dateTimeStringSchema,
  totalAnomalies: z.number().int().min(0),
  criticalCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),
  anomalies: z.array(routingAnomalyItemSchema),
  recommendations: z.array(z.string()).optional()
});
export type RoutingAnomalyReport = z.infer<typeof routingAnomalyReportSchema>;

/** PRD §6.3: one row of the Enterprise multi-agency view; `agencyId` is `none` for advisors in no agency. */
export const brokerAgencyOverviewRowSchema = z.object({
  agencyId: agencyFilterSchema,
  agencyName: nonEmptyStringSchema,
  advisors: z.number().int().min(0),
  received: z.number().int().min(0),
  accepted: z.number().int().min(0),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  contactRate: z.number().min(0).max(1),
  /** won / received. */
  conversionRate: z.number().min(0).max(1),
  averageFirstContactMinutes: z.number().nullable()
});

export type BrokerCrmSourceRow = z.infer<typeof brokerCrmSourceRowSchema>;
export type BrokerLeadCost = z.infer<typeof brokerLeadCostSchema>;
export type BrokerCrmKpis = z.infer<typeof brokerCrmKpisSchema>;
export type BrokerAgencyOverviewRow = z.infer<typeof brokerAgencyOverviewRowSchema>;
