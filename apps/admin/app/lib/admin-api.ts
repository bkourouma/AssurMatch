import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

export const ADMIN_AUTH_SOURCE_MARKER = "admin-auth-client:014";

export interface BackOfficeLoginResult {
  status: "success" | "mfa_required" | "activation_required" | "locked" | "suspended" | "validation_error" | "invalid_credentials" | "error";
  accessToken?: string;
  mfaRequired?: boolean;
  error?: string;
}

export async function loginBackOffice(email: string, password: string): Promise<BackOfficeLoginResult> {
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  if (response.status === 400 || response.status === 422) return { status: "validation_error", error: `api_${response.status}` };
  if (response.status === 403) return { status: "suspended", error: "account_suspended" };
  if (response.status === 423) return { status: "locked", error: "account_locked" };
  if (response.status === 428) return { status: "activation_required", error: "activation_required" };
  if (response.status === 401) return { status: "invalid_credentials", error: "invalid_credentials" };
  if (!response.ok) return { status: "error", error: `api_${response.status}` };
  const session = await response.json() as { accessToken?: string; mfaRequired?: boolean };
  if (!session.accessToken) return { status: "error", error: "invalid_session" };
  return session.mfaRequired ? { status: "mfa_required", ...session } : { status: "success", ...session };
}

export async function readMe() {
  const token = await getBackOfficeToken();
  if (!token) return undefined;
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) return undefined;
  return response.json();
}

export async function enrollMfa() {
  const token = await getBackOfficeToken();
  if (!token) throw new Error("session_required");
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/mfa/enroll`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`api_${response.status}`);
  return response.json() as Promise<{ secret: string; otpauthUri: string; backupCodes: string[] }>;
}

export async function verifyMfa(code: string, kind: "totp" | "backup" = "totp") {
  const token = await getBackOfficeToken();
  if (!token) throw new Error("session_required");
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/mfa/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ code, kind }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`api_${response.status}`);
  return response.json();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const token = await getBackOfficeToken();
  if (!token) throw new Error("session_required");
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/password-change`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ oldPassword, newPassword }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`api_${response.status}`);
}

export async function readAdminHealth(): Promise<{ ok: boolean; error?: string; unauthenticated?: boolean; forbidden?: boolean }> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, unauthenticated: true, error: "session_required" };

  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/system/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { ok: false, unauthenticated: true, error: "session_expired" };
    if (response.status === 403) return { ok: false, forbidden: true, error: "access_denied" };
    return { ok: response.ok, ...(response.ok ? {} : { error: `api_${response.status}` }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface AdminApiState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden";
  data: T;
  error?: string;
  unauthenticated?: boolean;
  forbidden?: boolean;
}

export interface AdminDashboardData {
  window: { from: string; to: string };
  scope: {
    countries: string[];
    products: string[];
    partnerId: string | null;
    role: "super_admin" | "admin_pays" | "compliance_admin" | "support_admin" | "finance_admin" | "content_admin";
  };
  leadVolumes: { received: number; transmitted: number; refused: number; nonRouted: number };
  nonRoutedReasons: Array<{ reason: string; total: number }>;
  byCountry: Array<{ countryCode: string; total: number }>;
  byProduct: Array<{ productKey: string; total: number }>;
  partners: { active: number; inactive: number };
  expiredOffersStillReferenced: number;
  licenseAlerts: { expired: number; expiringSoon: number };
  complianceAlertCounts: {
    consentMissing: number;
    crmFlagClosed: number;
    rbacDenied: number;
    crossTenantAttempt: number;
    other: number;
  };
  sensitiveFeatureFlags: Array<{ key: string; scopeType: string; scopeId: string | null; value: boolean }>;
}

export interface ComplianceAlertsData {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    occurredAt: string;
    category: "consent_missing" | "crm_flag_closed" | "rbac_denied" | "cross_tenant_attempt" | "other";
    reason: string;
    actorId: string | null;
    actorRoles: string[];
    targetType: string;
    targetId: string | null;
    partnerTenantId: string | null;
  }>;
}

const emptyAdminDashboard: AdminDashboardData = {
  window: { from: "", to: "" },
  scope: { countries: [], products: [], partnerId: null, role: "support_admin" },
  leadVolumes: { received: 0, transmitted: 0, refused: 0, nonRouted: 0 },
  nonRoutedReasons: [],
  byCountry: [],
  byProduct: [],
  partners: { active: 0, inactive: 0 },
  expiredOffersStillReferenced: 0,
  licenseAlerts: { expired: 0, expiringSoon: 0 },
  complianceAlertCounts: { consentMissing: 0, crmFlagClosed: 0, rbacDenied: 0, crossTenantAttempt: 0, other: 0 },
  sensitiveFeatureFlags: []
};

const emptyComplianceAlerts: ComplianceAlertsData = { page: 1, pageSize: 25, total: 0, items: [] };

async function readAdmin<T>(path: string, fallback: T): Promise<AdminApiState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, forbidden: true, error: "access_denied" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function readAdminDashboard() {
  return readAdmin<AdminDashboardData>("/admin/dashboard", emptyAdminDashboard);
}

export function readComplianceAlerts(page = 1, pageSize = 25) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return readAdmin<ComplianceAlertsData>(`/admin/dashboard/compliance-alerts?${params.toString()}`, emptyComplianceAlerts);
}
