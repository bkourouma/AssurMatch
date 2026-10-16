import { request, type Page } from "@playwright/test";
import { e2eEnv } from "./env";
import type { ApiResult } from "./pro-roles";

// Helpers of recos-062-data-reassign.spec.ts (lot 062, part 2): direct API calls for the parts of the
// journey that are not under test (setting up a conversation), probes of what a refusal returns, and
// the visitor-side public routes (token 054 in the query string, no session).

export const MESSAGING_FLAG = "broker_visitor_messaging_enabled";

const ADMIN_TOKEN_COOKIE = "assurmatch_admin_token";

/** The API bearer token of the admin session held by `page` (the page must have been opened with `openAs`). */
export async function adminBearerToken(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((entry) => entry.name === ADMIN_TOKEN_COOKIE);
  if (!cookie?.value) throw new Error(`no ${ADMIN_TOKEN_COOKIE} cookie: the page has no admin session`);
  return cookie.value;
}

export interface PublicCallOptions {
  /** Visitor token of the tracking link (`?token=`). */
  token?: string;
  json?: Record<string, unknown>;
  multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;
}

/** A call to a public (visitor) route of the API, without any session cookie or bearer token. */
export async function publicCall(method: "GET" | "POST", path: string, options: PublicCallOptions = {}): Promise<ApiResult> {
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl });
  try {
    const separator = path.includes("?") ? "&" : "?";
    const url = options.token ? `${path}${separator}token=${encodeURIComponent(options.token)}` : path;
    const response = await context.fetch(url, {
      method,
      ...(options.json ? { data: options.json } : {}),
      ...(options.multipart ? { multipart: options.multipart } : {})
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

/** The visitor token carried by a tracking link. */
export function tokenOfLink(trackingLink: string): string {
  const token = new URL(trackingLink).searchParams.get("token");
  if (!token) throw new Error(`no token in ${trackingLink}`);
  return token;
}
