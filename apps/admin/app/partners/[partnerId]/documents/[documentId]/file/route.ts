import { fetchAdminPartnerDocumentFile } from "../../../../../lib/admin-api";

/**
 * Spec 051 FR-012: audited download of an accreditation document. The session token stays on the
 * server: this handler calls `GET /admin/partners/:id/documents/:documentId/file` with it and
 * streams the bytes back as an attachment, never cached. The API refuses `support_admin` and
 * quarantined files; this handler only relays the refusal.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFUSALS: Record<number, string> = {
  401: "Session expirée : reconnectez-vous.",
  403: "Téléchargement refusé : droits insuffisants ou hors périmètre.",
  404: "Document introuvable.",
  422: "Document en quarantaine ou non analysé : il n'est jamais servi."
};

function refusal(status: number): Response {
  return new Response(REFUSALS[status] ?? "Téléchargement indisponible.", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ partnerId: string; documentId: string }> }): Promise<Response> {
  const { partnerId, documentId } = await params;
  if (!UUID.test(partnerId) || !UUID.test(documentId)) return refusal(404);

  let upstream: Response;
  try {
    upstream = await fetchAdminPartnerDocumentFile(partnerId, documentId);
  } catch {
    return refusal(502);
  }
  if (!upstream.ok || !upstream.body) return refusal(upstream.status || 502);

  const disposition = upstream.headers.get("content-disposition") ?? `attachment; filename="document-${documentId}"`;
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": disposition.startsWith("attachment") ? disposition : `attachment; filename="document-${documentId}"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  return new Response(upstream.body, { status: 200, headers });
}
