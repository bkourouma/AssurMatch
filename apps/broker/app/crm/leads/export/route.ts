import { CRM_EXPORT_FILTERS, CRM_EXPORT_MAX_ROWS, proxyLeadExport } from "../../../lib/lead-export-proxy";

/**
 * Spec 064 FR-002: CRM lead export. The API (`broker_crm:export`, Pro/Enterprise plan, MFA, tenant)
 * authorises and audits it; this route only forwards the session token and a whitelist of filters.
 * A static `export` segment never collides with the dynamic `[leadAssignmentId]` lead page.
 */
export async function GET(request: Request): Promise<Response> {
  return proxyLeadExport(request, {
    apiPath: "/broker/crm/leads/export.csv",
    allowedFilters: CRM_EXPORT_FILTERS,
    maxRows: CRM_EXPORT_MAX_ROWS,
    filePrefix: "leads-crm"
  });
}
