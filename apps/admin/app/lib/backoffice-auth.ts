import { cookies } from "next/headers";

export const BACKOFFICE_TOKEN_COOKIE = "assurmatch_backoffice_token";

const ADMIN_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface BackOfficeProfile {
  actorId?: string;
  roles: string[];
  partnerTenantId?: string;
  partnerPlan?: "starter" | "pro" | "enterprise";
  countryScopes?: string[];
  productScopes?: string[];
  mfaVerified?: boolean;
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
