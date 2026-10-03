import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import type {
  AdminCountryProductLinkView,
  AdminCountryView,
  AdminProductView,
  AdminRegulatoryRegimeView
} from "../../../../packages/shared/contracts/catalog.contracts";
import type { AdminConsentTextView, ConsentTextTemplate } from "../../../../packages/shared/contracts/compliance.contracts";
import type {
  AdminOfferContent,
  AdminOfferDetailView,
  AdminOfferListItem,
  OfferBlocker,
  OfferEffectiveStatus,
  OfferType,
  OfferVersionDiffEntry,
  OfferVersionView
} from "../../../../packages/shared/contracts/offer-content";
import type {
  AdminAccreditationDocumentView,
  AdminPartnerContractView,
  AdminPartnerDetailView,
  AdminPartnerLicenseView,
  AdminPartnerUserView,
  AdminPartnerView,
  AccreditationDocumentType,
  PartnerCapacityStatus,
  PartnerEffectiveStatus,
  PartnerPlan,
  PartnerStatus,
  PartnerUserRole
} from "../../../../packages/shared/contracts/partner.contracts";
import type {
  AdminPartnerApplication,
  PartnerApplicationConversionResult,
  PartnerApplicationRejectionReasonCode,
  PartnerApplicationStatus
} from "../../../../packages/shared/contracts/partner-application.contracts";
import type { PartnerChangeRequestView } from "../../../../packages/shared/contracts/broker-self-service.contracts";

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
  /** Spec 050 FR-019: a more recent published version of the referenced consent text exists. */
  consentSuperseded?: boolean;
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

export function readQuoteFormDefinitions(filters: { language?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  const query = params.toString();
  return readAdmin<QuoteFormDefinitionData[]>(`/admin/quote-form-definitions${query ? `?${query}` : ""}`, []);
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

/** Spec 052: `GET /admin/offers` serves `AdminOfferListItem` (published + pending versions). */
export type AdminOfferData = AdminOfferListItem;

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

/** Scoring page (legacy body `{ validationStatus, reason }`, still accepted by the API, spec 052 R6). */
export function validateAdminOffer(offerId: string, input: { validationStatus: "validated" | "rejected"; reason: string }) {
  return writeAdmin<AdminOfferDetailView>(`/admin/offers/${encodeURIComponent(offerId)}/validate`, "POST", input);
}

export function suspendAdminOffer(offerId: string, reason: string) {
  return writeAdmin<AdminOfferDetailView>(`/admin/offers/${encodeURIComponent(offerId)}/suspend`, "POST", { reason });
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
  // Spec 051: a 422 `PARTNER_USER_INVALID` / `PARTNER_RETIRED` refusal keeps its code for the form.
  return writeAdminResult<AdminUserCreateResult>("/admin/users", "POST", input);
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

/* ---------------------------------------------------------------------------------------------
 * Spec 050: catalogue, regimes, consent texts and global feature flags.
 *
 * The catalogue mutations go through `writeAdminResult`, which never throws on an API refusal: an
 * activation refused by the checklist (422 `ACTIVATION_BLOCKED`) or a consent text refused at
 * publication (422 `CONSENT_TEXT_INVALID`) carries the list of failing controls in `blockers`, and
 * the screen has to show that list instead of a bare status code. `writeAdmin` above is unchanged
 * for its existing callers.
 * ------------------------------------------------------------------------------------------- */

export interface AdminWriteBlocker {
  section: string;
  control: string;
  label: string;
  evidence: string;
}

export interface AdminWriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
  blockers: AdminWriteBlocker[];
  /** Spec 052: offer refusals (422 `OFFER_INCOMPLETE`, `OFFER_VALIDATION_BLOCKED`, `OFFER_SCOPE_NOT_COVERED`) carry `{ code, field? }`. */
  offerBlockers?: OfferBlocker[];
  availableLanguages: string[];
}

function toOfferBlockers(value: unknown): OfferBlocker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.code !== "string") return [];
    return [{ code: record.code, ...(typeof record.field === "string" ? { field: record.field } : {}) }];
  });
}

function toBlockers(value: unknown): AdminWriteBlocker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
    return [{ section: text("section"), control: text("control"), label: text("label") || text("control"), evidence: text("evidence") }];
  });
}

async function writeAdminResult<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<AdminWriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", blockers: [], availableLanguages: [] };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return await toAdminWriteResult<T>(response);
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", blockers: [], availableLanguages: [] };
  }
}

async function toAdminWriteResult<T>(response: Response): Promise<AdminWriteResult<T>> {
  const payload = await response.json().catch(() => undefined) as unknown;
  if (response.ok) return { ok: true, status: response.status, data: payload as T, blockers: [], availableLanguages: [] };
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    ok: false,
    status: response.status,
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    blockers: toBlockers(record.blockers),
    ...(toOfferBlockers(record.blockers).length > 0 ? { offerBlockers: toOfferBlockers(record.blockers) } : {}),
    availableLanguages: Array.isArray(record.availableLanguages)
      ? record.availableLanguages.filter((value): value is string => typeof value === "string")
      : []
  };
}

/** Mirrors `AdminCountryProductLinkView` (packages/shared/contracts/catalog.contracts.ts). */
export type AdminCountryProductLinkData = AdminCountryProductLinkView;
export type AdminCountryData = AdminCountryView;
export type AdminProductData = AdminProductView;
export type AdminRegulatoryRegimeData = AdminRegulatoryRegimeView;
export type AdminConsentTextData = AdminConsentTextView;
export type ConsentTextTemplateData = ConsentTextTemplate;

export interface AdminCountryWriteInput {
  name?: string;
  currency?: string;
  languages?: string[];
  timezone?: string;
  regulatoryFamily?: AdminCountryView["regulatoryFamily"];
  regulatoryRegimeId?: string;
  phoneDialCode?: string;
  phoneNationalLengths?: number[];
}

export function readAdminCountries() {
  return readAdmin<AdminCountryView[]>("/admin/countries", []);
}

export function readAdminCountry(countryId: string) {
  return readAdmin<AdminCountryView | null>(`/admin/countries/${encodeURIComponent(countryId)}`, null);
}

export function createAdminCountry(input: AdminCountryWriteInput & { isoCode: string; reason: string }) {
  return writeAdminResult<AdminCountryView>("/admin/countries", "POST", input);
}

export function updateAdminCountry(countryId: string, input: AdminCountryWriteInput & { expectedUpdatedAt?: string; reason: string }) {
  return writeAdminResult<AdminCountryView>(`/admin/countries/${encodeURIComponent(countryId)}`, "PATCH", input);
}

export function changeAdminCountryStatus(countryId: string, input: { status: string; reason: string }) {
  return writeAdminResult<AdminCountryView>(`/admin/countries/${encodeURIComponent(countryId)}/status`, "POST", input);
}

export function toggleAdminCountryFlag(countryId: string, input: { key: string; value: boolean; reason: string }) {
  return writeAdminResult<AdminCountryView>(`/admin/countries/${encodeURIComponent(countryId)}/flags`, "POST", input);
}

export function readAdminCountryLinks(countryId: string) {
  return readAdmin<AdminCountryProductLinkView[]>(`/admin/countries/${encodeURIComponent(countryId)}/products`, []);
}

export function createAdminCountryLink(countryId: string, input: { productId: string; reason: string }) {
  return writeAdminResult<AdminCountryProductLinkView>(`/admin/countries/${encodeURIComponent(countryId)}/products`, "POST", input);
}

export function retireAdminCountryLink(countryId: string, productId: string, reason: string) {
  return writeAdminResult<AdminCountryProductLinkView>(
    `/admin/countries/${encodeURIComponent(countryId)}/products/${encodeURIComponent(productId)}/retire`,
    "POST",
    { reason }
  );
}

export function toggleAdminCountryLinkFlag(countryId: string, productId: string, input: { key: string; value: boolean; reason: string }) {
  return writeAdminResult<AdminCountryProductLinkView>(
    `/admin/countries/${encodeURIComponent(countryId)}/products/${encodeURIComponent(productId)}/flags`,
    "POST",
    input
  );
}

export interface AdminProductWriteInput {
  name?: string;
  description?: string;
  sensitivity?: AdminProductView["sensitivity"];
  requiresDocuments?: boolean;
  requiresManualReview?: boolean;
}

export function readAdminProducts(filters: { countryId?: string } = {}) {
  const query = filters.countryId ? `?countryId=${encodeURIComponent(filters.countryId)}` : "";
  return readAdmin<AdminProductView[]>(`/admin/products${query}`, []);
}

export function readAdminProduct(productId: string) {
  return readAdmin<AdminProductView | null>(`/admin/products/${encodeURIComponent(productId)}`, null);
}

export function createAdminProduct(input: AdminProductWriteInput & { key: string; name: string; reason: string }) {
  return writeAdminResult<AdminProductView>("/admin/products", "POST", input);
}

export function updateAdminProduct(productId: string, input: AdminProductWriteInput & { expectedUpdatedAt?: string; reason: string }) {
  return writeAdminResult<AdminProductView>(`/admin/products/${encodeURIComponent(productId)}`, "PATCH", input);
}

export function toggleAdminProductFlag(productId: string, input: { key: string; value: boolean; reason: string }) {
  return writeAdminResult<AdminProductView>(`/admin/products/${encodeURIComponent(productId)}/flags`, "POST", input);
}

export interface RegulatoryRegimeWriteInput {
  name?: string;
  description?: string;
  retentionOverrideYears?: number;
  requiresManualActivationReview?: boolean;
  status?: "draft" | "active" | "suspended";
}

export function readRegulatoryRegimes() {
  return readAdmin<AdminRegulatoryRegimeView[]>("/admin/regulatory-regimes", []);
}

export function createRegulatoryRegime(input: RegulatoryRegimeWriteInput & { key: string; name: string; reason: string }) {
  return writeAdminResult<AdminRegulatoryRegimeView>("/admin/regulatory-regimes", "POST", input);
}

export function updateRegulatoryRegime(regimeId: string, input: RegulatoryRegimeWriteInput & { expectedUpdatedAt?: string; reason: string }) {
  return writeAdminResult<AdminRegulatoryRegimeView>(`/admin/regulatory-regimes/${encodeURIComponent(regimeId)}`, "PATCH", input);
}

export function retireRegulatoryRegime(regimeId: string, reason: string) {
  return writeAdminResult<AdminRegulatoryRegimeView>(`/admin/regulatory-regimes/${encodeURIComponent(regimeId)}/retire`, "POST", { reason });
}

export interface AdminConsentTextFilters {
  countryId?: string;
  productId?: string;
  purpose?: string;
  language?: string;
  status?: string;
}

export function readAdminConsentTexts(filters: AdminConsentTextFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return readAdmin<AdminConsentTextView[]>(`/admin/consent-texts${query ? `?${query}` : ""}`, []);
}

export function readConsentTextTemplates() {
  return readAdmin<ConsentTextTemplate[]>("/admin/consent-texts/templates", []);
}

export function readAdminConsentText(consentTextId: string, options: { preview?: boolean } = {}) {
  const query = options.preview ? "?preview=1" : "";
  return readAdmin<AdminConsentTextView | null>(`/admin/consent-texts/${encodeURIComponent(consentTextId)}${query}`, null);
}

export function createAdminConsentText(input: {
  purpose: AdminConsentTextView["purpose"];
  countryId: string;
  productId?: string;
  channel: AdminConsentTextView["channel"];
  recipientCategory: string;
  language: string;
  version: string;
  content: string;
  reason: string;
}) {
  return writeAdminResult<AdminConsentTextView>("/admin/consent-texts", "POST", input);
}

export function publishAdminConsentText(consentTextId: string, reason: string) {
  return writeAdminResult<AdminConsentTextView>(`/admin/consent-texts/${encodeURIComponent(consentTextId)}/publish`, "POST", { reason });
}

export function retireAdminConsentText(consentTextId: string, reason: string) {
  return writeAdminResult<AdminConsentTextView>(`/admin/consent-texts/${encodeURIComponent(consentTextId)}/retire`, "POST", { reason });
}

/** A feature flag row as listed by `GET /admin/feature-flags` (global and scoped rows). */
export interface AdminFeatureFlagData {
  id: string;
  key: string;
  scopeType: "global" | "country" | "product" | "partner" | "plan" | "module" | "ai";
  scopeId?: string | null;
  value: boolean;
  reason?: string;
  changedAt?: string;
  changedById?: string | null;
}

export function readAdminFeatureFlags() {
  return readAdmin<AdminFeatureFlagData[]>("/admin/feature-flags", []);
}

export function updateAdminFeatureFlag(flagId: string, input: { value: boolean; reason: string }) {
  return writeAdminResult<AdminFeatureFlagData>(`/admin/feature-flags/${encodeURIComponent(flagId)}`, "PATCH", input);
}

/* ---------------------------------------------------------------------------------------------
 * Spec 051: partner onboarding (directory, partner page, licences, documents, contract, coverage,
 * users) and broker applications. Every mutation goes through `writeAdminResult`, so a 422
 * `PARTNER_ACTIVATION_BLOCKED` keeps its `blockers` and every refusal keeps its code. The session
 * token never leaves the server: the multipart upload and the document download below run in a
 * route handler or a server action of the admin app, never in the browser.
 * ------------------------------------------------------------------------------------------- */

export type AdminPartnerData = AdminPartnerView;
export type AdminPartnerDetailData = AdminPartnerDetailView;
export type AdminPartnerLicenseData = AdminPartnerLicenseView;
export type AdminPartnerDocumentData = AdminAccreditationDocumentView;
export type AdminPartnerContractData = AdminPartnerContractView;
export type AdminPartnerUserData = AdminPartnerUserView;
export type AdminPartnerApplicationData = AdminPartnerApplication;
export type { AccreditationDocumentType, PartnerCapacityStatus, PartnerEffectiveStatus, PartnerPlan, PartnerStatus, PartnerUserRole };

export interface AdminPartnerListFilters {
  status?: PartnerEffectiveStatus | undefined;
  countryId?: string | undefined;
  plan?: PartnerPlan | undefined;
  licenseExpiringWithinDays?: number | undefined;
}

export function readAdminPartners(filters: AdminPartnerListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.countryId) params.set("countryId", filters.countryId);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.licenseExpiringWithinDays) params.set("licenseExpiringWithinDays", String(filters.licenseExpiringWithinDays));
  const query = params.toString();
  return readAdmin<AdminPartnerView[]>(`/admin/partners${query ? `?${query}` : ""}`, []);
}

export function readAdminPartner(partnerId: string) {
  return readAdmin<AdminPartnerDetailView | null>(`/admin/partners/${encodeURIComponent(partnerId)}`, null);
}

export interface AdminPartnerWriteInput {
  legalName?: string;
  tradeName?: string;
  countryId?: string;
  city?: string;
  registrationNumber?: string;
  primaryEmail?: string;
  primaryWhatsApp?: string;
  adminContactName?: string;
  adminContactEmail?: string;
  adminContactPhone?: string;
  commercialContactName?: string;
  commercialContactEmail?: string;
  commercialContactPhone?: string;
  partnerInsurers?: string[];
  plan?: PartnerPlan;
  quotaMonthlyLeads?: number;
  capacityStatus?: PartnerCapacityStatus;
  slaTargetMinutes?: number;
}

function partnerPath(partnerId: string, suffix = ""): string {
  return `/admin/partners/${encodeURIComponent(partnerId)}${suffix}`;
}

export function createAdminPartner(input: AdminPartnerWriteInput & { reason: string }) {
  return writeAdminResult<AdminPartnerDetailView>("/admin/partners", "POST", input);
}

export function updateAdminPartner(partnerId: string, input: AdminPartnerWriteInput & { expectedUpdatedAt?: string; reason: string }) {
  return writeAdminResult<AdminPartnerDetailView>(partnerPath(partnerId), "PATCH", input);
}

export function changeAdminPartnerStatus(partnerId: string, input: { status: PartnerStatus; reason: string }) {
  return writeAdminResult<AdminPartnerDetailView>(partnerPath(partnerId, "/status"), "POST", input);
}

export function authorizeAdminPartnerCountry(partnerId: string, input: { countryId: string; reason: string }) {
  return writeAdminResult<unknown>(partnerPath(partnerId, "/authorizations/countries"), "POST", input);
}

export function withdrawAdminPartnerCountry(partnerId: string, countryId: string, reason: string) {
  return writeAdminResult<unknown>(partnerPath(partnerId, `/authorizations/countries/${encodeURIComponent(countryId)}/withdraw`), "POST", { reason });
}

export function authorizeAdminPartnerProduct(partnerId: string, input: { productId: string; reason: string }) {
  return writeAdminResult<unknown>(partnerPath(partnerId, "/authorizations/products"), "POST", input);
}

export function withdrawAdminPartnerProduct(partnerId: string, productId: string, reason: string) {
  return writeAdminResult<unknown>(partnerPath(partnerId, `/authorizations/products/${encodeURIComponent(productId)}/withdraw`), "POST", { reason });
}

export interface AdminPartnerLicenseWriteInput {
  licenseNumber: string;
  issuingAuthority: string;
  countryId?: string;
  productIds: string[];
  effectiveDate: string;
  expirationDate: string;
  reason: string;
}

export function createAdminPartnerLicense(partnerId: string, input: AdminPartnerLicenseWriteInput & { countryId: string }) {
  return writeAdminResult<AdminPartnerLicenseView>(partnerPath(partnerId, "/licenses"), "POST", input);
}

export function runAdminPartnerLicenseAction(partnerId: string, licenseId: string, action: "validate" | "suspend" | "revoke", reason: string) {
  return writeAdminResult<AdminPartnerLicenseView>(partnerPath(partnerId, `/licenses/${encodeURIComponent(licenseId)}/${action}`), "POST", { reason });
}

export function renewAdminPartnerLicense(partnerId: string, licenseId: string, input: AdminPartnerLicenseWriteInput) {
  return writeAdminResult<AdminPartnerLicenseView>(partnerPath(partnerId, `/licenses/${encodeURIComponent(licenseId)}/renew`), "POST", input);
}

/**
 * Multipart upload (`file`, `documentType`, `licenseId?`, `expirationDate?`, `reason`) forwarded
 * to `POST /admin/partners/:id/documents` with the session token. Called from the admin route
 * handler only; the browser never sees the token.
 */
export async function uploadAdminPartnerDocument(partnerId: string, form: FormData): Promise<AdminWriteResult<AdminAccreditationDocumentView>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", blockers: [], availableLanguages: [] };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${partnerPath(partnerId, "/documents")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store"
    });
    return await toAdminWriteResult<AdminAccreditationDocumentView>(response);
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", blockers: [], availableLanguages: [] };
  }
}

/** Audited download (`GET /admin/partners/:id/documents/:documentId/file`); the caller streams the bytes. */
export async function fetchAdminPartnerDocumentFile(partnerId: string, documentId: string): Promise<Response> {
  const token = await getBackOfficeToken();
  if (!token) return new Response(null, { status: 401 });
  return fetch(`${backOfficeApiBaseUrl()}${partnerPath(partnerId, `/documents/${encodeURIComponent(documentId)}/file`)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
}

export function reviewAdminPartnerDocument(partnerId: string, documentId: string, input: { decision: "accepted" | "rejected"; reason: string }) {
  return writeAdminResult<AdminAccreditationDocumentView>(partnerPath(partnerId, `/documents/${encodeURIComponent(documentId)}/review`), "POST", input);
}

export function recordAdminPartnerContract(partnerId: string, input: { version: string; signedAt: string; signatoryName: string; documentId: string; reason: string }) {
  return writeAdminResult<AdminPartnerContractView>(partnerPath(partnerId, "/contracts"), "POST", input);
}

export interface AdminPartnerUserInviteResult {
  user: AdminPartnerUserView;
  emailStatus: "not_configured" | "sent" | "failed";
  token?: string;
  expiresAt: string;
}

export function inviteAdminPartnerUser(partnerId: string, input: { email: string; displayName: string; role: PartnerUserRole; reason: string }) {
  return writeAdminResult<AdminPartnerUserInviteResult>(partnerPath(partnerId, "/users"), "POST", input);
}

export function readAdminPartnerApplications(filters: { status?: PartnerApplicationStatus | undefined; countryId?: string | undefined } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.countryId) params.set("countryId", filters.countryId);
  const query = params.toString();
  return readAdmin<AdminPartnerApplication[]>(`/admin/partners/applications${query ? `?${query}` : ""}`, []);
}

export function readAdminPartnerApplication(applicationId: string) {
  return readAdmin<AdminPartnerApplication | null>(`/admin/partners/applications/${encodeURIComponent(applicationId)}`, null);
}

function applicationPath(applicationId: string, action: "review" | "convert" | "reject"): string {
  return `/admin/partners/applications/${encodeURIComponent(applicationId)}/${action}`;
}

export function reviewAdminPartnerApplication(applicationId: string, reason: string) {
  return writeAdminResult<AdminPartnerApplication>(applicationPath(applicationId, "review"), "POST", { reason });
}

export function convertAdminPartnerApplication(applicationId: string, reason: string) {
  return writeAdminResult<PartnerApplicationConversionResult>(applicationPath(applicationId, "convert"), "POST", { reason });
}

export function rejectAdminPartnerApplication(applicationId: string, input: { rejectionReasonCode: PartnerApplicationRejectionReasonCode; reason: string }) {
  return writeAdminResult<AdminPartnerApplication>(applicationPath(applicationId, "reject"), "POST", input);
}

/* ---------------------------------------------------------------------------------------------
 * Spec 053: broker requests (identity changes and coverage extensions) shown on the partner page
 * (« Demandes du courtier ») and decided by the admin; the API applies an accepted request through
 * the spec 051 partner rules and keeps it pending when one of them refuses.
 * ------------------------------------------------------------------------------------------- */

export type { PartnerChangeRequestView };

export function readAdminPartnerRequests(partnerTenantId: string) {
  return readAdmin<PartnerChangeRequestView[]>(`/admin/partner-requests?partnerTenantId=${encodeURIComponent(partnerTenantId)}`, []);
}

export function decideAdminPartnerRequest(requestId: string, input: { decision: "accepted" | "rejected"; reason: string }) {
  return writeAdminResult<PartnerChangeRequestView>(`/admin/partner-requests/${encodeURIComponent(requestId)}/decision`, "POST", input);
}


/* ---------------------------------------------------------------------------------------------
 * Spec 052: offers (list with filters and validation queue, detail with versions and diff,
 * creation and versioned update for a partner, submission, and the compliance decisions). Every
 * mutation goes through `writeAdminResult`, so a 422 keeps its `{ code, field }` blockers.
 * ------------------------------------------------------------------------------------------- */

export type { AdminOfferContent, AdminOfferDetailView, AdminOfferListItem, OfferBlocker, OfferEffectiveStatus, OfferType, OfferVersionView };
export type OfferVersionDiffEntryData = OfferVersionDiffEntry;

export interface AdminOfferListFilters {
  countryId?: string | undefined;
  productId?: string | undefined;
  partnerTenantId?: string | undefined;
  status?: OfferEffectiveStatus | undefined;
  sponsored?: boolean | undefined;
  expiringWithinDays?: number | undefined;
  queue?: "submitted" | undefined;
}

export function readAdminOfferList(filters: AdminOfferListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.countryId) params.set("countryId", filters.countryId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.partnerTenantId) params.set("partnerTenantId", filters.partnerTenantId);
  if (filters.status) params.set("status", filters.status);
  if (filters.sponsored !== undefined) params.set("sponsored", String(filters.sponsored));
  if (filters.expiringWithinDays !== undefined) params.set("expiringWithinDays", String(filters.expiringWithinDays));
  if (filters.queue) params.set("queue", filters.queue);
  const query = params.toString();
  return readAdmin<AdminOfferListItem[]>(`/admin/offers${query ? `?${query}` : ""}`, []);
}

export function readAdminOffer(offerId: string) {
  return readAdmin<AdminOfferDetailView | null>(offerPath(offerId), null);
}

/** Body of `POST /admin/offers` and `PATCH /admin/offers/:id` (`adminOfferUpsertSchema`). */
export type AdminOfferWriteInput = Partial<AdminOfferContent> & {
  countryId: string;
  productId: string;
  partnerTenantId?: string;
  offerType?: OfferType;
  expectedUpdatedAt?: string;
  reason: string;
};

function offerPath(offerId: string, suffix = ""): string {
  return `/admin/offers/${encodeURIComponent(offerId)}${suffix}`;
}

export function createAdminOffer(input: AdminOfferWriteInput) {
  return writeAdminResult<AdminOfferDetailView>("/admin/offers", "POST", input);
}

export function updateAdminOffer(offerId: string, input: AdminOfferWriteInput) {
  return writeAdminResult<AdminOfferDetailView>(offerPath(offerId), "PATCH", input);
}

export function runAdminOfferDecision(offerId: string, action: "submit" | "validate" | "reject" | "suspend", reason: string) {
  return writeAdminResult<AdminOfferDetailView>(offerPath(offerId, `/${action}`), "POST", { reason });
}
