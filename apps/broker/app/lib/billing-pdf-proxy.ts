import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spec 060 FR-17: proxy serveur des PDF de facture et d'avoir. Le jeton de session reste dans le
 * cookie httpOnly; l'API re-verifie le tenant, le role (billing:read_own) et la MFA, et audite le
 * telechargement. Un document d'un autre cabinet repond 404.
 */
export async function proxyBrokerBillingPdf(kind: "invoices" | "credit-notes", id: string): Promise<Response> {
  if (!UUID.test(id)) return new Response("invalid_document", { status: 400 });
  const token = await getBackOfficeToken();
  if (!token) return new Response("session_required", { status: 401 });
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/broker/billing/${kind}/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return new Response(`document_unavailable_${response.status}`, { status: response.status });
    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": response.headers.get("content-disposition") ?? `attachment; filename="document-${id}.pdf"`,
        "cache-control": "no-store"
      }
    });
  } catch {
    return new Response("document_unavailable", { status: 502 });
  }
}
