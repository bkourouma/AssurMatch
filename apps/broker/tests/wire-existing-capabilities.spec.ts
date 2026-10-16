import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PLATFORM_MENTION, brandAccentCss, cleanBrandLabel, contrastRatio, isUsableBrandColor, toBrokerBranding } from "../app/lib/branding";
import { AGENCY_DISPLAY_HINT, agencyQuery, resolveAgencyFilter } from "../app/lib/agency-filter";
import type { AgencyFilterAgency } from "../app/lib/agency-filter";
import {
  CRM_EXPORT_FILTERS,
  CRM_EXPORT_MAX_ROWS,
  STARTER_EXPORT_FILTERS,
  STARTER_EXPORT_MAX_ROWS,
  crmExportHref,
  sanitizeExportFilters,
  starterExportHref
} from "../app/lib/lead-export-links";

/**
 * Spec 064 (broker part): export buttons, loss analysis, custom role assignment and charte. Source
 * checks in the style of enterprise.spec.ts, plus pure-logic tests of the helpers.
 */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("lead export routes proxy the session token, forward a whitelist and return an audited CSV", () => {
  const starterRoute = source("apps/broker/app/leads/export/route.ts");
  const crmRoute = source("apps/broker/app/crm/leads/export/route.ts");
  const proxy = source("apps/broker/app/lib/lead-export-proxy.ts");

  expect(starterRoute).toContain("export async function GET");
  expect(starterRoute).toContain("/broker/starter/leads/export.csv");
  expect(starterRoute).toContain("leads-starter");
  expect(crmRoute).toContain("export async function GET");
  expect(crmRoute).toContain("/broker/crm/leads/export.csv");
  expect(crmRoute).toContain("leads-crm");

  expect(proxy).toContain("getBackOfficeToken()");
  expect(proxy).toContain("{ status: 401 }");
  expect(proxy).toContain("Authorization: `Bearer ${token}`");
  expect(proxy).toContain("sanitizeExportFilters");
  expect(proxy).toContain("text/csv; charset=utf-8");
  expect(proxy).toContain("content-disposition");
  expect(proxy).toContain("attachment; filename=");
  expect(proxy).toContain("no-store");
  expect(proxy).toContain("x-content-type-options");
  expect(proxy).toContain("nosniff");
  expect(starterRoute).toContain("STARTER_EXPORT_MAX_ROWS");
  expect(crmRoute).toContain("CRM_EXPORT_MAX_ROWS");
  expect(proxy).toContain("export_unavailable_${response.status}");
  // The upstream body is never echoed on a refusal.
  expect(proxy).not.toContain("response.json()");
});

test("export filters are a whitelist, validated and normalised before reaching the API", () => {
  expect([...STARTER_EXPORT_FILTERS].sort()).toEqual(["countryCode", "dateFrom", "dateTo", "maxRows", "productKey", "status"]);
  expect([...CRM_EXPORT_FILTERS].sort()).toEqual(["advisorId", "agencyId", "countryCode", "dateFrom", "dateTo", "maxRows", "productKey", "search", "source", "status", "urgency"]);

  const params = new URLSearchParams({ status: " accepted ", productKey: "auto", evil: "1", page: "9", advisorId: "adv-1", dateFrom: "2026-10-01", dateTo: "2026-10-02", maxRows: "250" });
  const starter = sanitizeExportFilters(params, STARTER_EXPORT_FILTERS, { maxRows: STARTER_EXPORT_MAX_ROWS });
  expect("query" in starter && Object.fromEntries(starter.query)).toEqual({
    status: "accepted",
    productKey: "auto",
    dateFrom: "2026-10-01T00:00:00.000Z",
    dateTo: "2026-10-02T23:59:59.999Z",
    maxRows: "250"
  });
  // advisorId is a CRM-only filter; anything outside the whitelist is dropped.
  const crm = sanitizeExportFilters(params, CRM_EXPORT_FILTERS);
  expect("query" in crm && crm.query.get("advisorId")).toBe("adv-1");
  expect("query" in crm && crm.query.has("evil")).toBe(false);
  expect("query" in crm && crm.query.has("page")).toBe(false);

  // Row caps follow the backend schemas: Starter 1000, CRM 2000.
  expect(STARTER_EXPORT_MAX_ROWS).toBe(1000);
  expect(CRM_EXPORT_MAX_ROWS).toBe(2000);
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "1001" }), STARTER_EXPORT_FILTERS, { maxRows: STARTER_EXPORT_MAX_ROWS })).toEqual({ invalid: "maxRows" });
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "1000" }), STARTER_EXPORT_FILTERS, { maxRows: STARTER_EXPORT_MAX_ROWS })).toHaveProperty("query");
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "2000" }), CRM_EXPORT_FILTERS, { maxRows: CRM_EXPORT_MAX_ROWS })).toHaveProperty("query");
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "2001" }), CRM_EXPORT_FILTERS, { maxRows: CRM_EXPORT_MAX_ROWS })).toEqual({ invalid: "maxRows" });

  // The CRM search and the agency display filter are forwarded; an agency is a uuid or "none".
  const searched = sanitizeExportFilters(new URLSearchParams({ search: " dupont ", agencyId: "none" }), CRM_EXPORT_FILTERS, { maxRows: CRM_EXPORT_MAX_ROWS });
  expect("query" in searched && Object.fromEntries(searched.query)).toEqual({ search: "dupont", agencyId: "none" });
  expect(sanitizeExportFilters(new URLSearchParams({ agencyId: "../x" }), CRM_EXPORT_FILTERS, { maxRows: CRM_EXPORT_MAX_ROWS })).toEqual({ invalid: "agencyId" });
  expect(sanitizeExportFilters(new URLSearchParams({ search: "s".repeat(121) }), CRM_EXPORT_FILTERS, { maxRows: CRM_EXPORT_MAX_ROWS })).toEqual({ invalid: "search" });
  // The Starter export has no search nor agency filter.
  const starterOnly = sanitizeExportFilters(new URLSearchParams({ search: "x", agencyId: "none" }), STARTER_EXPORT_FILTERS, { maxRows: STARTER_EXPORT_MAX_ROWS });
  expect("query" in starterOnly && starterOnly.query.toString()).toBe("");

  // Invalid values are refused rather than silently widening the export.
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "5000" }), CRM_EXPORT_FILTERS)).toEqual({ invalid: "maxRows" });
  expect(sanitizeExportFilters(new URLSearchParams({ maxRows: "abc" }), CRM_EXPORT_FILTERS)).toEqual({ invalid: "maxRows" });
  expect(sanitizeExportFilters(new URLSearchParams({ dateFrom: "yesterday" }), CRM_EXPORT_FILTERS)).toEqual({ invalid: "dateFrom" });
  expect(sanitizeExportFilters(new URLSearchParams({ status: "x".repeat(65) }), CRM_EXPORT_FILTERS)).toEqual({ invalid: "status" });
  expect(sanitizeExportFilters(new URLSearchParams({ status: "a\nb" }), CRM_EXPORT_FILTERS)).toEqual({ invalid: "status" });
  // Empty values are ignored.
  const empty = sanitizeExportFilters(new URLSearchParams({ status: "  ", source: "" }), CRM_EXPORT_FILTERS);
  expect("query" in empty && empty.query.toString()).toBe("");
});

test("export links carry only raw API filter values", () => {
  expect(starterExportHref({})).toBe("/leads/export");
  expect(starterExportHref({ status: "accepted", product: "auto", country: "CI", date: "2026-10-01" })).toBe(
    "/leads/export?status=accepted&productKey=auto&countryCode=CI&dateFrom=2026-10-01&dateTo=2026-10-01"
  );
  expect(crmExportHref({ status: "nouveau", advisor: "adv-1", urgency: "high", source: "comparator", date: "-" })).toBe(
    "/crm/leads/export?status=nouveau&advisorId=adv-1&urgency=high&source=comparator"
  );
  expect(crmExportHref({ search: "dupont", agencyId: "11111111-1111-4111-8111-111111111111" })).toBe(
    "/crm/leads/export?search=dupont&agencyId=11111111-1111-4111-8111-111111111111"
  );
  // The placeholder shown for a missing value is never forwarded.
  expect(crmExportHref({ status: "-", product: "-" })).toBe("/crm/leads/export");
});

test("list pages show the export button only to roles that hold the export permission", () => {
  const starter = source("apps/broker/app/leads/page.tsx");
  const crm = source("apps/broker/app/crm/leads/page.tsx");
  const permissions = source("apps/broker/app/lib/broker-permissions.ts");

  expect(starter).toContain("canExportStarterLeads(session.profile)");
  expect(starter).toContain("starterExportHref");
  expect(starter).toContain("Exporter (CSV)");
  expect(starter).toContain("Export non autorisé pour votre rôle");
  expect(crm).toContain("canExportCrmLeads(session.profile)");
  expect(crm).toContain("crmExportHref");
  expect(crm).toContain("search: query");
  expect(crm).toContain("agencyId: agency.apiAgencyId");
  expect(crm).toContain("Exporter (CSV)");
  expect(crm).toContain("Export non autorisé pour votre rôle");
  expect(permissions).toContain('"broker_leads:export"');
  expect(permissions).toContain('"broker_crm:export"');

  // The control is a link that exists only in the permitted branch: the other branch is a muted badge.
  for (const page of [starter, crm]) {
    const permitted = page.indexOf("canExport ? (");
    const button = page.indexOf("<Button href=");
    const refused = page.indexOf("Export non autorisé pour votre rôle");
    expect(permitted).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(permitted);
    expect(refused).toBeGreaterThan(button);
  }
});

test("the loss analysis page is Enterprise-only, shows a disabled state and keeps humans in control", () => {
  const page = source("apps/broker/app/crm/loss-analysis/page.tsx");
  const actions = source("apps/broker/app/lib/loss-analysis-actions.ts");
  const api = source("apps/broker/app/lib/broker-api.ts");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  const crm = source("apps/broker/app/crm/page.tsx");

  expect(page).toContain('profile.partnerPlan !== "enterprise"');
  expect(page).toContain("Analyse des pertes réservée au plan Enterprise");
  expect(page).toContain("Plan Enterprise requis");
  expect(page).toContain("CRM complet indisponible");
  expect(page).toContain("Assistance IA");
  expect(page).toContain("Lancer l&apos;analyse des pertes");
  expect(page).toContain("Assistance IA indisponible");
  expect(page).toContain("disabled={reason !== undefined || suspended}");
  expect(page).toContain("opt-out");
  expect(page).toContain("TenantWriteGuard");
  expect(page).toContain("canRequestLossAnalysis");
  expect(page).toContain("mode simplifié");
  expect(page).toContain("Valider l'analyse");
  expect(page).toContain("Écarter l'analyse");
  expect(page).toContain("90 derniers jours");
  expect(page).toContain("aucune donnée de contact");
  expect(page).toContain("aucune décision n'est prise automatiquement");
  expect(page).toContain("readBrokerAIAssistance()");
  expect(page).toContain("readLossAnalyses()");
  // The page never reaches into the lead detail folder.
  expect(page).not.toContain("[leadAssignmentId]");
  expect(page).not.toContain("lead-ai-panel");

  expect(actions).toContain('"use server"');
  expect(actions).toContain("export async function requestLossAnalysisAction");
  expect(actions).toContain("export async function validateLossAnalysisAction");
  expect(actions).toContain("/broker/crm/ai/loss-analysis");
  expect(actions).toContain("/broker/crm/ai/interactions/");
  expect(actions).toContain("/crm/loss-analysis");
  expect(actions).toContain("result.suspended");
  expect(api).toContain('"/broker/crm/ai/loss-analysis"');

  expect(shell).toContain("/crm/loss-analysis");
  expect(shell).toContain("Analyse des pertes");
  expect(crm).toContain("/crm/loss-analysis");
});

test("the team page assigns tenant custom roles to Enterprise cabinets only", () => {
  const page = source("apps/broker/app/team/page.tsx");
  const forms = source("apps/broker/app/team/team-forms.tsx");
  const actions = source("apps/broker/app/lib/enterprise-actions.ts");
  const enterprise = source("apps/broker/app/enterprise/page.tsx");
  const api = source("apps/broker/app/lib/broker-api.ts");

  expect(page).toContain('session.profile.partnerPlan === "enterprise"');
  expect(page).toContain("isEnterprise ? await readBrokerCustomRoles() : undefined");
  expect(page).toContain("Rôle personnalisé");
  expect(page).toContain("Aucun");
  expect(page).toContain("canManageTeam(session.profile)");
  expect(page).toContain("!member.isOwner");
  expect(page).toContain("CustomRoleForm");
  expect(forms).toContain("assignCustomRoleAction");
  expect(forms).toContain("Aucun rôle personnalisé");
  expect(forms).toContain("Attribuer");
  expect(actions).toContain("export async function assignCustomRoleAction");
  expect(actions).toContain("/custom-role");
  expect(actions).toContain('"PUT"');
  expect(actions).toContain("/team?role=");
  expect(api).toContain("memberIds");
  expect(enterprise).toContain("memberIds");
  expect(enterprise).toContain('header: "Membres"');
});

test("the Enterprise charte decorates the broker header only and keeps the platform mention", () => {
  const layout = source("apps/broker/app/layout.tsx");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  const publicApi = source("apps/public/app/lib/public-api.ts");
  const publicHome = source("apps/public/app/[locale]/page.tsx");

  expect(layout).toContain('plan === "enterprise"');
  expect(layout).toContain("readBrokerBranding");
  expect(layout).toContain("try {");
  expect(layout).toContain("branding={branding}");
  expect(shell).toContain("PLATFORM_MENTION");
  expect(shell).toContain("brandAccentCss");
  expect(PLATFORM_MENTION).toBe("Plateforme technique AssurMatch");
  expect(publicApi).not.toContain("branding");
  expect(publicHome).not.toContain("branding");
});

test("brand colours are applied only when valid and readable", () => {
  expect(isUsableBrandColor("#12377f")).toBe(true);
  expect(isUsableBrandColor("#1f2937")).toBe(true);
  // Not a strict #rrggbb.
  for (const invalid of ["#fff", "1f2937", "red", "#1f29370", "#gggggg", "", undefined, null, 12, "#1f2937; background:url(x)"]) {
    expect(isUsableBrandColor(invalid), String(invalid)).toBe(false);
  }
  // Too light for the white sidebar text.
  expect(isUsableBrandColor("#ffffff")).toBe(false);
  expect(isUsableBrandColor("#ffeb3b")).toBe(false);
  expect(isUsableBrandColor("#25d366")).toBe(false);
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);

  expect(brandAccentCss("#12377F")).toBe('.bo-shell[data-broker-brand="custom"] .bo-sidebar{--am-primary-700:#12377f}');
  expect(brandAccentCss("#ffeb3b")).toBe("");
  expect(brandAccentCss("red")).toBe("");
});

test("brand labels are cleaned and an unusable colour falls back to the default charte", () => {
  expect(cleanBrandLabel("  Cabinet\n Dupont  ")).toBe("Cabinet Dupont");
  expect(cleanBrandLabel("x".repeat(100))?.length).toBe(60);
  expect(cleanBrandLabel("   ")).toBeUndefined();
  expect(cleanBrandLabel(42)).toBeUndefined();

  expect(toBrokerBranding({ displayLabel: "Cabinet Dupont", primaryColor: "#12377F" })).toEqual({ label: "Cabinet Dupont", color: "#12377f" });
  expect(toBrokerBranding({ displayLabel: "Cabinet Dupont", primaryColor: "#ffeb3b" })).toEqual({ label: "Cabinet Dupont", color: "" });
  expect(toBrokerBranding({ displayLabel: "", primaryColor: "#12377f" })).toBeUndefined();
  expect(toBrokerBranding(undefined)).toBeUndefined();
});

test("the permission helpers apply the custom role restriction and the new capabilities", () => {
  const permissions = source("apps/broker/app/lib/broker-permissions.ts");
  const auth = source("apps/broker/app/lib/backoffice-auth.ts");

  expect(auth).toContain("customRolePermissions");
  expect(auth).toContain("customRole?:");
  expect(permissions).toContain("customRoleAllows");
  expect(permissions).toContain("CUSTOM_ROLE_RESOURCES");
  expect(permissions).toContain('"broker_leads", "broker_crm", "notifications"');
  expect(permissions).toContain("export function canExportStarterLeads");
  expect(permissions).toContain("export function canExportCrmLeads");
  expect(permissions).toContain("export function canRequestLossAnalysis");
  // The restriction lives in hasPermission, so every mutate/assign helper honours it.
  expect(permissions).toContain("export function hasPermission");
  expect(permissions).toContain("&& customRoleAllows(profile, permission)");
});

const AGENCY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENCY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const agencies: AgencyFilterAgency[] = [
  { id: AGENCY_B, name: "Bouaké", memberIds: ["user-b", "user-ab"] },
  { id: AGENCY_A, name: "Abidjan", memberIds: ["user-a", "user-ab"] }
];

test("agency filter: options, own-agency default, several agencies, explicit all and foreign values", () => {
  // Own agency by default when the user belongs to exactly one agency.
  const own = resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies });
  expect(own.enabled).toBe(true);
  expect(own.options.map((option) => option.label)).toEqual(["Toutes les agences", "Abidjan", "Bouaké", "Sans agence"]);
  expect(own.selected).toBe(AGENCY_A);
  expect(own.apiAgencyId).toBe(AGENCY_A);
  expect(agencyQuery(own)).toEqual({ agencyId: AGENCY_A });

  // Several agencies, or none: « Toutes les agences », nothing sent to the API.
  for (const actorId of ["user-ab", "user-none", undefined]) {
    const filter = resolveAgencyFilter({ plan: "enterprise", actorId, agencies });
    expect(filter.selected, String(actorId)).toBe("all");
    expect(filter.apiAgencyId).toBeUndefined();
    expect(agencyQuery(filter)).toEqual({});
  }

  // An explicit "all" persists (no re-default to the own agency); "none" and a known agency are kept.
  expect(resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies, param: "all" }).selected).toBe("all");
  expect(resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies, param: "all" }).apiAgencyId).toBeUndefined();
  const none = resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies, param: "none" });
  expect([none.selected, none.apiAgencyId]).toEqual(["none", "none"]);
  expect(resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies, param: [AGENCY_B] }).apiAgencyId).toBe(AGENCY_B);

  // Unknown or foreign values are never forwarded.
  for (const param of ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "../etc", "ALL", "x".repeat(300)]) {
    const filter = resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies, param });
    expect(filter.selected, param).toBe("all");
    expect(filter.apiAgencyId, param).toBeUndefined();
  }
});

test("agency filter: disabled for non-Enterprise plans and for cabinets without agencies", () => {
  for (const plan of ["starter", "pro", undefined]) {
    const filter = resolveAgencyFilter({ plan, actorId: "user-a", agencies, param: AGENCY_A });
    expect(filter).toEqual({ enabled: false, options: [], selected: "all", apiAgencyId: undefined });
  }
  expect(resolveAgencyFilter({ plan: "enterprise", actorId: "user-a", agencies: [] }).enabled).toBe(false);
});

test("the agency filter is a display filter on the CRM list, Kanban and dashboard, never on the loss analysis", () => {
  const list = source("apps/broker/app/crm/leads/page.tsx");
  const kanban = source("apps/broker/app/crm/kanban/page.tsx");
  const dashboard = source("apps/broker/app/crm/page.tsx");
  const lossAnalysis = source("apps/broker/app/crm/loss-analysis/page.tsx");
  const api = source("apps/broker/app/lib/broker-api.ts");
  const loader = source("apps/broker/app/lib/agency-filter-loader.ts");
  const form = source("apps/broker/app/lib/ui/agency-filter-form.tsx");
  const helper = source("apps/broker/app/lib/agency-filter.ts");

  expect(list).toContain("loadAgencyFilter(session.profile, params[AGENCY_PARAM])");
  expect(list).toContain("listCrmLeads(agencyQuery(agency))");
  expect(list).toContain('id="crm-agency"');
  expect(list).toContain("name={AGENCY_PARAM}");
  expect(list).toContain("AGENCY_DISPLAY_HINT");
  expect(kanban).toContain("AgencyFilterForm");
  expect(kanban).toContain("readCrmKanban(agencyQuery(agency))");
  expect(dashboard).toContain("AgencyFilterForm");
  expect(dashboard).toContain("readBrokerDashboardWithComparison(filterQuery)");
  expect(dashboard).toContain("readBrokerAdvisors(filterQuery)");
  expect(form).toContain("AGENCY_DISPLAY_HINT");
  expect(form).toContain("if (!filter.enabled) return null");
  expect(AGENCY_DISPLAY_HINT).toBe("Filtre d'affichage : il ne restreint pas vos droits d'accès.");

  // Only the Enterprise plan reads the agencies; the page param is agence, the API field agencyId.
  expect(loader).toContain('profile.partnerPlan !== "enterprise"');
  expect(helper).toContain('AGENCY_PARAM = "agence"');
  expect(api).toContain("agencyId=");
  expect(api).toContain("memberIds");

  // The loss analysis page is out of the agency scope.
  for (const forbidden of ["agency-filter", "AgencyFilter", "agencyQuery", "AGENCY_PARAM", "agencyId"]) {
    expect(lossAnalysis).not.toContain(forbidden);
  }
});

test("only an owner assigns a custom role to a manager, and the refusal is explained", () => {
  const page = source("apps/broker/app/team/page.tsx");
  const actions = source("apps/broker/app/lib/enterprise-actions.ts");
  const write = source("apps/broker/app/lib/broker-write.ts");

  expect(page).toContain('actorIsOwner || !member.roles.includes("broker_manager")');
  expect(page).toContain("Seul le propriétaire peut modifier le rôle personnalisé d'un manager.");
  expect(actions).toContain("owner_required_for_manager_target");
  expect(actions).toContain("/team?role=owner_required");
  expect(write).toContain("refusalReason");
});
