import { fetchProposalDocument } from "../../../../../../lib/public-api";

/**
 * Spec 055 FR-005: download of a broker proposal PDF from the visitor tracking space. The browser
 * only ever talks to the public site: this handler forwards the visitor token (already in the
 * tracking URL, never more) to the API server-side and streams the PDF back. Nothing is cached and
 * every refusal (wrong, expired or revoked token, foreign or withdrawn proposal, no clean file,
 * consent withdrawn) reads as one neutral 404, as the API does.
 */

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const PROPOSAL_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

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

/** Keeps the API's attachment file name when it is a plain one; otherwise a neutral default. */
function attachmentDisposition(upstream: string | null): string {
  const match = upstream?.match(/filename="?([A-Za-z0-9._ -]{1,120}\.pdf)"?/i);
  return `attachment; filename="${match?.[1] ?? "proposition.pdf"}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicReference: string; proposalId: string }> }
): Promise<Response> {
  const { publicReference, proposalId } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!REFERENCE_PATTERN.test(publicReference) || !PROPOSAL_ID_PATTERN.test(proposalId) || !TOKEN_PATTERN.test(token)) {
    return neutral(404);
  }

  let upstream: Response;
  try {
    upstream = await fetchProposalDocument(publicReference, proposalId, token);
  } catch {
    return neutral(502);
  }
  if (upstream.status === 429) return neutral(429);
  if (!upstream.ok || !upstream.body) return neutral(upstream.status >= 500 ? 502 : 404);

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/pdf")) return neutral(404);

  const length = upstream.headers.get("content-length");
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(upstream.headers.get("content-disposition")),
      ...(length && /^\d+$/.test(length) ? { "Content-Length": length } : {})
    }
  });
}
