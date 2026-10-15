import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import { extractForbiddenWording } from "./conversation-vocabulary";

/**
 * Spec 055: server-side relays of the broker uploads (proposal PDF, internal lead documents) and
 * downloads. The session token is read from the httpOnly cookie here and never reaches the browser;
 * the API re-checks tenant, role, plan, suspension and antivirus on every call.
 */
export const BROKER_UPLOAD_SOURCE_MARKER = "broker-upload-relay:055";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BrokerRelayResult {
  status: number;
  code?: string | undefined;
  /** Spec 062: expression(s) the wording guard refused (FORBIDDEN_WORDING only). */
  wording?: string[] | undefined;
}

/**
 * A form posted to a route handler does not get the built-in Server Action origin check, so it is
 * done here: a request carrying an `Origin` header from another host is refused (CSRF).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Forwards a multipart form to the API with the session token; returns the status and the error code. */
export async function forwardBrokerMultipart(path: string, form: FormData): Promise<BrokerRelayResult> {
  const token = await getBackOfficeToken();
  if (!token) return { status: 401 };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store"
    });
    return await relayResult(response);
  } catch {
    return { status: 0 };
  }
}

async function relayResult(response: Response): Promise<BrokerRelayResult> {
  if (response.ok) return { status: response.status };
  const payload = await response.json().catch(() => undefined) as { code?: unknown } | undefined;
  const code = typeof payload?.code === "string" ? payload.code : undefined;
  const wording = code === "FORBIDDEN_WORDING" ? extractForbiddenWording(payload) : [];
  return { status: response.status, code, ...(wording.length > 0 ? { wording } : {}) };
}

/** Spec 062: forwards a JSON body (document request) with the session token; same result as the multipart relay. */
export async function forwardBrokerJson(path: string, body: Record<string, unknown>): Promise<BrokerRelayResult> {
  const token = await getBackOfficeToken();
  if (!token) return { status: 401 };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return await relayResult(response);
  } catch {
    return { status: 0 };
  }
}

/** Spec 062: the only types a visitor-provided file may be served as to a broker. */
export const VISITOR_FILE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

/** A neutral, header-safe file name (no path, no quote, no control character, no non-ASCII). */
export function safeAttachmentFileName(raw: string | null, fallback: string): string {
  let name: string;
  const star = raw?.match(/filename\*\s*=\s*(?:UTF-8'[^']*')?([^;]+)/i)?.[1];
  const plain = raw?.match(/filename\s*=\s*(?:"([^"]*)"|([^;]+))/i);
  const candidate = star ?? plain?.[1] ?? plain?.[2] ?? "";
  try {
    name = star ? decodeURIComponent(candidate.trim()) : candidate.trim();
  } catch {
    name = candidate.trim();
  }
  const separators = /^.*[\\/]/;
  const unsafe = /["\\;<>:*?|]/g;
  name = name.replace(separators, "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(unsafe, "_").replace(/^\.+/, "").trim().slice(0, 100);
  return name || fallback;
}

export interface RelayBrokerFileOptions {
  /** Spec 062: serve a visitor-provided file only as PDF/JPEG/PNG, always as an attachment in a sandbox. */
  visitorProvided?: boolean;
}

/** Streams a file from the API to the broker's browser: attachment, never cached, never sniffed. */
export async function relayBrokerFile(path: string, options: RelayBrokerFileOptions = {}): Promise<Response> {
  const token = await getBackOfficeToken();
  if (!token) return new Response("session_required", { status: 401 });
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return new Response(`document_unavailable_${response.status}`, { status: response.status, headers: { "cache-control": "no-store" } });
    if (options.visitorProvided) {
      const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!(VISITOR_FILE_MIME_TYPES as readonly string[]).includes(type)) {
        await response.body?.cancel().catch(() => undefined);
        return new Response("document_unavailable", { status: 502, headers: { "cache-control": "no-store" } });
      }
      const extension = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";
      return new Response(response.body, {
        status: 200,
        headers: {
          "content-type": type,
          "content-disposition": `attachment; filename="${safeAttachmentFileName(response.headers.get("content-disposition"), `fichier.${extension}`)}"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox",
          "referrer-policy": "no-referrer"
        }
      });
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition": response.headers.get("content-disposition") ?? "attachment",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      }
    });
  } catch {
    return new Response("document_unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }
}

/**
 * 303 back to the page after a form post (the browser then GETs the page with the notice).
 *
 * Spec 059 fix: the Location is RELATIVE. `new URL(location, request.url)` resolved against the
 * address Next.js listens on (`http://localhost:<port>`), not the one the browser used, so behind a
 * proxy or on 127.0.0.1 the broker was sent to another origin without its session cookie and
 * landed on the login page right after sending a proposal. A relative Location (RFC 9110) always
 * stays on the origin of the request. `request` is kept for the call sites' signature.
 */
export function seeOther(_request: Request, location: string): Response {
  return new Response(null, { status: 303, headers: { Location: sameOriginPath(location) } });
}

/** Spec 062: only a same-origin absolute path is accepted (no `//host`, no backslash, no other origin). */
function sameOriginPath(location: string): string {
  if (!location.startsWith("/") || location.startsWith("//") || location.includes("\\")) return "/";
  try {
    return new URL(location, "http://same-origin.invalid").origin === "http://same-origin.invalid" ? location : "/";
  } catch {
    return "/";
  }
}
