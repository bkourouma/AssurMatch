import { uploadAdminPartnerDocument } from "../../../lib/admin-api";
import { adminWriteErrorMessage } from "../../../lib/catalog-messages";
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPE_OPTIONS, UPLOAD_CSRF_HEADER } from "../../../lib/partner-messages";

/**
 * Spec 051 FR-008: accreditation document upload. The browser posts the multipart form here; this
 * handler forwards it to `POST /admin/partners/:id/documents` with the session token read from the
 * httpOnly cookie, so the token never reaches the browser. A route handler (not a server action)
 * because a server action body is capped at 1 MB and a document may weigh up to 5 MB.
 *
 * CSRF: the request must carry the `x-assurmatch-upload` header (a cross-site form cannot set it
 * without a CORS preflight this handler never approves) and, when present, a same-host Origin.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN_LENGTH = 8;

function json(status: number, body: { status: "success" | "error"; message: string }): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function sameOrigin(request: Request): boolean {
  if (request.headers.get(UPLOAD_CSRF_HEADER) !== "1") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const { partnerId } = await params;
  if (!sameOrigin(request)) return json(403, { status: "error", message: "Requête refusée : origine non autorisée." });
  if (!UUID.test(partnerId)) return json(400, { status: "error", message: "Référence courtier invalide." });

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return json(400, { status: "error", message: "Formulaire illisible : rechargez la page puis recommencez." });
  }

  const file = incoming.get("file");
  const documentType = String(incoming.get("documentType") ?? "").trim();
  const licenseId = String(incoming.get("licenseId") ?? "").trim();
  const expirationDate = String(incoming.get("expirationDate") ?? "").trim();
  const reason = String(incoming.get("reason") ?? "").trim();

  if (reason.length < REASON_MIN_LENGTH) {
    return json(400, { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` });
  }
  if (!(file instanceof File) || file.size === 0) return json(400, { status: "error", message: "Choisissez un fichier (PDF, JPEG ou PNG)." });
  if (file.size > DOCUMENT_MAX_BYTES) return json(413, { status: "error", message: "Fichier trop volumineux : 5 Mo au maximum." });
  if (!(DOCUMENT_TYPE_OPTIONS as readonly string[]).includes(documentType)) return json(400, { status: "error", message: "Choisissez le type de document." });
  if (licenseId && !UUID.test(licenseId)) return json(400, { status: "error", message: "Licence invalide." });

  const outgoing = new FormData();
  outgoing.set("file", file, file.name);
  outgoing.set("documentType", documentType);
  if (licenseId) outgoing.set("licenseId", licenseId);
  if (expirationDate) outgoing.set("expirationDate", expirationDate);
  outgoing.set("reason", reason);

  const result = await uploadAdminPartnerDocument(partnerId, outgoing);
  if (!result.ok) return json(result.status || 502, { status: "error", message: adminWriteErrorMessage(result) });
  const scan = result.data?.scanStatus;
  const message = scan === "infected"
    ? "Document déposé mais placé en quarantaine (analyse antivirus positive) : il ne sera jamais servi ni accepté."
    : scan === "clean"
      ? "Document déposé et analysé sain. Il attend la revue de la conformité."
      : "Document déposé. L'analyse antivirus doit aboutir avant toute revue.";
  return json(201, { status: "success", message });
}
