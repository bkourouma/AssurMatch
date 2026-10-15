import { cookies } from "next/headers";

// Nom de cookie propre a l'application admin: les cookies navigateur ne sont pas
// isoles par port, donc un nom partage avec le back-office courtier ecraserait sa
// session sur localhost. A garder synchronise avec apps/admin/middleware.ts.
export const BACKOFFICE_TOKEN_COOKIE = "assurmatch_admin_token";

// Trusted-device cookie (spec 063, FR-A04): opaque 256-bit token issued by the API after a successful MFA
// verification with "trust this device" ticked. Owned by the admin app only (never shared with the broker
// back-office), httpOnly, SameSite=Strict. Only this app's server actions read it and forward it to
// `/auth/login`; the Next middleware never reads it, so it must stay in sync with nothing else. It
// deliberately survives logout (30-day trust); only "revoke all devices" and a server-side rejection clear it.
export const BACKOFFICE_DEVICE_COOKIE = "assurmatch_admin_device";
export const BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const ADMIN_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface BackOfficeProfile {
  actorId?: string;
  roles: string[];
  partnerTenantId?: string;
  partnerPlan?: "starter" | "pro" | "enterprise";
  countryScopes?: string[];
  productScopes?: string[];
  mfaVerified?: boolean;
  /** True once a TOTP secret is enrolled: the MFA screen then offers verification only (FR-A11). */
  mfaEnrolled?: boolean;
  correlationId?: string;
}

export type BackOfficeSession =
  | { status: "authenticated"; token: string; profile: BackOfficeProfile }
  | { status: "mfa_required"; token: string; profile: BackOfficeProfile }
  | { status: "unauthenticated" | "expired" | "forbidden" | "error"; error?: string };

const ADMIN_ROLES = new Set(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin", "ai_admin"]);

export function backOfficeApiBaseUrl(): string {
  return ADMIN_API_BASE_URL;
}

export async function getBackOfficeToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(BACKOFFICE_TOKEN_COOKIE)?.value;
}

/** Trusted-device token stored by this application, if any (read by server actions only). */
export async function readTrustedDeviceToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(BACKOFFICE_DEVICE_COOKIE)?.value || undefined;
}

/** Stores the trusted-device token for at most 30 days (never longer than the API-side expiry). */
export async function setTrustedDeviceCookie(token: string, expiresAt?: string): Promise<void> {
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const remainingSeconds = Number.isFinite(expiresMs) ? Math.floor((expiresMs - Date.now()) / 1000) : BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS;
  const maxAge = Math.min(BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS, remainingSeconds);
  if (maxAge <= 0) return;
  const cookieStore = await cookies();
  cookieStore.set({
    name: BACKOFFICE_DEVICE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  });
}

/** Forgets the trusted device (rejected token, revocation, password change). Logout does NOT call this. */
export async function clearTrustedDeviceCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(BACKOFFICE_DEVICE_COOKIE);
}

/** Coarse, human-readable device label ("Chrome sur Windows") derived from the user agent; never an IP. */
export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//u.test(ua) ? "Edge" : /OPR\/|Opera/u.test(ua) ? "Opera" : /Firefox\//u.test(ua) ? "Firefox" : /Chrome\//u.test(ua) ? "Chrome" : /Safari\//u.test(ua) ? "Safari" : "Navigateur";
  const system = /Windows/u.test(ua) ? "Windows" : /Android/u.test(ua) ? "Android" : /iPhone|iPad|iPod/u.test(ua) ? "iOS" : /Mac OS X|Macintosh/u.test(ua) ? "macOS" : /Linux|X11/u.test(ua) ? "Linux" : undefined;
  return (system ? `${browser} sur ${system}` : browser).slice(0, 120);
}

export async function readBackOfficeSession(): Promise<BackOfficeSession> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated" };

  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "expired", error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", error: "access_denied" };
    if (!response.ok) return { status: "error", error: `api_${response.status}` };

    const profile = (await response.json()) as BackOfficeProfile;
    if (profile.mfaVerified !== true) return { status: "mfa_required", token, profile };
    return { status: "authenticated", token, profile };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function loginRedirect(returnTo: string, reason = "session_required"): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `/login?reason=${encodeURIComponent(reason)}&returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\n") || value.includes("\r")) return "/";
  return value;
}

export function isAdminProfile(profile: BackOfficeProfile): boolean {
  return profile.roles.some((role) => ADMIN_ROLES.has(role));
}
