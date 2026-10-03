import { exportAuditLogs } from "../../../lib/operations-api";

/** Lets spreadsheet tools read the accented French content as UTF-8. */
const UTF8_BOM = String.fromCharCode(0xfeff);
const FILTER_KEYS = ["actorId", "action", "targetType", "targetId", "result", "from", "to"] as const;

/**
 * Spec 056 (H-05): authenticated proxy for the audit-log CSV export. The API restricts it to
 * compliance and super admins, caps it at 5 000 rows and audits it; this handler only turns the
 * JSON envelope into an attachment, since the session token lives in an httpOnly cookie.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filters: Record<string, string | undefined> = {};
  for (const key of FILTER_KEYS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) filters[key] = value;
  }
  const result = await exportAuditLogs(filters);
  if (result.status === "unauthenticated") return new Response("session_required", { status: 401 });
  if (result.status === "forbidden") return new Response("export_reserved_to_compliance", { status: 403 });
  if (result.status !== "success" || !result.data) return new Response(`export_unavailable_${result.error ?? "error"}`, { status: 502 });
  return new Response(`${UTF8_BOM}${result.data.csv}`, {
    status: 200,
    headers: {
      "content-type": result.data.contentType,
      "content-disposition": `attachment; filename="${result.data.fileName}"`,
      "cache-control": "no-store",
      "x-export-truncated": String(result.data.truncated)
    }
  });
}
