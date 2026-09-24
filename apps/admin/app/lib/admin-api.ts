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
  enabled: boolean;
  modelCall: boolean;
  provider?: string;
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
  webhookAllowlist: {
    generatedAt: string;
    total: number;
    items: Array<{
      id: string;
      partnerTenantId: string;
      origin: string;
      path?: string;
      status: "active" | "revoked";
      createdAt: string;
      updatedAt: string;
      revokedAt?: string;
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
  webhookAllowlist: { generatedAt: "", total: 0, items: [] },
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

export interface AdminPartnerSlaRowData {
  partnerTenantId: string;
  partnerName: string;
  plan: "starter" | "pro" | "enterprise";
  firstActionTargetMinutes: number;
  leadsMeasured: number;
  leadsWithinTarget: number;
  complianceRate: number;
  averageFirstActionMinutes: number | null;
}

export function readPartnerSla() {
  return readAdmin<AdminPartnerSlaRowData[]>("/admin/partners/sla", []);
}

export interface MessagingProviderStatusData {
  channel: "sms" | "whatsapp";
  enabled: boolean;
  configured: boolean;
  provider: string;
  flagKey: string;
  secretConfigured: boolean;
  sendCapable: boolean;
  reason: string;
}

export interface MessagingDeliveryData {
  id: string;
  channel: string;
  status: "sent" | "refused" | "failed";
  template: string;
  recipientMasked: string;
  provider: string;
  partnerTenantId: string | null;
  reason: string | null;
  createdAt: string;
}

export function readMessagingProviders() {
  return readAdmin<{ generatedAt: string; providers: MessagingProviderStatusData[]; restrictions: string[] }>("/admin/messaging/providers", { generatedAt: "", providers: [], restrictions: [] });
}

export function readMessagingDeliveries() {
  return readAdmin<MessagingDeliveryData[]>("/admin/messaging/deliveries", []);
}

export interface BillingPlanPriceData {
  id: string;
  plan: "starter" | "pro" | "enterprise";
  countryCode: string;
  monthlySubscription: number;
  perLeadPrice: number;
  setupFee: number;
  currency: "XOF";
  updatedAt: string;
}

export interface DraftInvoiceData {
  id: string;
  partnerId: string;
  partnerName: string;
  plan: string;
  countryCode: string;
  reference: string;
  status: "draft_not_billable";
  paymentStatus: "not_applicable";
  currency: "XOF";
  lines: Array<{ kind: string; label: string; quantity: number; unitAmount: number; amount: number }>;
  billableLeadCount: number;
  nonBillableLeadCount: number;
  disputeCreditCount: number;
  packCreditsUsed: number;
  totalAmount: number;
  computedAt: string;
}

export interface LeadPackData {
  id: string;
  partnerId: string;
  creditsGranted: number;
  creditsConsumed: number;
  creditsRemaining: number;
  reason: string;
  grantedAt: string;
}

export function readBillingPlans() {
  return readAdmin<BillingPlanPriceData[]>("/admin/billing/plans", []);
}

export function readDraftInvoices() {
  return readAdmin<{ items: DraftInvoiceData[]; total: number; paymentsEnabled: boolean; notice: string }>("/admin/billing/invoices", { items: [], total: 0, paymentsEnabled: false, notice: "" });
}

export function readLeadPacks() {
  return readAdmin<LeadPackData[]>("/admin/billing/packs", []);
}

/** Spec 046: mirrors `packages/shared/contracts/data-retention.contracts.ts` (metadata and counts only, no personal data). */
export const RETENTION_CATEGORY_KEYS = [
  "quote_requests",
  "quote_documents",
  "contact_messages",
  "partner_applications",
  "waitlist",
  "ai_traces",
  "webhook_payloads",
  "messaging_references"
] as const;
export type RetentionCategoryKey = (typeof RETENTION_CATEGORY_KEYS)[number];
export type RetentionSubjectKey = RetentionCategoryKey | "prospects";

export interface RetentionPolicyItemData {
  category: RetentionCategoryKey;
  retentionDays: number;
  source: "default" | "global" | "country";
  anchor: "last_activity" | "created_at" | "reviewed_at" | "country_public_since" | "occurred_at";
  defaultRetentionDays: number;
  globalRetentionDays: number | null;
  countryRetentionDays: number | null;
  overrideReason: string | null;
  overrideUpdatedAt: string | null;
}

export interface RetentionCountryOptionData {
  id: string;
  isoCode: string;
  name: string;
  status: string;
}

export interface RetentionPoliciesData {
  countryId: string | null;
  purgeEnabled: boolean;
  items: RetentionPolicyItemData[];
  countries: RetentionCountryOptionData[];
}

export interface RetentionBatchCountData {
  subject: RetentionSubjectKey;
  selected: number;
  anonymized: number;
  skipped: number;
  failed: number;
  moreRemaining: boolean;
}

export interface RetentionBatchData {
  id: string;
  kind: "retention" | "erasure";
  /** `interrupted`: an approval stopped mid-execution. Unknown future values render generically. */
  status: "previewed" | "executed" | "refused" | "expired" | "interrupted" | (string & {});
  countryId: string | null;
  categories: RetentionCategoryKey[];
  erasureLookup: "public_reference" | "email" | null;
  reason: string;
  requestedById: string | null;
  approvedById: string | null;
  approvalReason: string | null;
  counts: RetentionBatchCountData[];
  totalSelected: number;
  moreRemaining: boolean;
  previewExpiresAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface RetentionBatchesData {
  purgeEnabled: boolean;
  items: RetentionBatchData[];
}

export function readRetentionPolicies(countryId?: string) {
  const query = countryId ? `?${new URLSearchParams({ countryId }).toString()}` : "";
  return readAdmin<RetentionPoliciesData>(`/admin/retention/policies${query}`, { countryId: countryId ?? null, purgeEnabled: false, items: [], countries: [] });
}

export function readRetentionBatches() {
  return readAdmin<RetentionBatchesData>("/admin/retention/batches", { purgeEnabled: false, items: [] });
}

export interface AdminAiInsight {
  id: string;
  assistType: string;
  status: "queued" | "completed" | "refused" | "failed";
  fallback: boolean;
  outputText: string | null;
  humanValidationStatus: "not_required" | "pending" | "approved" | "rejected";
  refusalReason: string | null;
  disclaimer: string;
  assistanceLabel: string;
  createdAt: string;
}

export function listAdminAiInsights() {
  return readAdmin<AdminAiInsight[]>("/admin/ai/insights", []);
}

export async function readPartnerIntegrations(): Promise<AdminApiState<PartnerIntegrationsData>> {
  const [apiKeys, webhookEndpoints, webhookAllowlist, webhookDeliveries] = await Promise.all([
    readAdmin<PartnerIntegrationsData["apiKeys"]>("/admin/partner-integrations/api-keys", emptyPartnerIntegrations.apiKeys),
    readAdmin<PartnerIntegrationsData["webhookEndpoints"]>("/admin/partner-integrations/webhook-endpoints", emptyPartnerIntegrations.webhookEndpoints),
    readAdmin<PartnerIntegrationsData["webhookAllowlist"]>("/admin/partner-integrations/webhook-allowlist", emptyPartnerIntegrations.webhookAllowlist),
    readAdmin<PartnerIntegrationsData["webhookDeliveries"]>("/admin/partner-integrations/webhook-deliveries", emptyPartnerIntegrations.webhookDeliveries)
  ]);
  const status = [apiKeys.status, webhookEndpoints.status, webhookAllowlist.status, webhookDeliveries.status].find((item) => item !== "success") ?? "success";
  const error = apiKeys.error ?? webhookEndpoints.error ?? webhookAllowlist.error ?? webhookDeliveries.error;
  const unauthenticated = apiKeys.unauthenticated || webhookEndpoints.unauthenticated || webhookAllowlist.unauthenticated || webhookDeliveries.unauthenticated;
  const forbidden = apiKeys.forbidden || webhookEndpoints.forbidden || webhookAllowlist.forbidden || webhookDeliveries.forbidden;
  return {
    status,
    data: { apiKeys: apiKeys.data, webhookEndpoints: webhookEndpoints.data, webhookAllowlist: webhookAllowlist.data, webhookDeliveries: webhookDeliveries.data },
    ...(unauthenticated ? { unauthenticated } : {}),
    ...(forbidden ? { forbidden } : {}),
    ...(error ? { error } : {})
  };
}

export type RoutingRuleMode = "first_eligible" | "round_robin" | "priority" | "capacity" | "performance" | "exclusive" | "manual" | "multi_send";

export interface RoutingRuleData {
  id: string;
  countryId: string;
  productId: string | null;
  mode: RoutingRuleMode;
  /** Spec 042: recipient cap used by the `multi_send` mode. */
  maxRecipients: number;
  status: "active" | "disabled";
  priorities: Array<{ partnerTenantId: string; priority: number }>;
  exclusivePartnerTenantId: string | null;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface RoutingRulesData {
  generatedAt: string;
  items: RoutingRuleData[];
  total: number;
}

export interface PendingManualQuoteData {
  quoteRequestId: string;
  publicReference: string;
  countryId: string;
  countryCode: string;
  productId: string;
  productKey: string;
  createdAt: string;
  candidates: Array<{ partnerTenantId: string; legalName: string; plan: "starter" | "pro" | "enterprise"; eligible: boolean; reasons: string[] }>;
}

export interface PendingManualQueueData {
  generatedAt: string;
  items: PendingManualQuoteData[];
  total: number;
}

const emptyRoutingRules: RoutingRulesData = { generatedAt: new Date(0).toISOString(), items: [], total: 0 };
const emptyPendingQueue: PendingManualQueueData = { generatedAt: new Date(0).toISOString(), items: [], total: 0 };

export interface QuoteFormDefinitionData {
  id: string;
  countryId: string;
  productId: string;
  language: string;
  version: string;
  status: "draft" | "published" | "suspended" | "retired";
  consentTextId: string;
  fieldCount: number;
  dataMinimizationNotes?: string;
  publishedAt?: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteFormFieldInput {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox" | "date";
  required: boolean;
  sensitivity: "public" | "personal" | "sensitive";
  options?: string[];
}

export function readQuoteFormDefinitions() {
  return readAdmin<QuoteFormDefinitionData[]>("/admin/quote-form-definitions", []);
}

export function createQuoteFormDefinition(input: {
  countryId: string;
  productId: string;
  language: string;
  version: string;
  fields: QuoteFormFieldInput[];
  consentTextId: string;
  dataMinimizationNotes?: string;
  reason: string;
}) {
  return writeAdmin<QuoteFormDefinitionData>("/admin/quote-form-definitions", "POST", { ...input, status: "draft" });
}

export function publishQuoteFormDefinition(formId: string, reason: string) {
  return writeAdmin<QuoteFormDefinitionData>(`/admin/quote-form-definitions/${formId}/publish`, "POST", { reason });
}

export function retireQuoteFormDefinition(formId: string, reason: string) {
  return writeAdmin<QuoteFormDefinitionData>(`/admin/quote-form-definitions/${formId}/retire`, "POST", { reason });
}

export function readRoutingRules() {
  return readAdmin<RoutingRulesData>("/admin/routing-rules", emptyRoutingRules);
}

export function readRoutingPendingQueue() {
  return readAdmin<PendingManualQueueData>("/admin/routing/pending", emptyPendingQueue);
}

export function createRoutingRule(input: {
  countryId: string;
  productId?: string | null;
  mode: RoutingRuleMode;
  priorities?: Array<{ partnerTenantId: string; priority: number }>;
  exclusivePartnerTenantId?: string | null;
  description?: string;
  reason: string;
}) {
  return writeAdmin<RoutingRuleData>("/admin/routing-rules", "POST", input);
}

export function updateRoutingRule(ruleId: string, input: {
  mode?: RoutingRuleMode;
  status?: "active" | "disabled";
  priorities?: Array<{ partnerTenantId: string; priority: number }>;
  exclusivePartnerTenantId?: string | null;
  description?: string | null;
  reason: string;
}) {
  return writeAdmin<RoutingRuleData>(`/admin/routing-rules/${encodeURIComponent(ruleId)}`, "PATCH", input);
}

export function assignPendingQuote(quoteRequestId: string, input: { partnerTenantId: string; reason: string }) {
  return writeAdmin<{ quoteRequestId: string; assignmentId: string; partnerTenantId: string; status: "routed" }>(`/admin/routing/pending/${encodeURIComponent(quoteRequestId)}/assign`, "POST", input);
}

export function reassignLead(assignmentId: string, input: { partnerTenantId: string; reason: string }) {
  return writeAdmin<{ assignmentId: string; partnerTenantId: string; previousPartnerTenantId: string; status: string }>(`/admin/lead-assignments/${encodeURIComponent(assignmentId)}/reassign`, "POST", input);
}

export type ScoringCriterionKey = "guaranteeLevel" | "price" | "deductible" | "processingSpeed" | "paymentFlexibility" | "informationQuality" | "userPreferences";
export type ScoringWeightsData = Record<ScoringCriterionKey, number>;

export interface ScoringRuleData {
  id: string;
  countryId: string | null;
  productId: string | null;
  weights: ScoringWeightsData;
  status: "active" | "disabled";
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface ScoringRulesData {
  generatedAt: string;
  defaults: ScoringWeightsData;
  items: ScoringRuleData[];
  total: number;
}

export interface AdminOfferData {
  id: string;
  countryId: string;
  productId: string;
  partnerTenantId?: string;
  name: string;
  status: string;
  validationStatus: string;
  isSponsored: boolean;
  guaranteeLevel?: number;
  insurerName?: string;
  validUntil: string;
  updatedAt: string;
}

const emptyScoringRules: ScoringRulesData = {
  generatedAt: new Date(0).toISOString(),
  defaults: { guaranteeLevel: 30, price: 25, deductible: 15, processingSpeed: 10, paymentFlexibility: 10, informationQuality: 5, userPreferences: 5 },
  items: [],
  total: 0
};

export function readScoringRules() {
  return readAdmin<ScoringRulesData>("/admin/scoring-rules", emptyScoringRules);
}

export function readAdminOffers() {
  return readAdmin<AdminOfferData[]>("/admin/offers", []);
}

export function createScoringRule(input: { countryId?: string | null; productId?: string | null; weights: ScoringWeightsData; description?: string; reason: string }) {
  return writeAdmin<ScoringRuleData>("/admin/scoring-rules", "POST", input);
}

export function updateScoringRule(ruleId: string, input: { weights?: ScoringWeightsData; status?: "active" | "disabled"; description?: string | null; reason: string }) {
  return writeAdmin<ScoringRuleData>(`/admin/scoring-rules/${encodeURIComponent(ruleId)}`, "PATCH", input);
}

export function validateAdminOffer(offerId: string, input: { validationStatus: "validated" | "rejected"; reason: string }) {
  return writeAdmin<AdminOfferData>(`/admin/offers/${encodeURIComponent(offerId)}/validate`, "POST", input);
}

export function suspendAdminOffer(offerId: string, reason: string) {
  return writeAdmin<AdminOfferData>(`/admin/offers/${encodeURIComponent(offerId)}/suspend`, "POST", { reason });
}

export interface AdminQuoteDocumentData {
  id: string;
  quoteRequestId: string;
  label: string;
  documentKind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  scanStatus: "pending" | "clean" | "infected" | "failed";
  scanEngine: string | null;
  scanSignature: string | null;
  status: "uploaded" | "available" | "quarantined" | "removed";
  sharedWithBroker: boolean;
  retentionUntil: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuoteDocumentsData {
  generatedAt: string;
  quoteRequestId: string;
  items: AdminQuoteDocumentData[];
  total: number;
}

export function readAdminQuoteDocuments(quoteRequestId: string) {
  return readAdmin<AdminQuoteDocumentsData>(`/admin/quote-requests/${encodeURIComponent(quoteRequestId)}/documents`, {
    generatedAt: new Date(0).toISOString(),
    quoteRequestId,
    items: [],
    total: 0
  });
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
