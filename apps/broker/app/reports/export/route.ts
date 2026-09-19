import { backOfficeApiBaseUrl, getBackOfficeToken } from "../../lib/backoffice-auth";

/**
 * Authenticated proxy for the broker activity export: the session token lives in an httpOnly
 * cookie, so a plain cross-origin link to the API could never carry it. Aggregates only.
 */
export async function GET(): Promise<Response> {
  const token = await getBackOfficeToken();
  if (!token) return new Response("session_required", { status: 401 });

  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/broker/dashboard/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return new Response(`export_unavailable_${response.status}`, { status: response.status });
    return new Response(await response.text(), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="rapport-activite-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch {
    return new Response("export_unavailable", { status: 502 });
  }
}
