import { STARTER_EXPORT_FILTERS, STARTER_EXPORT_MAX_ROWS, proxyLeadExport } from "../../lib/lead-export-proxy";

/**
 * Spec 064 FR-001: Starter lead export. The API (`broker_leads:export`, MFA, tenant) authorises and
 * audits it; this route only forwards the session token and a whitelist of filters.
 */
export async function GET(request: Request): Promise<Response> {
  return proxyLeadExport(request, {
    apiPath: "/broker/starter/leads/export.csv",
    allowedFilters: STARTER_EXPORT_FILTERS,
    maxRows: STARTER_EXPORT_MAX_ROWS,
    filePrefix: "leads-starter"
  });
}
