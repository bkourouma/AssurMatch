import type {
  AdminDashboardResponse,
  DashboardComparison,
  DashboardScopeQuery,
  FeatureFlagSummary,
  RoutingRefusalReasonCount
} from "../../../../packages/shared/contracts/dashboard.contracts";
import { SensitiveFeatureFlagKeys } from "../../../../packages/shared/contracts/dashboard.contracts";
import type { ActorContext, AuditEntry } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { RoutingDecisionRecord } from "../leads/routing-decision.service";
import type { RoutingDecisionService } from "../leads/routing-decision.service";
import type { OffersModule } from "../offers/offers.module";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { logEvent } from "../observability/structured-logger";
import { countryCatalog, productCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import { DashboardsAccessPolicy, type ResolvedAdminScope } from "./dashboards-access-policy";
import { DashboardAuditActions } from "./dashboard-audit-actions";
import { isWithinWindow, resolveDashboardWindow, type ResolvedDashboardWindow } from "./dashboard-time-window";
import { categorizeAuditEntry } from "./compliance-alerts.service";
// Lot 6
import {
  AI_ADMIN_FLAG_KEYS,
  actorCanReadAiInsights,
  countActiveCountries,
  countActiveProducts,
  summariseAiAlerts,
  summariseAiSummary,
  summariseLeadQuality,
  summarisePartnerSla,
  summariseRevenue,
  visitToRequestRate,
  type AdminAiInsightsPort,
  type AdminInvoicesPort,
  type AdminLeadDisputesPort,
  type AdminVisitStatsPort
} from "./admin-dashboard-kpis";
// Lot 6 (end)

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminDashboardServiceDeps {
  access: DashboardsAccessPolicy;
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  assignments: LeadAssignmentService;
  decisions: RoutingDecisionService;
  quoteRequests: QuoteSubmissionService;
  partnerLicenses: PartnerLicensesService;
  partners: PartnersService;
  offers: OffersModule;
  countries: CountriesService;
  products: ProductsService;
  // Lot 6 (spec 073 T302): optional read-only ports; a missing port degrades its KPI to "not measured".
  visitStats?: AdminVisitStatsPort | undefined;
  invoices?: AdminInvoicesPort | undefined;
  leadDisputes?: AdminLeadDisputesPort | undefined;
  aiInsights?: AdminAiInsightsPort | undefined;
  // Lot 6 (end)
}

export class AdminDashboardService {
  constructor(private readonly deps: AdminDashboardServiceDeps) {}

  async dashboard(actor: ActorContext, query: DashboardScopeQuery): Promise<AdminDashboardResponse> {
    const role = this.deps.access.resolveAdminAccess(actor);
    const scopeInput: { country?: string | undefined; product?: string | undefined; partnerId?: string | undefined; agentId?: string | undefined } = {};
    if (query.country) scopeInput.country = query.country;
    if (query.product) scopeInput.product = query.product;
    if (query.partnerId) scopeInput.partnerId = query.partnerId;
    const scopedActor = await this.actorWithScopeCodes(actor);
    const scope = this.deps.access.resolveAdminScope(scopedActor, role, scopeInput);
    if (role === "finance_admin" || role === "content_admin") {
      this.deps.access.refuseAdmin(actor, "restricted_admin_dashboard_unavailable");
    }
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const countryMap = await this.buildCountryIsoMap();
    const isoToId = new Map<string, string>();
    for (const [id, iso] of countryMap.entries()) isoToId.set(iso, id);
    const allowedCountryIds = scope.countries.length > 0
      ? new Set<string>(scope.countries.map((iso) => isoToId.get(iso)).filter((id): id is string => Boolean(id)))
      : null;

    const allAssignments = await this.deps.assignments.list();
    const allQuoteRequests = await this.deps.quoteRequests.list();
    const allDecisions = await this.deps.decisions.list();
    const allPartners = await this.deps.partners.list();
    const allOffers = await this.deps.offers.repository.list();
    const allFlags = this.deps.featureFlags.list();
    const allAudits = this.deps.audit.all();

    await this.assertAdminPartnerFilterInScope(actor, scope, isoToId, allPartners);

    const assignmentsInWindow = allAssignments.filter((assignment) =>
      isWithinWindow(assignment.assignedAt, window) && this.assignmentInScope(assignment, scope, countryMap)
    );
    const quotesInWindow = allQuoteRequests.filter((quote) =>
      isWithinWindow((quote as { createdAt?: Date | string }).createdAt ?? window.from, window)
      && this.quoteInScope(quote, scope, allowedCountryIds)
    );
    const decisionsInWindow = allDecisions.filter((decision) => isWithinWindow(decision.createdAt, window));
    const auditsInWindow = allAudits.filter((entry) => isWithinWindow(entry.occurredAt, window));

    const transmitted = assignmentsInWindow.length;
    const received = quotesInWindow.length;
    const refused = decisionsInWindow.filter((decision) => decision.result === "blocked" || decision.result === "no_broker_available").length;
    const transmittedQuoteIds = new Set(assignmentsInWindow.map((assignment) => assignment.quoteRequestId));
    const nonRouted = quotesInWindow.filter((quote) => !transmittedQuoteIds.has((quote as { id?: string }).id ?? "")).length;

    const nonRoutedReasons = this.computeNonRoutedReasons(decisionsInWindow);
    const byCountry = this.groupCountByCountry(quotesInWindow, countryMap, scope);
    const byProduct = this.groupCountByProduct(quotesInWindow, scope);

    const partnerActive = allPartners.filter((partner) => partner.status === "active").length;
    const partnerInactive = allPartners.length - partnerActive;

    const expiredOffersStillReferenced = this.countExpiredOffers(allOffers, window);

    const licenseAlertCounts = await this.collectLicenseAlertCounts(allPartners, scope, isoToId);

    const complianceCounts = this.aggregateComplianceCounts(auditsInWindow);

    const sensitiveFeatureFlags = this.summariseSensitiveFlags(allFlags);

    this.deps.access.recordAdminSuccess(actor, scope, window);

    // Lot 6 (spec 073 T302)
    const extra = await this.buildExtraKpis(actor, scope, window, { received, assignmentsInWindow, allAssignments, countryMap });
    // Lot 6 (end)

    const response: AdminDashboardResponse = {
      window: window.dto,
      scope,
      leadVolumes: { received, transmitted, refused, nonRouted },
      nonRoutedReasons,
      byCountry,
      byProduct,
      partners: { active: partnerActive, inactive: partnerInactive },
      expiredOffersStillReferenced,
      licenseAlerts: licenseAlertCounts,
      complianceAlertCounts: complianceCounts,
      sensitiveFeatureFlags,
      ...extra,
      ...(query.compare === "previous"
        ? { comparison: this.buildComparison(allAssignments, window, (assignment) => this.assignmentInScope(assignment, scope, countryMap), { received, transmitted, refused }) }
        : {})
    };
    return response;
  }

  /** Same-length window immediately before the current one, restricted to the admin's scope. */
  private buildComparison(
    assignments: LeadAssignmentRecord[],
    window: ResolvedDashboardWindow,
    inScope: (assignment: LeadAssignmentRecord) => boolean,
    current: { received: number; transmitted: number; refused: number }
  ): DashboardComparison {
    const span = window.to.getTime() - window.from.getTime();
    const from = new Date(window.from.getTime() - span);
    const previousRecords = assignments.filter((assignment) => assignment.assignedAt >= from && assignment.assignedAt < window.from && inScope(assignment));
    const previous = {
      received: previousRecords.length,
      accepted: previousRecords.filter((assignment) => assignment.status === "accepted").length,
      refused: previousRecords.filter((assignment) => assignment.status === "rejected" || assignment.status === "disputed").length
    };
    return {
      previousWindow: { from: from.toISOString(), to: window.from.toISOString() },
      previous,
      delta: {
        received: current.received - previous.received,
        accepted: current.transmitted - previous.accepted,
        refused: current.refused - previous.refused
      }
    };
  }

  /** Aggregate CSV export for administrators; scope and audit reuse the dashboard policy. */
  async exportCsv(actor: ActorContext, query: DashboardScopeQuery): Promise<string> {
    const dashboard = await this.dashboard(actor, query);
    const lines = ["section,dimension,valeur"];
    lines.push(`fenetre,from,${dashboard.window.from}`);
    lines.push(`fenetre,to,${dashboard.window.to}`);
    for (const [key, value] of Object.entries(dashboard.leadVolumes)) lines.push(`volumes,${key},${value}`);
    for (const entry of dashboard.byCountry) lines.push(`pays,${entry.countryCode},${entry.total}`);
    for (const entry of dashboard.byProduct) lines.push(`produit,${entry.productKey},${entry.total}`);
    for (const entry of dashboard.nonRoutedReasons) lines.push(`non_route,${entry.reason},${entry.total}`);
    lines.push(`partenaires,actifs,${dashboard.partners.active}`);
    lines.push(`partenaires,inactifs,${dashboard.partners.inactive}`);
    // Lot 6 (spec 073 T303)
    lines.push(...this.extraCsvLines(dashboard));
    // Lot 6 (end)
    await this.deps.audit.writeAsync({
      actor,
      action: DashboardAuditActions.adminExported,
      targetType: "AdminDashboardExport",
      targetId: "export",
      scope: { countries: dashboard.scope.countries, products: dashboard.scope.products },
      result: "success",
      context: { rowCount: lines.length - 1, containsProspectIdentity: false }
    });
    return lines.join("\n");
  }

  // Lot 6 (spec 073 T302): extra KPIs of the PRD section 21, same window and scope as the rest.
  private flagOn(key: string): boolean {
    const flags = this.deps.featureFlags as { isEnabled?: (flagKey: string) => boolean };
    return typeof flags.isEnabled === "function" ? flags.isEnabled(key) : false;
  }

  private async buildExtraKpis(
    actor: ActorContext,
    scope: ResolvedAdminScope,
    window: ResolvedDashboardWindow,
    context: { received: number; assignmentsInWindow: LeadAssignmentRecord[]; allAssignments: LeadAssignmentRecord[]; countryMap: Map<string, string> }
  ): Promise<Partial<AdminDashboardResponse>> {
    const extra: Partial<AdminDashboardResponse> = {};

    // Visits and conversion: the counter is global (no country or product), so the rate is only
    // indicative under a country/product filter. Absent, disabled or empty counter = "Non mesure".
    let visits: AdminDashboardResponse["visits"] = null;
    const visitStats = this.deps.visitStats;
    if (visitStats && (visitStats.isEnabled?.() ?? true)) {
      try {
        const totals = await visitStats.totalsBetween(window.from, window.to);
        if (totals.total > 0) visits = { total: totals.total, byPage: totals.byPage.map((entry) => ({ page: entry.page, total: entry.total })) };
      } catch {
        visits = null;
      }
    }
    extra.visits = visits;
    // The visit counter is global: under a country / product / partner filter the ratio would mix filtered
    // requests with unfiltered visits, so it is reported as not measured.
    const filtered = scope.countries.length > 0 || scope.products.length > 0 || Boolean(scope.partnerId);
    extra.visitToRequestRate = visits && !filtered ? visitToRequestRate(context.received, visits.total) : null;

    // Active countries and products: same publication rules as the public counters.
    const [countries, products] = await Promise.all([this.deps.countries.listAdmin(), this.deps.products.listAdmin()]);
    extra.activeCountries = countActiveCountries(countries, { public_comparator_enabled: this.flagOn("public_comparator_enabled") }, scope);
    extra.activeProducts = countActiveProducts(products as never, scope);

    extra.partnerSla = summarisePartnerSla(context.assignmentsInWindow);

    if (this.deps.leadDisputes) {
      const disputes = await this.deps.leadDisputes.listDisputes({ from: window.from, to: window.to });
      extra.leadQuality = summariseLeadQuality(context.assignmentsInWindow, disputes, context.allAssignments, window, (assignment) =>
        this.assignmentInScope(assignment as LeadAssignmentRecord, scope, context.countryMap)
      );
    }

    // Revenue: issued invoices of the window, super_admin only (hypothesis H7).
    if (scope.role !== "super_admin") {
      extra.revenueRestricted = true;
    } else {
      extra.revenueRestricted = false;
      extra.revenue = null;
      if (this.deps.invoices) {
        try {
          const invoices = await this.deps.invoices.list(actor, {});
          extra.revenue = summariseRevenue(invoices, window, scope);
          await this.deps.audit.writeAsync({
            actor,
            action: DashboardAuditActions.adminRevenueRead,
            targetType: "AdminDashboard",
            targetId: "revenue",
            scope: { role: scope.role, countries: scope.countries, partnerId: scope.partnerId },
            result: "success",
            context: { currencies: extra.revenue.byCurrency.length }
          });
        } catch (error) {
          // Fail-closed: revenue is withheld when its reading cannot be audited. The failure is logged (name only, no data).
          extra.revenue = null;
          logEvent("error", "admin_dashboard.revenue_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
        }
      }
    }

    // AI cards read stored insights only: no generation, no provider call, nothing when the flags are closed.
    const aiEnabled = AI_ADMIN_FLAG_KEYS.some((key) => this.flagOn(key));
    extra.aiEnabled = aiEnabled;
    extra.aiRestricted = !actorCanReadAiInsights(actor);
    extra.aiSummary = null;
    extra.aiAlerts = null;
    if (aiEnabled && !extra.aiRestricted && this.deps.aiInsights) {
      try {
        // Same readers as GET /admin/ai/insights (ai:* / ai:read / compliance_admin); no admin_pays or support_admin.
        const insights = await this.deps.aiInsights.list();
        extra.aiSummary = summariseAiSummary(insights);
        extra.aiAlerts = summariseAiAlerts(insights);
      } catch {
        extra.aiSummary = null;
        extra.aiAlerts = null;
      }
    }
    return extra;
  }

  private extraCsvLines(dashboard: AdminDashboardResponse): string[] {
    const lines: string[] = [];
    if (dashboard.visits) {
      lines.push(`visites,total,${dashboard.visits.total}`);
      for (const entry of dashboard.visits.byPage) lines.push(`visites,${entry.page},${entry.total}`);
    } else {
      lines.push("visites,total,non_mesure");
    }
    lines.push(`conversion,visite_vers_demande,${dashboard.visitToRequestRate ?? "non_mesure"}`);
    if (dashboard.activeCountries !== undefined) lines.push(`actifs,pays,${dashboard.activeCountries}`);
    if (dashboard.activeProducts !== undefined) lines.push(`actifs,produits,${dashboard.activeProducts}`);
    if (dashboard.partnerSla) {
      lines.push(`sla_courtier,minutes_moyennes_premiere_action,${dashboard.partnerSla.averageFirstActionMinutes ?? "non_mesure"}`);
      lines.push(`sla_courtier,leads_mesures,${dashboard.partnerSla.measured}`);
    }
    if (dashboard.leadQuality) {
      for (const [key, value] of Object.entries(dashboard.leadQuality)) lines.push(`qualite_leads,${key},${value ?? "non_mesure"}`);
    }
    // Revenue only for the roles allowed to see it (super_admin).
    if (dashboard.revenue) {
      for (const entry of dashboard.revenue.byCurrency) {
        lines.push(`ca,abonnement_${entry.currency},${entry.subscription}`);
        lines.push(`ca,leads_${entry.currency},${entry.leads}`);
      }
    }
    if (dashboard.aiAlerts) lines.push(`ia,alertes_en_attente_validation,${dashboard.aiAlerts.pendingValidation}`);
    if (dashboard.aiSummary) lines.push(`ia,synthese_statut_validation,${dashboard.aiSummary.status}`);
    return lines;
  }
  // Lot 6 (end)

  private async actorWithScopeCodes(actor: ActorContext): Promise<ActorContext> {
    if (!actor.countryScopes?.length && !actor.productScopes?.length) return actor;
    const [countries, products] = await Promise.all([
      this.deps.countries.listAdmin(),
      this.deps.products.listAdmin()
    ]);
    return {
      ...actor,
      countryScopes: resolveScopeCodes(actor.countryScopes, countryCatalog(countries)),
      productScopes: resolveScopeCodes(actor.productScopes, productCatalog(products))
    };
  }

  private async buildCountryIsoMap(): Promise<Map<string, string>> {
    const countries = await this.deps.countries.listAdmin();
    const map = new Map<string, string>();
    for (const country of countries) map.set(country.id, country.isoCode);
    return map;
  }

  private assignmentInScope(assignment: LeadAssignmentRecord, scope: ResolvedAdminScope, _countryMap: Map<string, string>): boolean {
    if (scope.partnerId && assignment.partnerTenantId !== scope.partnerId) return false;
    if (scope.countries.length > 0 && assignment.countryCode && !scope.countries.includes(assignment.countryCode.toUpperCase())) return false;
    if (scope.products.length > 0 && assignment.productKey && !scope.products.includes(assignment.productKey)) return false;
    return true;
  }

  private quoteInScope(quote: unknown, scope: ResolvedAdminScope, allowedCountryIds: Set<string> | null): boolean {
    const record = quote as { countryId?: string; countryCode?: string; productId?: string; productKey?: string };
    if (allowedCountryIds && record.countryId && !allowedCountryIds.has(record.countryId)) return false;
    if (scope.products.length > 0 && record.productKey && !scope.products.includes(record.productKey)) return false;
    return true;
  }

  private async assertAdminPartnerFilterInScope(
    actor: ActorContext,
    scope: ResolvedAdminScope,
    isoToId: Map<string, string>,
    partners: Array<{ id: string }>
  ): Promise<void> {
    if (!scope.partnerId) return;
    if (!partners.some((partner) => partner.id === scope.partnerId)) {
      this.deps.access.refuseAdmin(actor, "out_of_scope_partner");
    }
    if (scope.role !== "admin_pays") return;
    const allowedCountryIds = new Set(
      scope.countries.map((countryCode) => isoToId.get(countryCode)).filter((id): id is string => Boolean(id))
    );
    if (allowedCountryIds.size === 0) this.deps.access.refuseAdmin(actor, "out_of_scope_partner");
    const licenses = await this.deps.partnerLicenses.listForPartner(scope.partnerId);
    if (!licenses.some((license) => allowedCountryIds.has(license.countryId))) {
      this.deps.access.refuseAdmin(actor, "out_of_scope_partner");
    }
  }

  private computeNonRoutedReasons(decisions: RoutingDecisionRecord[]): RoutingRefusalReasonCount[] {
    const map = new Map<string, number>();
    for (const decision of decisions) {
      if (decision.result === "assigned") continue;
      const reasons = decision.reasons.length > 0 ? decision.reasons : [decision.result === "no_broker_available" ? "no_broker_available" : "blocked"];
      for (const reason of reasons) {
        map.set(reason, (map.get(reason) ?? 0) + 1);
      }
    }
    return [...map.entries()].map(([reason, total]) => ({ reason, total }));
  }

  private groupCountByCountry(quotes: unknown[], countryMap: Map<string, string>, scope: ResolvedAdminScope) {
    const map = new Map<string, number>();
    for (const quote of quotes) {
      const record = quote as { countryId?: string; countryCode?: string };
      const isoCode = record.countryCode ?? (record.countryId ? countryMap.get(record.countryId) : undefined) ?? "ZZ";
      if (scope.countries.length > 0 && !scope.countries.includes(isoCode)) continue;
      map.set(isoCode, (map.get(isoCode) ?? 0) + 1);
    }
    return [...map.entries()].map(([countryCode, total]) => ({ countryCode, total }));
  }

  private groupCountByProduct(quotes: unknown[], scope: ResolvedAdminScope) {
    const map = new Map<string, number>();
    for (const quote of quotes) {
      const record = quote as { productKey?: string };
      const productKey = record.productKey ?? "unknown";
      if (scope.products.length > 0 && !scope.products.includes(productKey)) continue;
      map.set(productKey, (map.get(productKey) ?? 0) + 1);
    }
    return [...map.entries()].map(([productKey, total]) => ({ productKey, total }));
  }

  private countExpiredOffers(offers: unknown[], window: ResolvedDashboardWindow): number {
    let count = 0;
    for (const offer of offers) {
      const record = offer as { status?: string; validUntil?: Date | string };
      if (record.status === "expired") {
        count += 1;
        continue;
      }
      if (!record.validUntil) continue;
      const ts = record.validUntil instanceof Date ? record.validUntil.getTime() : new Date(record.validUntil).getTime();
      if (Number.isFinite(ts) && ts < window.to.getTime() && record.status === "active") count += 1;
    }
    return count;
  }

  private async collectLicenseAlertCounts(partners: Array<{ id: string; status: string }>, scope: ResolvedAdminScope, isoToId: Map<string, string>) {
    const allowedCountryIds = scope.countries.length > 0
      ? new Set<string>(scope.countries.map((iso) => isoToId.get(iso)).filter((id): id is string => Boolean(id)))
      : null;
    let expired = 0;
    let expiringSoon = 0;
    const now = Date.now();
    for (const partner of partners) {
      if (scope.partnerId && partner.id !== scope.partnerId) continue;
      if (partner.status !== "active") continue;
      const licenses = await this.deps.partnerLicenses.listForPartner(partner.id);
      for (const license of licenses) {
        if (allowedCountryIds && !allowedCountryIds.has(license.countryId)) continue;
        const expirationTime = typeof license.expirationDate === "string"
          ? new Date(`${license.expirationDate}T00:00:00.000Z`).getTime()
          : (license.expirationDate as Date).getTime();
        if (Number.isNaN(expirationTime)) continue;
        if (expirationTime < now) expired += 1;
        else if (expirationTime - now <= 30 * DAY_MS) expiringSoon += 1;
      }
    }
    return { expired, expiringSoon };
  }

  private aggregateComplianceCounts(auditEntries: AuditEntry[]) {
    const counts = { consentMissing: 0, crmFlagClosed: 0, rbacDenied: 0, crossTenantAttempt: 0, brokerSatisfactionConcern: 0, routingAnomaly: 0, other: 0 };
    for (const entry of auditEntries) {
      if (entry.result !== "refused") continue;
      const category = categorizeAuditEntry(entry);
      if (category === "consent_missing") counts.consentMissing += 1;
      else if (category === "crm_flag_closed") counts.crmFlagClosed += 1;
      else if (category === "rbac_denied") counts.rbacDenied += 1;
      else if (category === "cross_tenant_attempt") counts.crossTenantAttempt += 1;
      else if (category === "broker_satisfaction_concern") counts.brokerSatisfactionConcern += 1;
      else if (category === "routing_anomaly") counts.routingAnomaly += 1;
      else counts.other += 1;
    }
    return counts;
  }

  private summariseSensitiveFlags(flags: Array<{ key: string; scopeType: string; scopeId?: string; value: boolean }>): FeatureFlagSummary[] {
    const sensitive = new Set<string>(SensitiveFeatureFlagKeys);
    const summary: FeatureFlagSummary[] = [];
    const seen = new Set<string>();
    for (const flag of flags) {
      if (!sensitive.has(flag.key)) continue;
      const k = `${flag.key}|${flag.scopeType}|${flag.scopeId ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      summary.push({
        key: flag.key,
        scopeType: flag.scopeType,
        scopeId: flag.scopeId ?? null,
        value: flag.value
      });
    }
    for (const key of SensitiveFeatureFlagKeys) {
      if (![...summary].some((entry) => entry.key === key && entry.scopeType === "global")) {
        summary.push({ key, scopeType: "global", scopeId: null, value: false });
      }
    }
    return summary;
  }
}

export function _adminDashboardAuditAction(): string {
  return DashboardAuditActions.adminDashboardRead;
}
