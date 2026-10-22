import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import { sanitizeExportFilters } from "./lead-export-links";
export { CRM_EXPORT_FILTERS, CRM_EXPORT_MAX_ROWS, STARTER_EXPORT_FILTERS, STARTER_EXPORT_MAX_ROWS } from "./lead-export-links";

/**
 * Spec 064 FR-001/FR-002: authenticated proxy shared by the Starter and CRM lead exports. The session
 * token lives in an httpOnly cookie, so a plain cross-origin link to the API could never carry it.
 *
 * Only a whitelist of query parameters is forwarded, each trimmed and validated; the API route does the
 * real authorisation (permission, plan, MFA, tenant) and audits the export. Upstream bodies are never
 * echoed back: a refusal is reduced to `export_unavailable_<status>`.
 */
export interface LeadExportRouteOptions {
  /** API route that returns the CSV, e.g. `/broker/starter/leads/export.csv`. */
  apiPath: string;
  /** Query parameters forwarded to the API; anything else is dropped. */
  allowedFilters: readonly string[];
  /** Row cap of the backend schema for this export; a larger `maxRows` is refused with 400. */
  maxRows: number;
  /** Download name prefix: `<prefix>-YYYY-MM-DD.csv`. */
  filePrefix: string;
}

export async function proxyLeadExport(request: Request, options: LeadExportRouteOptions): Promise<Response> {
  const token = await getBackOfficeToken();
  if (!token) return noStore(new Response("session_required", { status: 401 }));

  const filters = sanitizeExportFilters(new URL(request.url).searchParams, options.allowedFilters, { maxRows: options.maxRows });
  if ("invalid" in filters) return noStore(new Response(`invalid_filter_${filters.invalid}`, { status: 400 }));

  const queryString = filters.query.toString();
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${options.apiPath}${queryString ? `?${queryString}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return noStore(new Response(`export_unavailable_${response.status}`, { status: response.status }));
    return noStore(
      new Response(await response.text(), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${options.filePrefix}-${new Date().toISOString().slice(0, 10)}.csv"`
        }
      })
    );
  } catch {
    return noStore(new Response("export_unavailable", { status: 502 }));
  }
}

function noStore(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
