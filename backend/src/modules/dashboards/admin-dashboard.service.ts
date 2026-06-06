import type {
  AdminDashboardResponse,
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
import type { QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { DashboardsAccessPolicy, type ResolvedAdminScope } from "./dashboards-access-policy";
import { DashboardAuditActions } from "./dashboard-audit-actions";
import { isWithinWindow, resolveDashboardWindow, type ResolvedDashboardWindow } from "./dashboard-time-window";
import { categorizeAuditEntry } from "./compliance-alerts.service";

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
}

export class AdminDashboardService {
  constructor(private readonly deps: AdminDashboardServiceDeps) {}

  async dashboard(actor: ActorContext, query: DashboardScopeQuery): Promise<AdminDashboardResponse> {
    const role = this.deps.access.resolveAdminAccess(actor);
    const scopeInput: { country?: string | undefined; product?: string | undefined; partnerId?: string | undefined; agentId?: string | undefined } = {};
    if (query.country) scopeInput.country = query.country;
    if (query.product) scopeInput.product = query.product;
    if (query.partnerId) scopeInput.partnerId = query.partnerId;
    const scope = this.deps.access.resolveAdminScope(actor, role, scopeInput);
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
      sensitiveFeatureFlags
    };
    return response;
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
    const counts = { consentMissing: 0, crmFlagClosed: 0, rbacDenied: 0, crossTenantAttempt: 0, other: 0 };
    for (const entry of auditEntries) {
      if (entry.result !== "refused") continue;
      const category = categorizeAuditEntry(entry);
      if (category === "consent_missing") counts.consentMissing += 1;
      else if (category === "crm_flag_closed") counts.crmFlagClosed += 1;
      else if (category === "rbac_denied") counts.rbacDenied += 1;
      else if (category === "cross_tenant_attempt") counts.crossTenantAttempt += 1;
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
