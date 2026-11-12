import { NextRequest, NextResponse } from "next/server";
import { decideAccess, isServerActionRequest, type AuthOutcome, type MiddlewareProfile } from "./app/lib/middleware-policy";

// Doit rester identique a BACKOFFICE_TOKEN_COOKIE de app/lib/backoffice-auth.ts.
// Le nom est distinct de celui du back-office courtier: les cookies navigateur ne
// sont pas isoles par port, donc un nom partage ecraserait la session de l'autre app.
const TOKEN_COOKIE = "assurmatch_admin_token";
const ADMIN_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

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

async function resolveOutcome(token: string | undefined): Promise<AuthOutcome> {
  if (!token) return { kind: "no_token" };
  try {
    const response = await fetch(`${ADMIN_API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return { kind: "api_status", status: response.status };
    return { kind: "profile", profile: (await response.json()) as MiddlewareProfile };
  } catch {
    return { kind: "unreachable" };
  }
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  // Action serveur Next (en-tete `next-action`): jamais redirigee vers /login, l'action repond « Session expiree ».
  const isServerAction = isServerActionRequest(request.method, request.headers);
  const outcome = await resolveOutcome(request.cookies.get(TOKEN_COOKIE)?.value);
  const decision = decideAccess({ isServerAction, outcome });
  if (decision.type === "login") return NextResponse.redirect(loginUrl(request, decision.reason));
  if (decision.type === "access_denied") return NextResponse.redirect(accessDeniedUrl(request, "access_denied"));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
