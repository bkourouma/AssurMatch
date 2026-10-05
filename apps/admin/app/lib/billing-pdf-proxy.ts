import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spec 060: authenticated proxy for invoice and credit note PDFs. The session token lives in an
 * httpOnly cookie, so the browser never calls the API directly; the API re-checks role, MFA and
 * country scope and audits the download.
 */
export async function proxyBillingPdf(kind: "issued-invoices" | "credit-notes", id: string): Promise<Response> {
  if (!UUID.test(id)) return new Response("invalid_document", { status: 400 });
  const token = await getBackOfficeToken();
  if (!token) return new Response("session_required", { status: 401 });
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/billing/${kind}/${id}/pdf`, {
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
