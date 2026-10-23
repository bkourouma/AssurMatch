/**
 * Spec 064 FR-001/FR-002: link of the « Exporter (CSV) » button. Only the active list filters whose
 * value IS the raw API value are forwarded (status, productKey, countryCode, advisorId, urgency,
 * source); labels are never sent. The day filter is a `YYYY-MM-DD` date and becomes a one-day range.
 * The export route re-validates everything and the API authorises and audits the export.
 */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface StarterExportFilters {
  status?: string | undefined;
  product?: string | undefined;
  country?: string | undefined;
  date?: string | undefined;
}

export interface CrmExportFilters extends StarterExportFilters {
  advisor?: string | undefined;
  urgency?: string | undefined;
  source?: string | undefined;
  /** Free-text search of the CRM list (backend field `search`). */
  search?: string | undefined;
  /** Spec 064 agency display filter: an agency uuid or `none`; absent for « Toutes les agences ». */
  agencyId?: string | undefined;
}

function buildHref(path: string, entries: Array<[string, string | undefined]>, date: string | undefined): string {
  const query = new URLSearchParams();
  for (const [name, value] of entries) {
    const trimmed = value?.trim();
    if (trimmed && trimmed !== "-") query.set(name, trimmed);
  }
  if (date && DAY_ONLY.test(date.trim())) {
    query.set("dateFrom", date.trim());
    query.set("dateTo", date.trim());
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function starterExportHref(filters: StarterExportFilters): string {
  return buildHref(
    "/leads/export",
    [
      ["status", filters.status],
      ["productKey", filters.product],
      ["countryCode", filters.country]
    ],
    filters.date
  );
}

export function crmExportHref(filters: CrmExportFilters): string {
  return buildHref(
    "/crm/leads/export",
    [
      ["status", filters.status],
      ["productKey", filters.product],
      ["countryCode", filters.country],
      ["advisorId", filters.advisor],
      ["urgency", filters.urgency],
      ["source", filters.source],
      ["search", filters.search],
      ["agencyId", filters.agencyId]
    ],
    filters.date
  );
}

export const STARTER_EXPORT_FILTERS = ["status", "productKey", "countryCode", "dateFrom", "dateTo", "maxRows"] as const;
export const CRM_EXPORT_FILTERS = ["status", "productKey", "countryCode", "advisorId", "urgency", "source", "search", "agencyId", "dateFrom", "dateTo", "maxRows"] as const;

/** Row caps of the backend export schemas (Starter 1000, CRM 2000). */
export const STARTER_EXPORT_MAX_ROWS = 1000;
export const CRM_EXPORT_MAX_ROWS = 2000;

const MAX_FILTER_LENGTH = 64;
const MAX_SEARCH_LENGTH = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A day filter (`YYYY-MM-DD`, what the list pages show) becomes the matching UTC boundary the API expects. */
function normalizeDate(name: string, value: string): string | undefined {
  if (DAY_ONLY.test(value)) {
    const candidate = `${value}${name === "dateTo" ? "T23:59:59.999Z" : "T00:00:00.000Z"}`;
    return Number.isNaN(new Date(candidate).valueOf()) ? undefined : candidate;
  }
  if (ISO_DATE_TIME.test(value) && !Number.isNaN(new Date(value).valueOf())) return value;
  return undefined;
}

/** Returns the sanitised query to forward, or the name of the first invalid filter. */
export function sanitizeExportFilters(
  searchParams: URLSearchParams,
  allowedFilters: readonly string[],
  limits: { maxRows: number } = { maxRows: CRM_EXPORT_MAX_ROWS }
): { query: URLSearchParams } | { invalid: string } {
  const query = new URLSearchParams();
  for (const name of allowedFilters) {
    const raw = searchParams.get(name);
    if (raw === null) continue;
    const value = raw.trim();
    if (value === "") continue;
    if (value.length > (name === "search" ? MAX_SEARCH_LENGTH : MAX_FILTER_LENGTH) || CONTROL_CHARACTERS.test(value)) return { invalid: name };

    if (name === "dateFrom" || name === "dateTo") {
      const normalized = normalizeDate(name, value);
      if (!normalized) return { invalid: name };
      query.set(name, normalized);
    } else if (name === "maxRows") {
      const rows = Number(value);
      if (!/^\d+$/.test(value) || !Number.isInteger(rows) || rows < 1 || rows > limits.maxRows) return { invalid: name };
      query.set(name, String(rows));
    } else if (name === "agencyId") {
      if (value !== "none" && !UUID.test(value)) return { invalid: name };
      query.set(name, value);
    } else {
      query.set(name, value);
    }
  }
  return { query };
}
