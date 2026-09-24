import { NextRequest, NextResponse } from "next/server";

// Doit rester identique a BACKOFFICE_TOKEN_COOKIE de app/lib/backoffice-auth.ts.
// Le nom est distinct de celui du back-office courtier: les cookies navigateur ne
// sont pas isoles par port, donc un nom partage ecraserait la session de l'autre app.
const TOKEN_COOKIE = "assurmatch_admin_token";
const ADMIN_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";
const ADMIN_ROLES = new Set(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin", "ai_admin"]);

interface Profile {
  roles?: string[];
  mfaVerified?: boolean;
}

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

function isAdminProfile(profile: Profile): boolean {
  return profile.roles?.some((role) => ADMIN_ROLES.has(role)) === true;
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.redirect(loginUrl(request, "session_required"));

  try {
    const response = await fetch(`${ADMIN_API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return NextResponse.redirect(loginUrl(request, "session_expired"));
    if (!response.ok) return NextResponse.redirect(loginUrl(request, "session_invalid"));

    const profile = (await response.json()) as Profile;
    if (profile.mfaVerified !== true) return NextResponse.redirect(loginUrl(request, "mfa_required"));
    if (!isAdminProfile(profile)) return NextResponse.redirect(accessDeniedUrl(request, "access_denied"));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl(request, "auth_unavailable"));
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
