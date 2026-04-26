import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "assurmatch_backoffice_token";
const BROKER_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

interface Profile {
  roles?: string[];
  partnerPlan?: string;
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
  return pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt";
}

function isBrokerProfile(profile: Profile): boolean {
  return profile.roles?.some((role) => role.startsWith("broker_")) === true;
}

function isStarterCrmDenied(profile: Profile, pathname: string): boolean {
  return pathname.startsWith("/crm") && (profile.partnerPlan === "starter" || profile.roles?.includes("broker_owner_starter") === true);
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.redirect(loginUrl(request, "session_required"));

  try {
    const response = await fetch(`${BROKER_API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return NextResponse.redirect(loginUrl(request, "session_expired"));
    if (!response.ok) return NextResponse.redirect(loginUrl(request, "session_invalid"));

    const profile = (await response.json()) as Profile;
    if (profile.mfaVerified !== true) return NextResponse.redirect(loginUrl(request, "mfa_required"));
    if (!isBrokerProfile(profile)) return NextResponse.redirect(accessDeniedUrl(request, "access_denied"));
    if (isStarterCrmDenied(profile, request.nextUrl.pathname)) return NextResponse.redirect(accessDeniedUrl(request, "starter_crm_denied"));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl(request, "auth_unavailable"));
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
