import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readTableParams } from "../../../../packages/ui/backoffice/data-table";
import type { BrokerDashboardData } from "../../app/lib/broker-api";
import { aiInsightsOpen, aiInsightsPrefetchAllowed, aiInsightsVisible, canReadAiInsights, canWriteAiInsights, managerAssistantOpen } from "../../app/lib/ai-insights-access";
import { AGENCIES_OVERVIEW_MESSAGES, agenciesOverviewAccess } from "../../app/lib/agencies-overview";
import {
  CRM_LIST_PAGE_SIZE,
  buildCrmLeadsApiQuery,
  countCrmFilters,
  CRM_URGENCY_LABELS,
  PRIORITY_LEVEL_LABELS,
  hasPriorityScores,
  parseCrmListParams,
  showPriorityColumn,
  withCrmDateRange
} from "../../app/lib/crm-list-query";
import {
  CONVERSION_LABEL,
  LEAD_COST_LABEL,
  agencyRowLabel,
  crmPerformanceKpis,
  crmTopSources,
  formatMinutes,
  formatRate,
  leadSummary,
  wonOverReceived
} from "../../app/lib/ui/broker-view-models";

const read = (path: string) => readFileSync(path, "utf8");

const baseDashboard = (overrides: Partial<BrokerDashboardData> = {}): BrokerDashboardData => ({
  plan: "pro",
  window: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" },
  starter: { received: 10, accepted: 6, rejected: 1, disputed: 0, pendingAction: 3, averageFirstActionMinutes: 12, byProduct: [], byCountry: [] },
  licenseAlerts: [],
  crm: {
    pipeline: [],
    byAssignedAdvisor: [],
    conversionByProduct: [{ productKey: "auto", received: 10, accepted: 6, won: 3, rate: 0.3 }],
    conversionRate: 0.3,
    averageReceptionToFirstActivityMinutes: null,
    upcomingTasks: 0,
    upcomingReminders: 0,
    kpis: {
      contactRate: 0.8,
      averageFirstContactMinutes: 45,
      qualificationRate: 0.5,
      quotesSent: { leads: 4, proposals: 6 },
      topSources: [{ source: "comparator", received: 6, won: 3, conversionRate: 0.5 }],
      leadCost: { currency: "XOF", estimatedTotal: 5000, perLead: 500, perWonLead: null, basis: "billing_tariff_estimate" }
    }
  },
  ...overrides
});

test("KPI cards show the PRD 20 indicators with the won / received conversion label", () => {
  const cards = crmPerformanceKpis(baseDashboard());
  const byLabel = new Map(cards.map((card) => [card.label, card]));

  expect(CONVERSION_LABEL).toBe("Gagnés / reçus");
  expect(byLabel.get(CONVERSION_LABEL)?.value).toBe("30 %");
  expect(byLabel.get("Taux de contact")?.value).toBe("80 %");
  expect(byLabel.get("Délai moyen de premier contact")?.value).toBe("45 min");
  expect(byLabel.get("Taux de qualification")?.value).toBe("50 %");
  expect(byLabel.get("Devis / propositions envoyés")?.value).toBe("4 lead(s)");
  expect(byLabel.get("Devis / propositions envoyés")?.helper).toContain("6 proposition(s)");
  // The cost is an estimate, never an invoice, and nobody is labelled "acceptés" in the conversion.
  expect(byLabel.get(LEAD_COST_LABEL)?.label).toContain("estimation");
  expect(byLabel.get(LEAD_COST_LABEL)?.helper).toContain("Aucun lead gagné");
  expect(JSON.stringify(cards).toLowerCase()).not.toContain("accept");
  expect(crmTopSources(baseDashboard())).toHaveLength(1);
  expect(wonOverReceived({ won: 3, received: 10 })).toBe("3/10");
});

test("missing KPI values render a dash rather than 0", () => {
  expect(formatRate(null)).toBe("-");
  expect(formatRate(undefined)).toBe("-");
  expect(formatRate(0)).toBe("0 %");
  expect(formatMinutes(null)).toBe("-");
  expect(wonOverReceived({ received: 10 })).toBe("-");

  const sparse = baseDashboard();
  sparse.crm = { ...sparse.crm!, conversionRate: null, kpis: { contactRate: null, averageFirstContactMinutes: null } };
  const cards = crmPerformanceKpis(sparse);
  const values = new Map(cards.map((card) => [card.label, card.value]));
  expect(values.get(CONVERSION_LABEL)).toBe("-");
  expect(values.get("Taux de contact")).toBe("-");
  expect(values.get("Délai moyen de premier contact")).toBe("-");
  expect(values.get("Taux de qualification")).toBe("-");
  expect(values.get("Devis / propositions envoyés")).toBe("-");
  expect(values.has(LEAD_COST_LABEL)).toBe(false);
});

test("the Starter plan, or a missing crm section, shows no KPI at all", () => {
  expect(crmPerformanceKpis(baseDashboard({ plan: "starter" }))).toEqual([]);
  expect(crmTopSources(baseDashboard({ plan: "starter" }))).toEqual([]);
  const withoutCrm = baseDashboard();
  delete withoutCrm.crm;
  expect(crmPerformanceKpis(withoutCrm)).toEqual([]);

  const section = read("apps/broker/app/lib/ui/crm-kpi-section.tsx");
  expect(section).toContain("if (cards.length === 0) return null;");
  expect(read("apps/broker/app/page.tsx")).toContain("<CrmKpiSection data={dashboard.data} />");
  expect(read("apps/broker/app/crm/page.tsx")).toContain("<CrmKpiSection data={dashboard.data} />");
  // The conversion table of the pipeline page no longer says "acceptés / reçus".
  expect(read("apps/broker/app/crm/page.tsx")).not.toContain("Acceptes / recus");
  expect(read("apps/broker/app/crm/page.tsx")).toContain("CONVERSION_LABEL");
});

test("the multi-agency view is Enterprise only and refused to roles that do not see the whole cabinet", () => {
  const access = (roles: string[], partnerPlan: "pro" | "enterprise" | "starter", customRolePermissions?: string[]) =>
    agenciesOverviewAccess({ roles, partnerPlan, partnerTenantId: "t", mfaVerified: true, ...(customRolePermissions ? { customRolePermissions } : {}) });
  expect(access(["broker_owner_pro"], "enterprise")).toBe("allowed");
  expect(access(["broker_manager"], "enterprise")).toBe("allowed");
  // Same rule as the API: broker_crm:read is enough, so the read-only role with CRM read is allowed; the advisor is not.
  expect(access(["broker_read_only"], "enterprise")).toBe("allowed");
  expect(access(["broker_agent"], "enterprise")).toBe("role_not_allowed");
  // A custom role narrowing the CRM resource away from broker_crm:read removes the access.
  expect(access(["broker_manager"], "enterprise", ["broker_leads:read"])).toBe("role_not_allowed");
  expect(access(["broker_owner_pro"], "pro")).toBe("plan_required");
  expect(access(["broker_read_only"], "pro")).toBe("plan_required");
  expect(access(["broker_owner_starter"], "starter")).toBe("plan_required");
  expect(AGENCIES_OVERVIEW_MESSAGES.plan_required).toContain("Enterprise");
  expect(agencyRowLabel({ agencyId: "none", agencyName: "none" })).toBe("Sans agence");
  expect(agencyRowLabel({ agencyId: "0d6f0c2c-6d6e-4c33-9a43-0e0f4c2a8b11", agencyName: "Agence Abidjan" })).toBe("Agence Abidjan");

  const page = read("apps/broker/app/enterprise/agencies/page.tsx");
  const shell = read("apps/broker/app/lib/ui/broker-shell.tsx");
  const api = read("apps/broker/app/lib/broker-api.ts");
  expect(api).toContain("/broker/dashboard/agencies");
  expect(page).toContain("agenciesOverviewAccess(session.profile)");
  // The API is only called once the access check passed, and a 403 shows a generic message with no data.
  expect(page.indexOf('access !== "allowed"')).toBeGreaterThan(-1);
  expect(page.indexOf("await readBrokerAgenciesOverview()")).toBeGreaterThan(page.indexOf('access !== "allowed"'));
  expect(page).toContain('overview.status === "forbidden"');
  expect(page).toContain("Aucune donnée n&apos;est affichée");
  expect(page).toContain("Gagnés / reçus");
  // The navigation link follows the page rule (plan AND role), computed by the layout, never from the plan alone.
  const layout = read("apps/broker/app/layout.tsx");
  expect(layout).toContain('agenciesOverviewAccess(session.profile) === "allowed"');
  expect(layout).toContain("showAgenciesOverview={showAgenciesOverview}");
  expect(shell).toContain("...(showAgenciesOverview ? [{ label: AGENCIES_OVERVIEW_LABEL");
  expect(shell).not.toContain('plan === "enterprise" ? [{ label: AGENCIES_OVERVIEW_LABEL');
  expect(shell).toContain('"/enterprise/agencies"');
});

test("AI insights panel is hidden unless the assistance, the ai_summary_enabled flag and the opt-out allow it", () => {
  const flags = (value: boolean) => [{ key: "ai_summary_enabled", value, required: true }];
  expect(aiInsightsOpen({ enabled: true, flags: flags(true) }, false)).toBe(true);
  expect(aiInsightsOpen({ enabled: true, flags: flags(false) }, false)).toBe(false);
  expect(aiInsightsOpen({ enabled: false, flags: flags(true) }, false)).toBe(false);
  expect(aiInsightsOpen({ enabled: true, flags: [] }, false)).toBe(false);
  expect(aiInsightsOpen({ enabled: true, flags: flags(true) }, true)).toBe(false);
  expect(aiInsightsOpen(undefined, false)).toBe(false);

  const profile = (roles: string[], partnerPlan: "pro" | "enterprise" | "starter" = "enterprise") => ({ roles, partnerPlan, partnerTenantId: "t", mfaVerified: true });
  expect(canWriteAiInsights(profile(["broker_owner_pro"]))).toBe(true);
  expect(canWriteAiInsights(profile(["broker_manager"]))).toBe(true);
  expect(canReadAiInsights(profile(["broker_read_only"]))).toBe(true);
  expect(canWriteAiInsights(profile(["broker_read_only"]))).toBe(false);
  expect(canReadAiInsights(profile(["broker_agent"]))).toBe(false);

  // Closed flag, opt-out, Starter plan, agent role, missing status: the panel renders nothing.
  const open = { enabled: true, flags: flags(true) };
  expect(aiInsightsVisible(profile(["broker_owner_pro"]), open, false)).toBe(true);
  expect(aiInsightsVisible(profile(["broker_owner_pro"]), { enabled: true, flags: flags(false) }, false)).toBe(false);
  expect(aiInsightsVisible(profile(["broker_owner_pro"]), open, true)).toBe(false);
  expect(aiInsightsVisible(profile(["broker_owner_starter"], "starter"), open, false)).toBe(false);
  expect(aiInsightsVisible(profile(["broker_agent"]), open, false)).toBe(false);
  expect(aiInsightsVisible(profile(["broker_owner_pro"]), undefined, false)).toBe(false);
  // The dashboard makes no API call at all for Starter or a role without CRM read right.
  expect(aiInsightsPrefetchAllowed(profile(["broker_owner_starter"], "starter"))).toBe(false);
  expect(aiInsightsPrefetchAllowed(profile(["broker_agent"]))).toBe(false);
  expect(aiInsightsPrefetchAllowed(profile(["broker_manager"]))).toBe(true);

  // The panel is rendered by the dashboard (KPI page) and by the pipeline page, from the same component.
  expect(read("apps/broker/app/page.tsx")).toContain("<AiInsightsDashboardSection profile={session.profile}");
  const section = read("apps/broker/app/lib/ui/ai-insights-panel.tsx");
  expect(section.slice(section.indexOf("export async function AiInsightsDashboardSection"))).toContain("if (!aiInsightsPrefetchAllowed(profile)) return null;");

  const panel = read("apps/broker/app/lib/ui/ai-insights-panel.tsx");
  expect(panel).toContain("if (!aiInsightsVisible(profile, assistance, optedOut)) return null;");
  // The closed check precedes every API read.
  expect(panel.indexOf("aiInsightsVisible(profile")).toBeLessThan(panel.indexOf("readBrokerPerformanceSummaries()"));
});

test("the manager assistant card also needs the ai_broker_assistant_enabled flag", () => {
  const flags = (summary: boolean, manager: boolean) => [
    { key: "ai_summary_enabled", value: summary, required: true },
    { key: "ai_broker_assistant_enabled", value: manager, required: true }
  ];
  const enterprise = { partnerPlan: "enterprise" as const };
  // Manager flag closed, summary flag open: the summary card is visible, the manager card is not.
  const summaryOnly = { enabled: true, flags: flags(true, false) };
  expect(aiInsightsOpen(summaryOnly, false)).toBe(true);
  expect(managerAssistantOpen(enterprise, summaryOnly)).toBe(false);
  // Both open on Enterprise: both cards. Pro never gets the manager card.
  const both = { enabled: true, flags: flags(true, true) };
  expect(managerAssistantOpen(enterprise, both)).toBe(true);
  expect(managerAssistantOpen({ partnerPlan: "pro" }, both)).toBe(false);
  expect(managerAssistantOpen(enterprise, { flags: [] })).toBe(false);
  expect(managerAssistantOpen(enterprise, undefined)).toBe(false);
  // Manager flag open but summary flag closed: the panel is hidden altogether.
  expect(aiInsightsOpen({ enabled: true, flags: flags(false, true) }, false)).toBe(false);
});

test("AI insights are labelled as suggestions to validate, with validation actions behind the write right", () => {
  const panel = read("apps/broker/app/lib/ui/ai-insights-panel.tsx");
  const actions = read("apps/broker/app/lib/crm-ai-actions.ts");
  const api = read("apps/broker/app/lib/broker-api.ts");

  expect(panel).toContain('AI_INSIGHT_LABEL = "Assistance IA - suggestion à valider"');
  expect(panel).toContain("Générer le résumé IA");
  expect(panel).toContain("Assistant manager");
  expect(panel).toContain("Valider la suggestion");
  expect(panel).toContain("Rejeter la suggestion");
  expect(panel).toContain("Validation humaine");
  // Enterprise-only assistant, buttons only with the write right, advisors never shown as raw ids.
  expect(panel).toContain("managerAssistantOpen(profile, assistance)");
  expect(panel).toContain("canWrite && interaction.status ===");
  expect(panel).toContain("Conseiller hors équipe");
  expect(panel).not.toContain("{advisorId}");
  expect(api).toContain("/broker/crm/ai/performance-summaries");
  expect(api).toContain("/broker/crm/ai/manager-analyses");
  expect(actions).toContain("/broker/crm/ai/performance-summary");
  expect(actions).toContain("/broker/crm/ai/manager-assistant");
  expect(actions).toContain('language: "fr"');
  expect(actions).toContain("windowDays");
  expect(actions).toContain("/broker/crm/ai/interactions/${interactionId}/validation");
  expect(actions).toContain('INSIGHT_PAGES = new Set(["/", "/crm"])');
  expect(read("apps/broker/app/crm/page.tsx")).toContain("<AiInsightsPanel");
});

test("the CRM list forwards filters, sort and pagination to the API as URL parameters", () => {
  const state = parseCrmListParams({
    status: "contacte",
    product: "auto",
    country: "ci",
    advisor: "member-1",
    urgency: "high",
    source: "comparator",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-15",
    q: "  REF-12 ",
    sort: "priority",
    dir: "desc",
    page: "3"
  });
  const query = new URLSearchParams(buildCrmLeadsApiQuery(state, "none"));

  expect(Object.fromEntries(query)).toEqual({
    status: "contacte",
    productKey: "auto",
    countryCode: "CI",
    advisorId: "member-1",
    urgency: "high",
    source: "comparator",
    search: "REF-12",
    dateFrom: "2026-10-01T00:00:00.000Z",
    dateTo: "2026-10-15T23:59:59.999Z",
    agencyId: "none",
    sort: "priority",
    sortDirection: "desc",
    page: "3",
    pageSize: String(CRM_LIST_PAGE_SIZE)
  });
  expect(countCrmFilters(state)).toBe(9);
});

test("the CRM list defaults to the newest first, maps the sortable columns and drops invalid values", () => {
  const defaults = new URLSearchParams(buildCrmLeadsApiQuery(parseCrmListParams({})));
  expect(Object.fromEntries(defaults)).toEqual({ sort: "assignedAt", sortDirection: "desc", page: "1", pageSize: "25" });

  for (const [uiKey, apiKey] of [["date", "assignedAt"], ["status", "status"], ["urgency", "urgency"], ["priority", "priority"]] as const) {
    const asc = new URLSearchParams(buildCrmLeadsApiQuery(parseCrmListParams({ sort: uiKey })));
    expect(asc.get("sort")).toBe(apiKey);
    expect(asc.get("sortDirection")).toBe("asc");
    const desc = new URLSearchParams(buildCrmLeadsApiQuery(parseCrmListParams({ sort: uiKey, dir: "desc" })));
    expect(desc.get("sortDirection")).toBe("desc");
  }

  const invalid = parseCrmListParams({ status: "bogus", urgency: "extreme", source: "tv", country: "France", product: "a b", sort: "reference", page: "-4", dateFrom: "yesterday", advisor: "../x" });
  expect(Object.fromEntries(new URLSearchParams(buildCrmLeadsApiQuery(invalid)))).toEqual({ sort: "assignedAt", sortDirection: "desc", page: "1", pageSize: "25" });

  // An inverted date range is swapped instead of being refused by the API.
  const swapped = parseCrmListParams({ dateFrom: "2026-10-20", dateTo: "2026-10-01" });
  expect([swapped.dateFrom, swapped.dateTo]).toEqual(["2026-10-01", "2026-10-20"]);
  expect(withCrmDateRange("/crm/leads/export?status=contacte", swapped)).toBe("/crm/leads/export?status=contacte&dateFrom=2026-10-01&dateTo=2026-10-20");
  expect(withCrmDateRange("/crm/leads/export", { dateFrom: "", dateTo: "" })).toBe("/crm/leads/export");
});

test("the CRM list page uses the server query, no client filtering, server pagination and aria-sort headers", () => {
  const page = read("apps/broker/app/crm/leads/page.tsx");
  const api = read("apps/broker/app/lib/broker-api.ts");
  const table = read("packages/ui/backoffice/data-table.tsx");

  expect(page).toContain("listCrmLeads(agencyQuery(agency), buildCrmLeadsApiQuery(state))");
  expect(page).not.toContain("leads.filter(");
  expect(page).not.toContain("paginateItems");
  expect(page).not.toContain("sortItems");
  expect(page).toContain("total,");
  expect(page).toContain('name="dateFrom"');
  expect(page).toContain('name="dateTo"');
  expect(page).toContain('name="advisor"');
  expect(page).toContain("teamAdvisorOptions(members)");
  expect(page).toContain("sortHref={table.sortHref}");
  expect(page).toContain("Conseiller hors équipe");
  expect(api).toContain("/broker/crm/leads?${listQuery}");
  // The shared table renders aria-sort on sortable headers.
  expect(table).toContain("aria-sort={ariaSort}");
  for (const key of ['key: "status"', 'key: "date"', 'key: "urgency"', 'key: "priority"']) expect(page).toContain(key);
});

test("the AI priority column appears when the priority sort is active or a lead of the page carries a score", () => {
  const scored = leadSummary({ id: "a", status: "nouveau", assignedAt: "2026-10-02T10:00:00.000Z", priorityScore: 82, priorityLevel: "high" });
  const plain = leadSummary({ id: "b", status: "nouveau", assignedAt: "2026-10-02T10:00:00.000Z" });
  const odd = leadSummary({ id: "c", status: "nouveau", priorityScore: "high", priorityLevel: "urgent" });

  expect(scored.priorityScore).toBe(82);
  expect(scored.priorityLevel).toBe("high");
  expect(plain.priorityScore).toBeUndefined();
  expect(odd.priorityScore).toBeUndefined();
  expect(odd.priorityLevel).toBeUndefined();
  expect(hasPriorityScores([plain, odd])).toBe(false);
  expect(hasPriorityScores([plain, scored])).toBe(true);
  // A score of 0 is a real score.
  expect(hasPriorityScores([leadSummary({ id: "z", status: "nouveau", priorityScore: 0, priorityLevel: "low" })])).toBe(true);

  // Priority sort without any scored lead on the page (or page 2): the column and its sort link stay.
  expect(showPriorityColumn({ sort: "priority" }, [plain])).toBe(true);
  expect(showPriorityColumn({ sort: "priority" }, [])).toBe(true);
  expect(showPriorityColumn({ sort: "date" }, [plain])).toBe(false);
  expect(showPriorityColumn({ sort: "date" }, [scored])).toBe(true);

  const page = read("apps/broker/app/crm/leads/page.tsx");
  expect(page).toContain("crmColumns(showPriorityColumn(state, leads))");
  expect(page).toContain("if (withPriority)");
  expect(page).toContain("Priorité IA");
  expect(page).toContain("assistance IA, indicatif");
});

test("each CRM filter is forwarded alone to the API with its own parameter", () => {
  const cases: Array<[Record<string, string>, Record<string, string>]> = [
    [{ status: "contacte" }, { status: "contacte" }],
    [{ product: "auto" }, { productKey: "auto" }],
    [{ country: "sn" }, { countryCode: "SN" }],
    [{ advisor: "member-9" }, { advisorId: "member-9" }],
    [{ urgency: "urgent" }, { urgency: "urgent" }],
    [{ source: "support" }, { source: "support" }],
    [{ q: "dupont" }, { search: "dupont" }],
    [{ dateFrom: "2026-10-05" }, { dateFrom: "2026-10-05T00:00:00.000Z" }],
    [{ dateTo: "2026-10-06" }, { dateTo: "2026-10-06T23:59:59.999Z" }]
  ];
  const base = { sort: "assignedAt", sortDirection: "desc", page: "1", pageSize: String(CRM_LIST_PAGE_SIZE) };
  for (const [input, expected] of cases) {
    const state = parseCrmListParams(input);
    expect(countCrmFilters(state)).toBe(1);
    expect(Object.fromEntries(new URLSearchParams(buildCrmLeadsApiQuery(state)))).toEqual({ ...expected, ...base });
  }
});

test("previous / next pagination links keep every filter and the sort", () => {
  const params = { status: "contacte", product: "auto", country: "CI", urgency: "high", q: "REF-12", sort: "priority", dir: "desc", page: "2" };
  const state = parseCrmListParams(params);
  expect(state.page).toBe(2);
  const table = readTableParams(params, { pathname: "/crm/leads", defaultSort: { key: "date", direction: "desc" }, pageSize: CRM_LIST_PAGE_SIZE });

  const next = new URL(table.pageHref(3), "http://broker.local");
  const previous = new URL(table.pageHref(1), "http://broker.local");
  expect(next.pathname).toBe("/crm/leads");
  expect(Object.fromEntries(next.searchParams)).toEqual({ ...params, page: "3" });
  // Back to the first page drops only the page parameter.
  const withoutPage: Record<string, string> = { ...params };
  delete withoutPage.page;
  expect(Object.fromEntries(previous.searchParams)).toEqual(withoutPage);
  // The API query of the next page carries the same filters with the new page number.
  const apiNext = new URLSearchParams(buildCrmLeadsApiQuery({ ...state, page: 3 }));
  expect(apiNext.get("status")).toBe("contacte");
  expect(apiNext.get("productKey")).toBe("auto");
  expect(apiNext.get("sort")).toBe("priority");
  expect(apiNext.get("page")).toBe("3");
  // A sort link restarts at page 1 and keeps the filters.
  const sortLink = new URL(table.sortHref("status", "asc"), "http://broker.local");
  expect(sortLink.searchParams.get("page")).toBeNull();
  expect(sortLink.searchParams.get("q")).toBe("REF-12");
});

test("visible CRM list labels are accented French", () => {
  expect(CRM_URGENCY_LABELS.high).toBe("Élevée");
  expect(PRIORITY_LEVEL_LABELS.high).toBe("Élevée");
  const page = read("apps/broker/app/crm/leads/page.tsx");
  expect(page).toContain("Aucun résultat pour ce filtre");
  expect(page).toContain("Code pays à 2 lettres");
  expect(page).toContain("Saisissez la clé exacte du produit");
});
