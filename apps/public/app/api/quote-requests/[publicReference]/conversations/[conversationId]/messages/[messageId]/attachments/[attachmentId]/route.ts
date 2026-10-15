import { fetchVisitorMessageAttachment } from "../../../../../../../../../lib/public-api";

/**
 * Spec 062 FR-005: download of a message attachment (broker side) from the visitor tracking space.
 * The browser only ever talks to the public site: this handler forwards the visitor token (already
 * in the tracking URL, never more) to the API server-side and streams the file back. Nothing is
 * cached and every refusal (wrong, expired or revoked token, foreign conversation or message, file
 * not clean, consent withdrawn) reads as one neutral 404, as the API does.
 */

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

/** The attachment types the messaging accepts; anything else from upstream is refused. */
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png"
};

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow"
} as const;

function neutral(status: 404 | 429 | 502): Response {
  return new Response(status === 429 ? "Too many requests" : status === 502 ? "Unavailable" : "Not found", {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
  });
}

/** Keeps the API's plain file name when it has the right extension; otherwise a neutral default. */
function attachmentDisposition(upstream: string | null, extension: string): string {
  const match = upstream?.match(/filename="?([A-Za-z0-9._ -]{1,120})"?/i);
  const name = match?.[1];
  const safe = name && name.toLowerCase().endsWith(`.${extension}`) ? name : `piece-jointe.${extension}`;
  return `attachment; filename="${safe}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicReference: string; conversationId: string; messageId: string; attachmentId: string }> }
): Promise<Response> {
  const { publicReference, conversationId, messageId, attachmentId } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (
    !REFERENCE_PATTERN.test(publicReference)
    || !CONVERSATION_ID_PATTERN.test(conversationId)
    || !ENTITY_ID_PATTERN.test(messageId)
    || !ENTITY_ID_PATTERN.test(attachmentId)
    || !TOKEN_PATTERN.test(token)
  ) {
    return neutral(404);
  }

  let upstream: Response;
  try {
    upstream = await fetchVisitorMessageAttachment(publicReference, conversationId, messageId, attachmentId, token);
  } catch {
    return neutral(502);
  }
  if (upstream.status === 429) return neutral(429);
  if (!upstream.ok || !upstream.body) return neutral(upstream.status >= 500 ? 502 : 404);

  const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = FILE_TYPES[contentType];
  if (!extension) return neutral(404);

  const length = upstream.headers.get("content-length");
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": attachmentDisposition(upstream.headers.get("content-disposition"), extension),
      ...(length && /^\d+$/.test(length) ? { "Content-Length": length } : {})
    }
  });
}
