import type {
  AdminDashboardLeadQuality,
  AdminDashboardRevenue
} from "../../../../packages/shared/contracts/dashboard.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { IssuedInvoice } from "../../../../packages/shared/contracts/billing.contracts";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { LeadDisputeRecord } from "../leads/crm-activity.repository";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { isWithinWindow, type ResolvedDashboardWindow } from "./dashboard-time-window";
import type { ResolvedAdminScope } from "./dashboards-access-policy";

/**
 * Spec 073 T302: pure helpers of the extra admin dashboard KPIs (PRD section 21). Everything here
 * reads already-stored aggregates: nothing generates AI output and nothing calls a provider.
 */

/** AI insight as the dashboard needs it (a projection of the AI interaction; no prompt, no input). */
export interface AdminAiInsightView {
  id: string;
  assistType: string;
  humanValidationStatus: string;
  outputText: string | null;
  createdAt: Date;
  actorId: string | null;
}

/** Read-only access to the stored admin_platform insights. */
export interface AdminAiInsightsPort {
  list(): Promise<AdminAiInsightView[]>;
}

export interface AdminVisitStatsPort {
  /** Absent means enabled. */
  isEnabled?: (() => boolean) | undefined;
  totalsBetween(from: Date, to: Date): Promise<{ total: number; byPage: Array<{ page: string; total: number }> }>;
}

export interface AdminInvoicesPort {
  list(actor: ActorContext, query: Record<string, never>): Promise<IssuedInvoice[]>;
}

export interface AdminLeadDisputesPort {
  listDisputes(filter: { from?: Date | undefined; to?: Date | undefined }): Promise<LeadDisputeRecord[]>;
}

export const AI_SUMMARY_EXCERPT_MAX = 600;
export const AI_ALERT_ITEMS_MAX = 5;
export const AI_ALERT_ASSIST_TYPES: ReadonlySet<string> = new Set([
  "admin_risk_triage",
  "routing_anomaly_analysis",
  "offer_consistency_check",
  "activation_gap_summary"
]);
/** Flags that open the admin AI insights; all closed means "IA desactivee". */
export const AI_ADMIN_FLAG_KEYS = ["ai_summary_enabled", "ai_routing_anomaly_detection_enabled"] as const;

const journeyPolicy = new PublicJourneyFlagPolicy();

/** Same rule as GET /admin/ai/insights (AdminAiService.assertAccess, read mode); MFA is checked by the dashboard. */
export function actorCanReadAiInsights(actor: ActorContext): boolean {
  return actor.roles.some((role) => roleHasPermission(role, "ai:*") || roleHasPermission(role, "ai:read") || role === "compliance_admin");
}

export function boundedExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > AI_SUMMARY_EXCERPT_MAX ? `${trimmed.slice(0, AI_SUMMARY_EXCERPT_MAX - 1)}…` : trimmed;
}

/** Rounded to 4 decimals; null when there is no visit. */
export function visitToRequestRate(requests: number, visits: number): number | null {
  if (visits <= 0) return null;
  return Math.round((requests / visits) * 10_000) / 10_000;
}

/** Countries whose public journey is open (same rule as PublicStatsService), inside the admin scope. */
export function countActiveCountries(
  countries: Array<{ isoCode: string; flags?: unknown }>,
  globalFlags: Partial<Record<string, boolean>>,
  scope: ResolvedAdminScope
): number {
  return countries.filter((country) => {
    if (scope.countries.length > 0 && !scope.countries.includes(country.isoCode.toUpperCase())) return false;
    return journeyPolicy.resolve({ globalFlags, countryFlags: (country.flags ?? undefined) as never }).publicEnabled;
  }).length;
}

/** Products that are public and not suspended/retired, inside the admin scope. */
export function countActiveProducts(
  products: Array<{ key: string; status?: string | undefined; flags?: { product_public_enabled?: boolean } | undefined }>,
  scope: ResolvedAdminScope
): number {
  return products.filter((product) => {
    if (scope.products.length > 0 && !scope.products.includes(product.key)) return false;
    if (product.status === "suspended" || product.status === "retired") return false;
    return product.flags?.product_public_enabled === true;
  }).length;
}

// Lot 6: duplicated minimum, dedupe after lot 3 merge
/** Minutes between the assignment and the first broker action (same definition as GET /admin/partners/sla). */
function firstActionMinutes(assignment: LeadAssignmentRecord): number | null {
  const firstAction = assignment.seenAt ?? assignment.acceptedAt ?? assignment.lastBrokerActionAt ?? assignment.crmUpdatedAt;
  if (!firstAction) return null;
  return Math.max(0, Math.round((firstAction.getTime() - assignment.assignedAt.getTime()) / 60_000));
}

// Lot 6: duplicated minimum, dedupe after lot 3 merge
export function summarisePartnerSla(assignments: LeadAssignmentRecord[]): { averageFirstActionMinutes: number | null; measured: number } {
  const delays = assignments.map(firstActionMinutes).filter((minutes): minutes is number => minutes !== null);
  return {
    averageFirstActionMinutes: delays.length === 0 ? null : Math.round(delays.reduce((sum, minutes) => sum + minutes, 0) / delays.length),
    measured: delays.length
  };
}

/** Disputes opened in the window (inside the admin scope) over the leads transmitted in the window. */
export function summariseLeadQuality(
  assignmentsInWindow: LeadAssignmentRecord[],
  disputes: LeadDisputeRecord[],
  allAssignments: LeadAssignmentRecord[],
  window: ResolvedDashboardWindow,
  inScope: (assignment: Pick<LeadAssignmentRecord, "partnerTenantId" | "countryCode" | "productKey">) => boolean
): AdminDashboardLeadQuality {
  const byId = new Map(allAssignments.map((assignment) => [assignment.id, assignment]));
  const disputed = disputes.filter((dispute) => {
    if (!isWithinWindow(dispute.createdAt, window)) return false;
    const assignment = byId.get(dispute.leadAssignmentId);
    const countryCode = dispute.countryCode ?? assignment?.countryCode;
    return inScope({
      partnerTenantId: dispute.partnerTenantId,
      ...(countryCode ? { countryCode } : {}),
      ...(assignment?.productKey ? { productKey: assignment.productKey } : {})
    });
  }).length;
  const transmitted = assignmentsInWindow.length;
  return {
    transmitted,
    disputed,
    accepted: assignmentsInWindow.filter((assignment) => assignment.status === "accepted").length,
    rejected: assignmentsInWindow.filter((assignment) => assignment.status === "rejected").length,
    disputeRate: transmitted === 0 ? null : Math.round((disputed / transmitted) * 10_000) / 10_000
  };
}

const SUBSCRIPTION_LINE_KINDS: ReadonlySet<string> = new Set(["subscription", "setup_fee", "add_on"]);

/**
 * Invoices issued in the window: subscription lines (subscription, set-up fee, add-ons) and lead
 * lines (billed leads, shared leads, pack/dispute credits that are not merely informational),
 * excluding the cancelled invoices and net of the partial (dispute) credit notes, ex VAT. One row
 * per currency, never converted.
 */
export function summariseRevenue(invoices: IssuedInvoice[], window: ResolvedDashboardWindow, scope: ResolvedAdminScope): AdminDashboardRevenue {
  const totals = new Map<string, { subscription: number; leads: number }>();
  for (const invoice of invoices) {
    if (invoice.status === "cancelled") continue;
    if (!isWithinWindow(invoice.issuedAt, window)) continue;
    if (scope.countries.length > 0 && !scope.countries.includes(invoice.countryCode.toUpperCase())) continue;
    if (scope.partnerId && invoice.customer.partnerId !== scope.partnerId) continue;
    const row = totals.get(invoice.currency) ?? { subscription: 0, leads: 0 };
    for (const line of invoice.lines) {
      if (line.informational) continue;
      if (SUBSCRIPTION_LINE_KINDS.has(line.kind)) row.subscription += line.amount;
      else row.leads += line.amount;
    }
    if (invoice.partialCreditsTotal) {
      row.leads -= Math.round(invoice.partialCreditsTotal / (1 + invoice.vatRatePercent / 100));
    }
    totals.set(invoice.currency, row);
  }
  return {
    byCurrency: [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, row]) => ({ currency, subscription: row.subscription, leads: row.leads }))
  };
}

export function summariseAiSummary(insights: AdminAiInsightView[]) {
  const latest = insights
    .filter((insight) => insight.assistType === "activity_report")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (!latest) return null;
  return {
    insightId: latest.id,
    generatedAt: latest.createdAt.toISOString(),
    status: latest.humanValidationStatus,
    excerpt: boundedExcerpt(latest.outputText)
  };
}

export function summariseAiAlerts(insights: AdminAiInsightView[]) {
  const pending = insights
    .filter((insight) => AI_ALERT_ASSIST_TYPES.has(insight.assistType) && insight.humanValidationStatus === "pending")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  return {
    pendingValidation: pending.length,
    items: pending.slice(0, AI_ALERT_ITEMS_MAX).map((insight) => ({
      insightId: insight.id,
      type: insight.assistType,
      createdAt: insight.createdAt.toISOString(),
      status: insight.humanValidationStatus
    }))
  };
}
