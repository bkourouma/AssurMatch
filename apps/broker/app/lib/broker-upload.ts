import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

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
    if (response.ok) return { status: response.status };
    const payload = await response.json().catch(() => undefined) as { code?: unknown } | undefined;
    return { status: response.status, code: typeof payload?.code === "string" ? payload.code : undefined };
  } catch {
    return { status: 0 };
  }
}

/** Streams a file from the API to the broker's browser: attachment, never cached, never sniffed. */
export async function relayBrokerFile(path: string): Promise<Response> {
  const token = await getBackOfficeToken();
  if (!token) return new Response("session_required", { status: 401 });
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return new Response(`document_unavailable_${response.status}`, { status: response.status, headers: { "cache-control": "no-store" } });
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

/** 303 back to the page after a form post (the browser then GETs the page with the notice). */
export function seeOther(request: Request, location: string): Response {
  return Response.redirect(new URL(location, request.url), 303);
}
