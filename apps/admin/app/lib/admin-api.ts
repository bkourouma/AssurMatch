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

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  roles: string[];
  partnerTenantId?: string | null;
  countryScopes: string[];
  productScopes: string[];
  status: "invited" | "active" | "suspended" | "locked" | "deleted";
  mfaStatus: "not_enrolled" | "required" | "enrolled" | "verified";
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  lockedAt?: string | null;
  deletedAt?: string | null;
  failedLoginCount?: number;
  passwordChangeRequired?: boolean;
  lockedReason?: string | null;
}

export interface AdminUserCreateResult {
  user: AdminUser;
  emailStatus: "not_configured" | "sent" | "failed";
  token?: string;
  expiresAt: string;
}

export interface AdminUserTokenResult {
  emailStatus: "not_configured" | "sent" | "failed";
  token?: string;
  expiresAt: string;
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

export interface ActivationChecklistData {
  generatedAt: string;
  summary: { passed: number; warning: number; blocked: number };
  sections: Array<{
    key: string;
    title: string;
    status: "passed" | "warning" | "blocked";
    scope: {
      countryId: string | null;
      countryCode: string | null;
      productId: string | null;
      productKey: string | null;
      partnerId: string | null;
    };
    controls: Array<{
      key: string;
      label: string;
      status: "passed" | "warning" | "blocked";
      evidence: string;
      blocking: boolean;
    }>;
  }>;
}

export interface BillingFoundationData {
  generatedAt: string;
  billingEnabled: boolean;
  paymentsEnabled: false;
  collectionEnabled: false;
  currency: "XOF";
  period: { from: string; to: string };
  page: number;
  pageSize: number;
  total: number;
  totals: { partners: number; acceptedLeadCount: number; disputedLeadCount: number };
  partners: Array<{
    partnerId: string;
    partnerName: string;
    plan: "starter" | "pro" | "enterprise";
    acceptedLeadCount: number;
    disputedLeadCount: number;
    draftNonBillableReference: string;
    invoiceStatus: "draft_not_billable";
    paymentStatus: "not_applicable";
  }>;
  restrictions: string[];
}

export interface AIAssistanceData {
  generatedAt: string;
  surface: "broker_crm" | "admin_platform";
  enabled: false;
  modelCall: false;
  humanValidationRequired: true;
  auditPolicy: "metadata_only";
  availableAssistTypes: string[];
  flags: Array<{ key: string; value: boolean; required: boolean }>;
  guardrails: {
    centralAiModuleOnly: true;
    piiMinimized: true;
    outputIsAdvisory: true;
    noAutomatedDecision: true;
  };
  message: string;
}

export interface PartnerIntegrationsData {
  apiKeys: {
    generatedAt: string;
    total: number;
    items: Array<{
      id: string;
      partnerTenantId: string;
      name: string;
      keyPrefix: string;
      scopes: string[];
      status: "active" | "revoked";
      createdAt: string;
      updatedAt: string;
      lastUsedAt?: string;
      revokedAt?: string;
    }>;
  };
  webhookEndpoints: {
    generatedAt: string;
    total: number;
    items: Array<{
      id: string;
      partnerTenantId: string;
      url: string;
      description?: string;
      eventTypes: string[];
      status: "disabled" | "active" | "suspended";
      secretConfigured: true;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  webhookDeliveries: {
    generatedAt: string;
    total: number;
    items: Array<{
      id: string;
      endpointId?: string;
      partnerTenantId: string;
      eventId: string;
      eventType: string;
      status: "skipped" | "pending" | "retryable" | "delivered" | "failed" | "dead_letter";
      attemptCount: number;
      nextAttemptAt?: string;
      lastResponseClass?: string;
      idempotencyKey: string;
      payloadMetadata: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }>;
  };
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
const emptyActivationChecklist: ActivationChecklistData = {
  generatedAt: "",
  summary: { passed: 0, warning: 0, blocked: 0 },
  sections: []
};
const emptyBillingFoundation: BillingFoundationData = {
  generatedAt: "",
  billingEnabled: false,
  paymentsEnabled: false,
  collectionEnabled: false,
  currency: "XOF",
  period: { from: "", to: "" },
  page: 1,
  pageSize: 25,
  total: 0,
  totals: { partners: 0, acceptedLeadCount: 0, disputedLeadCount: 0 },
  partners: [],
  restrictions: []
};
const emptyAIAssistance: AIAssistanceData = {
  generatedAt: "",
  surface: "admin_platform",
  enabled: false,
  modelCall: false,
  humanValidationRequired: true,
  auditPolicy: "metadata_only",
  availableAssistTypes: [],
  flags: [],
  guardrails: { centralAiModuleOnly: true, piiMinimized: true, outputIsAdvisory: true, noAutomatedDecision: true },
  message: ""
};
const emptyPartnerIntegrations: PartnerIntegrationsData = {
  apiKeys: { generatedAt: "", total: 0, items: [] },
  webhookEndpoints: { generatedAt: "", total: 0, items: [] },
  webhookDeliveries: { generatedAt: "", total: 0, items: [] }
};

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

async function writeAdmin<T>(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<T> {
  const token = await getBackOfficeToken();
  if (!token) throw new Error("session_required");
  const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (response.status === 401) throw new Error("session_expired");
  if (response.status === 403) throw new Error("access_denied");
  if (!response.ok) throw new Error(`api_${response.status}`);
  return response.json() as Promise<T>;
}

export function readAdminDashboard() {
  return readAdmin<AdminDashboardData>("/admin/dashboard", emptyAdminDashboard);
}

export function readComplianceAlerts(page = 1, pageSize = 25) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return readAdmin<ComplianceAlertsData>(`/admin/dashboard/compliance-alerts?${params.toString()}`, emptyComplianceAlerts);
}

export function readActivationChecklist(filters: { country?: string; product?: string; partnerId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.country) params.set("country", filters.country);
  if (filters.product) params.set("product", filters.product);
  if (filters.partnerId) params.set("partnerId", filters.partnerId);
  const query = params.toString();
  return readAdmin<ActivationChecklistData>(`/admin/activation-checklist${query ? `?${query}` : ""}`, emptyActivationChecklist);
}

export function readBillingFoundation(filters: { partnerId?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams();
  if (filters.partnerId) params.set("partnerId", filters.partnerId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return readAdmin<BillingFoundationData>(`/admin/billing/foundation${query ? `?${query}` : ""}`, emptyBillingFoundation);
}

export function readAdminAIAssistance() {
  return readAdmin<AIAssistanceData>("/admin/ai/assistance", emptyAIAssistance);
}

export async function readPartnerIntegrations(): Promise<AdminApiState<PartnerIntegrationsData>> {
  const [apiKeys, webhookEndpoints, webhookDeliveries] = await Promise.all([
    readAdmin<PartnerIntegrationsData["apiKeys"]>("/admin/partner-integrations/api-keys", emptyPartnerIntegrations.apiKeys),
    readAdmin<PartnerIntegrationsData["webhookEndpoints"]>("/admin/partner-integrations/webhook-endpoints", emptyPartnerIntegrations.webhookEndpoints),
    readAdmin<PartnerIntegrationsData["webhookDeliveries"]>("/admin/partner-integrations/webhook-deliveries", emptyPartnerIntegrations.webhookDeliveries)
  ]);
  const status = [apiKeys.status, webhookEndpoints.status, webhookDeliveries.status].find((item) => item !== "success") ?? "success";
  const error = apiKeys.error ?? webhookEndpoints.error ?? webhookDeliveries.error;
  const unauthenticated = apiKeys.unauthenticated || webhookEndpoints.unauthenticated || webhookDeliveries.unauthenticated;
  const forbidden = apiKeys.forbidden || webhookEndpoints.forbidden || webhookDeliveries.forbidden;
  return {
    status,
    data: { apiKeys: apiKeys.data, webhookEndpoints: webhookEndpoints.data, webhookDeliveries: webhookDeliveries.data },
    ...(unauthenticated ? { unauthenticated } : {}),
    ...(forbidden ? { forbidden } : {}),
    ...(error ? { error } : {})
  };
}

export function readAdminUsers(filters: { role?: string; status?: string } = {}) {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  return readAdmin<AdminUser[]>(`/admin/users?${params.toString()}`, []);
}

export function readAdminUser(userId: string) {
  return readAdmin<AdminUser | null>(`/admin/users/${encodeURIComponent(userId)}`, null);
}

export function createAdminUser(input: {
  email: string;
  displayName: string;
  phone?: string;
  roles: string[];
  partnerTenantId?: string | null;
  scopes: { countryIds: string[]; productIds: string[] };
  reason: string;
}) {
  return writeAdmin<AdminUserCreateResult>("/admin/users", "POST", input);
}

export function updateAdminUser(userId: string, input: { displayName?: string; phone?: string; scopes?: { countryIds: string[]; productIds: string[] }; reason: string }) {
  return writeAdmin<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, "PATCH", input);
}

export function updateAdminUserRoles(userId: string, input: { roles: string[]; reason: string }) {
  return writeAdmin<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/role-update`, "POST", input);
}

export function runAdminUserAction(userId: string, action: "suspend" | "unsuspend" | "lock" | "unlock" | "mfa-reset" | "delete", reason: string) {
  const method = action === "delete" ? "DELETE" : "POST";
  return writeAdmin<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/${action}`, method, { reason });
}

export function issueAdminUserPasswordReset(userId: string, reason: string) {
  return writeAdmin<AdminUserTokenResult>(`/admin/users/${encodeURIComponent(userId)}/password-reset`, "POST", { reason });
}

export async function activateWithToken(token: string, password: string): Promise<BackOfficeLoginResult> {
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
    cache: "no-store"
  });
  if (response.status === 400 || response.status === 422) return { status: "validation_error", error: `api_${response.status}` };
  if (!response.ok) return { status: "error", error: `api_${response.status}` };
  const session = await response.json() as { accessToken?: string; mfaRequired?: boolean };
  if (!session.accessToken) return { status: "error", error: "invalid_session" };
  return session.mfaRequired ? { status: "mfa_required", ...session } : { status: "success", ...session };
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<void> {
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`api_${response.status}`);
}
