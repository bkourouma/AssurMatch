import { uploadBrokerLicenseProof } from "../../../lib/self-service-api";
import { PROOF_MAX_BYTES, UPLOAD_CSRF_HEADER, selfServiceErrorMessage } from "../../../lib/self-service-messages";

/**
 * Spec 053 FR-007: licence proof upload. The browser posts the multipart form here; this handler
 * forwards it to `POST /broker/licenses/:id/documents` with the session token read from the httpOnly
 * cookie, so the token never reaches the browser. A route handler (not a server action) because a
 * server action body is capped at 1 MB and a proof may weigh up to 5 MB (same pattern as spec 051).
 *
 * CSRF: the request must carry the `x-assurmatch-upload` header (a cross-site form cannot set it
 * without a CORS preflight this handler never approves) and, when present, a same-host Origin.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function POST(request: Request, { params }: { params: Promise<{ licenseId: string }> }): Promise<Response> {
  const { licenseId } = await params;
  if (!sameOrigin(request)) return json(403, { status: "error", message: "Requête refusée : origine non autorisée." });
  if (!UUID.test(licenseId)) return json(400, { status: "error", message: "Référence de licence invalide." });

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return json(400, { status: "error", message: "Formulaire illisible : rechargez la page puis recommencez." });
  }
  const file = incoming.get("file");
  const reason = String(incoming.get("reason") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return json(400, { status: "error", message: "Choisissez un fichier (PDF, JPEG ou PNG)." });
  if (file.size > PROOF_MAX_BYTES) return json(413, { status: "error", message: "Fichier trop volumineux : 5 Mo au maximum." });

  const outgoing = new FormData();
  outgoing.set("file", file, file.name);
  if (reason) outgoing.set("reason", reason.slice(0, 500));

  const result = await uploadBrokerLicenseProof(licenseId, outgoing);
  if (!result.ok) return json(result.status || 502, { status: "error", message: selfServiceErrorMessage(result) });
  const scan = result.data?.document.scanStatus;
  const message = scan === "infected"
    ? "Preuve déposée mais placée en quarantaine (analyse antivirus positive) : déposez un autre fichier."
    : result.data?.license.status === "pending_review"
      ? "Preuve déposée et analysée saine : la licence est en revue par la conformité AssurMatch."
      : "Preuve déposée. L'analyse antivirus doit aboutir avant la revue.";
  return json(201, { status: "success", message });
}
