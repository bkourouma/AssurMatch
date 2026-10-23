import { CRM_PIPELINE_STATUSES } from "./lead-vocabulary";

/**
 * Lot 3 (spec 069 FR-007): the CRM list sends its filters, sort and pagination to the API
 * (`GET /broker/crm/leads`) instead of filtering the first page in the browser. This pure module reads
 * the page URL (`searchParams`), keeps only values the contract accepts, and builds the API query.
 * The API stays the authority (tenant, role, plan, agency); an invalid value is dropped, never forwarded.
 */
export const CRM_LIST_PAGE_SIZE = 25;
const MAX_PAGE = 10_000;

export const CRM_URGENCIES = ["low", "normal", "high", "urgent"] as const;
export const CRM_SOURCES = ["comparator", "quote_request", "manual_import", "partner_referral", "support"] as const;

export const CRM_URGENCY_LABELS: Record<string, string> = {
  low: "Faible",
  normal: "Normale",
  high: "Élevée",
  urgent: "Urgente"
};

export const CRM_SOURCE_LABELS: Record<string, string> = {
  comparator: "Comparateur",
  quote_request: "Demande de devis",
  manual_import: "Import manuel",
  partner_referral: "Recommandation partenaire",
  support: "Support"
};

/** Column keys of the table (also the `sort` URL value) and the sort key the API expects. */
export const CRM_SORT_KEYS = { date: "assignedAt", status: "status", urgency: "urgency", priority: "priority" } as const;
export type CrmSortKey = keyof typeof CRM_SORT_KEYS;
export type CrmSortDirection = "asc" | "desc";

export interface CrmListState {
  status: string;
  product: string;
  country: string;
  advisor: string;
  urgency: string;
  source: string;
  search: string;
  /** Day filters as typed in the page (`YYYY-MM-DD`), empty when unset. */
  dateFrom: string;
  dateTo: string;
  sort: CrmSortKey;
  direction: CrmSortDirection;
  page: number;
}

type QueryParams = Record<string, string | string[] | undefined>;

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const COUNTRY = /^[A-Za-z]{2}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

function oneOf(value: string, allowed: readonly string[]): string {
  return allowed.includes(value) ? value : "";
}

function day(value: string): string {
  return DAY_ONLY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf()) ? value : "";
}

export function isCrmSortKey(value: string): value is CrmSortKey {
  return Object.prototype.hasOwnProperty.call(CRM_SORT_KEYS, value);
}

export function parseCrmListParams(params: QueryParams): CrmListState {
  const sortParam = first(params.sort);
  const hasSort = isCrmSortKey(sortParam);
  const rawPage = Number.parseInt(first(params.page) || "1", 10);
  const search = first(params.q);
  let dateFrom = day(first(params.dateFrom));
  let dateTo = day(first(params.dateTo));
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  const country = first(params.country);
  const product = first(params.product);
  const advisor = first(params.advisor);

  return {
    status: oneOf(first(params.status), CRM_PIPELINE_STATUSES),
    product: KEY.test(product) ? product : "",
    country: COUNTRY.test(country) ? country.toUpperCase() : "",
    advisor: KEY.test(advisor) ? advisor : "",
    urgency: oneOf(first(params.urgency), CRM_URGENCIES),
    source: oneOf(first(params.source), CRM_SOURCES),
    search: search.length <= 120 && !CONTROL_CHARACTERS.test(search) ? search : "",
    dateFrom,
    dateTo,
    // Same convention as `readTableParams`: no sort in the URL = newest first; a sort without `dir` is ascending.
    sort: hasSort ? sortParam : "date",
    direction: hasSort ? (first(params.dir) === "desc" ? "desc" : "asc") : "desc",
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, MAX_PAGE) : 1
  };
}

/** Number of active filters (sort and page are not filters). */
export function countCrmFilters(state: CrmListState): number {
  return [state.status, state.product, state.country, state.advisor, state.urgency, state.source, state.search, state.dateFrom, state.dateTo].filter(Boolean).length;
}

/**
 * Query string (without `?`) of `GET /broker/crm/leads`. Filters use the API names (`productKey`,
 * `countryCode`, `advisorId`, `dateFrom`/`dateTo` as UTC day bounds, `search`), plus `sort`,
 * `sortDirection`, `page` and `pageSize`, always sent explicitly. `agencyId` is the spec 064 display filter.
 */
export function buildCrmLeadsApiQuery(state: CrmListState, agencyId?: string | undefined): string {
  const query = new URLSearchParams();
  const set = (name: string, value: string | undefined) => {
    if (value) query.set(name, value);
  };
  set("status", state.status);
  set("productKey", state.product);
  set("countryCode", state.country);
  set("advisorId", state.advisor);
  set("urgency", state.urgency);
  set("source", state.source);
  set("search", state.search);
  set("dateFrom", state.dateFrom ? `${state.dateFrom}T00:00:00.000Z` : undefined);
  set("dateTo", state.dateTo ? `${state.dateTo}T23:59:59.999Z` : undefined);
  set("agencyId", agencyId);
  query.set("sort", CRM_SORT_KEYS[state.sort]);
  query.set("sortDirection", state.direction);
  query.set("page", String(state.page));
  query.set("pageSize", String(CRM_LIST_PAGE_SIZE));
  return query.toString();
}

/** Adds the date range (day filters, accepted as-is by the export route) to an export link. */
export function withCrmDateRange(href: string, state: Pick<CrmListState, "dateFrom" | "dateTo">): string {
  const extra = new URLSearchParams();
  if (state.dateFrom) extra.set("dateFrom", state.dateFrom);
  if (state.dateTo) extra.set("dateTo", state.dateTo);
  const suffix = extra.toString();
  if (!suffix) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${suffix}`;
}

/** True when at least one lead of the page carries a human-approved indicative priority score. */
export function hasPriorityScores(leads: ReadonlyArray<{ priorityScore?: number | undefined }>): boolean {
  return leads.some((lead) => typeof lead.priorityScore === "number");
}

/**
 * The « Priorité IA » column (and its sort link) is shown when the priority sort is active or when a lead
 * of the page carries a score: page 2 or an unscored page must not hide the column the user is sorting on.
 */
export function showPriorityColumn(state: Pick<CrmListState, "sort">, leads: ReadonlyArray<{ priorityScore?: number | undefined }>): boolean {
  return state.sort === "priority" || hasPriorityScores(leads);
}

export const PRIORITY_LEVEL_LABELS: Record<string, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée"
};
