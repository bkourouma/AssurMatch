import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

export const BROKER_AUTH_SOURCE_MARKER = "broker-auth-client:014";

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

export interface BrokerApiState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden";
  data: T;
  error?: string;
  unauthenticated?: boolean;
  forbidden?: boolean;
  mfaRequired?: boolean;
}

async function readBroker<T>(path: string, fallback: T): Promise<BrokerApiState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_required" };

  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, forbidden: true, mfaRequired: true, error: "access_denied" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function listStarterLeads() {
  return readBroker<{ items: Array<Record<string, unknown>> }>("/broker/starter/leads", { items: [] });
}

export function listCrmLeads() {
  return readBroker<{ items: Array<Record<string, unknown>> }>("/broker/crm/leads", { items: [] });
}

export function readCrmDashboard() {
  return readBroker<Record<string, unknown>>("/broker/crm/dashboard", {});
}

export interface BrokerDashboardStarter {
  received: number;
  accepted: number;
  rejected: number;
  disputed: number;
  pendingAction: number;
  averageFirstActionMinutes: number | null;
  byProduct: Array<{ productKey: string; total: number }>;
  byCountry: Array<{ countryCode: string; total: number }>;
}

export interface BrokerDashboardCrm {
  pipeline: Array<{ status: string; total: number }>;
  byAssignedAdvisor: Array<{ advisorId: string; total: number }>;
  conversionByProduct: Array<{ productKey: string; received: number; accepted: number; rate: number }>;
  averageReceptionToFirstActivityMinutes: number | null;
  upcomingTasks: number;
  upcomingReminders: number;
}

export interface BrokerDashboardLicenseAlert {
  licenseId: string;
  partnerTenantId: string;
  countryCode: string;
  productKey: string | null;
  status: "expired" | "expiring_soon";
  expiresAt: string;
}

export interface BrokerDashboardData {
  plan: "starter" | "pro" | "enterprise";
  window: { from: string; to: string };
  starter: BrokerDashboardStarter;
  crm?: BrokerDashboardCrm;
  licenseAlerts: BrokerDashboardLicenseAlert[];
}

export interface BrokerAIAssistanceData {
  generatedAt: string;
  surface: "broker_crm";
  enabled: boolean;
  modelCall: boolean;
  provider?: string;
  humanValidationRequired: true;
  auditPolicy: "metadata_only";
  availableAssistTypes: string[];
  flags: Array<{ key: string; value: boolean; required: boolean }>;
  message: string;
}

const emptyDashboard: BrokerDashboardData = {
  plan: "starter",
  window: { from: "", to: "" },
  starter: { received: 0, accepted: 0, rejected: 0, disputed: 0, pendingAction: 0, averageFirstActionMinutes: null, byProduct: [], byCountry: [] },
  licenseAlerts: []
};
const emptyAIAssistance: BrokerAIAssistanceData = {
  generatedAt: "",
  surface: "broker_crm",
  enabled: false,
  modelCall: false,
  humanValidationRequired: true,
  auditPolicy: "metadata_only",
  availableAssistTypes: [],
  flags: [],
  message: ""
};

export function readBrokerDashboard() {
  return readBroker<BrokerDashboardData>("/broker/dashboard", emptyDashboard);
}

export interface BrokerCrmLeadDetailData {
  leadAssignmentId: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  status: string;
  assignedAt: string;
  /** Spec 042: a shared lead is billed at a reduced price; co-recipient identities stay hidden. */
  isShared?: boolean;
  recipientCount?: number;
  urgency: string;
  source: string;
  prospectName?: string;
  emailMasked?: string;
  phoneMasked?: string;
  answers: Record<string, unknown>;
  history: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
}

export interface BrokerAiInteraction {
  id: string;
  assistType: string;
  status: "queued" | "completed" | "refused" | "failed";
  fallback: boolean;
  outputText: string | null;
  outputData: unknown;
  humanValidationStatus: "not_required" | "pending" | "approved" | "rejected";
  refusalReason: string | null;
  disclaimer: string;
  assistanceLabel: string;
  createdAt: string;
}

export interface BrokerAiOptOutData {
  partnerTenantId: string;
  optedOut: boolean;
  updatedAt: string | null;
}

const emptyLeadDetail: BrokerCrmLeadDetailData = {
  leadAssignmentId: "",
  publicReference: "",
  countryCode: "",
  productKey: "",
  status: "nouveau",
  assignedAt: "",
  urgency: "normal",
  source: "quote_request",
  answers: {},
  history: [],
  notes: [],
  tasks: [],
  documents: [],
  proposals: []
};

export function readCrmLeadDetail(leadAssignmentId: string) {
  return readBroker<BrokerCrmLeadDetailData>(`/broker/crm/leads/${encodeURIComponent(leadAssignmentId)}`, emptyLeadDetail);
}

export function listLeadAiInteractions(leadAssignmentId: string) {
  return readBroker<BrokerAiInteraction[]>(`/broker/crm/leads/${encodeURIComponent(leadAssignmentId)}/ai`, []);
}

export interface BrokerBillingStatementData {
  generatedAt: string;
  partnerTenantId: string;
  plan: "starter" | "pro" | "enterprise";
  billingEnabled: boolean;
  paymentsEnabled: false;
  collectionEnabled: false;
  currency: "XOF";
  period: { from: string; to: string };
  leadsReceived: number;
  billableLeadCount: number;
  nonBillableLeadCount: number;
  disputeCreditCount: number;
  packCreditsRemaining: number;
  estimatedAmount: number;
  draft: { reference: string; totalAmount: number; status: string } | null;
  notice: string;
}

const emptyStatement: BrokerBillingStatementData = {
  generatedAt: "",
  partnerTenantId: "",
  plan: "starter",
  billingEnabled: false,
  paymentsEnabled: false,
  collectionEnabled: false,
  currency: "XOF",
  period: { from: "", to: "" },
  leadsReceived: 0,
  billableLeadCount: 0,
  nonBillableLeadCount: 0,
  disputeCreditCount: 0,
  packCreditsRemaining: 0,
  estimatedAmount: 0,
  draft: null,
  notice: ""
};

export interface BrokerInboxNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

export interface BrokerNotificationPreferences {
  scopeId: string;
  email: true;
  inApp: true;
  sms: boolean;
  whatsapp: boolean;
  updatedAt: string | null;
}

export function readBrokerInbox() {
  return readBroker<BrokerInboxNotification[]>("/broker/notifications/inbox", []);
}

export function readBrokerNotificationPreferences() {
  return readBroker<BrokerNotificationPreferences>("/broker/notifications/preferences", { scopeId: "", email: true, inApp: true, sms: false, whatsapp: false, updatedAt: null });
}

/** DASH-B-008: consommation de leads et brouillon du cabinet, sans paiement ni facture emise. */
export function readBrokerBillingStatement() {
  return readBroker<BrokerBillingStatementData>("/broker/billing/statement", emptyStatement);
}

export function readBrokerAiOptOut() {
  return readBroker<BrokerAiOptOutData>("/broker/crm/ai/opt-out", { partnerTenantId: "", optedOut: false, updatedAt: null });
}

export function readBrokerAIAssistance() {
  return readBroker<BrokerAIAssistanceData>("/broker/crm/ai-assistance", emptyAIAssistance);
}

export interface BrokerAgency {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
  status: "active" | "suspended";
  memberCount: number;
}

export interface BrokerCustomRole {
  id: string;
  name: string;
  permissions: string[];
  rejectedPermissions: string[];
}

export interface BrokerSla {
  partnerTenantId: string;
  firstActionTargetMinutes: number;
  windowDays: number;
  leadsMeasured: number;
  leadsWithinTarget: number;
  complianceRate: number;
  averageFirstActionMinutes: number | null;
}

export interface BrokerBrandingData {
  partnerTenantId: string;
  displayLabel: string;
  primaryColor: string;
  platformMention: string;
}

export function readBrokerAgencies() {
  return readBroker<BrokerAgency[]>("/broker/enterprise/agencies", []);
}

export function readBrokerCustomRoles() {
  return readBroker<BrokerCustomRole[]>("/broker/enterprise/roles", []);
}

export function readBrokerSla() {
  return readBroker<BrokerSla>("/broker/enterprise/sla", { partnerTenantId: "", firstActionTargetMinutes: 240, windowDays: 30, leadsMeasured: 0, leadsWithinTarget: 0, complianceRate: 0, averageFirstActionMinutes: null });
}

export function readBrokerBranding() {
  return readBroker<BrokerBrandingData>("/broker/enterprise/branding", { partnerTenantId: "", displayLabel: "Espace courtier", primaryColor: "#1f2937", platformMention: "Plateforme technique AssurMatch" });
}

export interface BrokerAdvisorRow {
  advisorId: string;
  received: number;
  accepted: number;
  won: number;
  lost: number;
  conversionRate: number;
  averageFirstActionMinutes: number | null;
}

export function readBrokerAdvisors() {
  return readBroker<BrokerAdvisorRow[]>("/broker/dashboard/advisors", []);
}

/** DASH-B-006: dashboard with the previous-period comparison section. */
export function readBrokerDashboardWithComparison() {
  return readBroker<BrokerDashboardData & { comparison?: { previous: { received: number; accepted: number; refused: number }; delta: { received: number; accepted: number; refused: number } } }>(
    "/broker/dashboard?compare=previous",
    emptyDashboard
  );
}
