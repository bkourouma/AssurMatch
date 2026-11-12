import { NextRequest, NextResponse } from "next/server";
import {
  decideFromMe,
  decideWithoutProfile,
  isServerActionRequest,
  type MeOutcome,
  type MiddlewareDecision,
  type MiddlewareProfile
} from "./app/lib/middleware-policy";

// Doit rester identique a BACKOFFICE_TOKEN_COOKIE de app/lib/backoffice-auth.ts.
// Le nom est distinct de celui du back-office admin: les cookies navigateur ne
// sont pas isoles par port, donc un nom partage ecraserait la session de l'autre app.
const TOKEN_COOKIE = "assurmatch_broker_token";
const BROKER_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

function loginUrl(request: NextRequest, reason: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("reason", reason);
  url.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

function accessDeniedUrl(request: NextRequest, reason: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", reason);
  return url;
}

// Spec 066 F4: a Starter session keeps its session and lands on the dashboard with a notice.
function starterCrmDeniedUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("notice", "crm_requires_pro");
  return url;
}

function isPublicPath(pathname: string): boolean {
  return pathname.startsWith("/login") ||
    pathname.startsWith("/activate") ||
    pathname.startsWith("/password-reset") ||
    pathname.startsWith("/mfa") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    // Brand assets rendered on the auth screens (and fetched by the Next image optimizer).
    pathname === "/icon.png" ||
    pathname === "/logo-assurmatch.png" ||
    pathname === "/logo-assurmatch-white.png" ||
    pathname === "/logo-assurmatch-symbol.png";
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const isAction = isServerActionRequest(request.method, request.headers);
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const first = decideWithoutProfile({ isAction, hasToken: Boolean(token) });
  if (first.type !== "check_profile") return apply(request, first);

  let me: MeOutcome;
  try {
    const response = await fetch(`${BROKER_API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    me = response.ok ? { kind: "profile", profile: (await response.json()) as MiddlewareProfile } : { kind: "status", status: response.status };
  } catch {
    me = { kind: "unreachable" };
  }
  return apply(request, decideFromMe({ isAction, pathname: request.nextUrl.pathname, me }));
}

function apply(request: NextRequest, decision: MiddlewareDecision): NextResponse {
  switch (decision.type) {
    case "login": return NextResponse.redirect(loginUrl(request, decision.reason));
    case "access_denied": return NextResponse.redirect(accessDeniedUrl(request, "access_denied"));
    case "starter_crm": return NextResponse.redirect(starterCrmDeniedUrl(request));
    default: return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
