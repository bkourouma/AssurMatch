import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import type { BrokerLeadDisputeView, LeadDisputeWindow } from "../../../../packages/shared/contracts/lead-disputes.contracts";

export const BROKER_AUTH_SOURCE_MARKER = "broker-auth-client:014";

export interface BackOfficeLoginResult {
  status: "success" | "mfa_required" | "activation_required" | "locked" | "suspended" | "validation_error" | "invalid_credentials" | "error";
  accessToken?: string;
  mfaRequired?: boolean;
  /** Spec 063 (FR-A04): the API refused the presented trusted-device token; the app clears its cookie. */
  trustedDeviceRejected?: boolean;
  trustedDeviceUsed?: boolean;
  error?: string;
}

export async function loginBackOffice(email: string, password: string, trustedDeviceToken?: string): Promise<BackOfficeLoginResult> {
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trustedDeviceToken ? { email, password, trustedDeviceToken } : { email, password }),
    cache: "no-store"
  });
  if (response.status === 400 || response.status === 422) return { status: "validation_error", error: `api_${response.status}` };
  if (response.status === 403) return { status: "suspended", error: "account_suspended" };
  if (response.status === 423) return { status: "locked", error: "account_locked" };
  if (response.status === 428) return { status: "activation_required", error: "activation_required" };
  if (response.status === 401) return { status: "invalid_credentials", error: "invalid_credentials" };
  if (!response.ok) return { status: "error", error: `api_${response.status}` };
  const session = await response.json() as { accessToken?: string; mfaRequired?: boolean; trustedDeviceRejected?: boolean; trustedDeviceUsed?: boolean };
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

/** Spec 063: `trustedDevice` is returned once, only when `trustDevice` was requested. */
export interface VerifyMfaResult {
  accessToken?: string;
  mfaRequired?: boolean;
  trustedDevice?: { token: string; expiresAt: string };
}

export async function verifyMfa(
  code: string,
  kind: "totp" | "backup" = "totp",
  options: { trustDevice?: boolean; deviceLabel?: string } = {}
): Promise<VerifyMfaResult> {
  const token = await getBackOfficeToken();
  if (!token) throw new Error("session_required");
  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/mfa/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(options.trustDevice ? { code, kind, trustDevice: true, deviceLabel: options.deviceLabel } : { code, kind }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`api_${response.status}`);
  return response.json() as Promise<VerifyMfaResult>;
}

/** Spec 063 (FR-A06): active trusted devices of the signed-in user (MFA-verified token required). */
export interface TrustedDeviceView {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

export async function listTrustedDevices(): Promise<{ ok: true; devices: TrustedDeviceView[] } | { ok: false; error: string }> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/auth/trusted-devices`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return { ok: false, error: `api_${response.status}` };
    const body = (await response.json()) as TrustedDeviceView[] | { devices?: TrustedDeviceView[] };
    return { ok: true, devices: Array.isArray(body) ? body : body.devices ?? [] };
  } catch {
    return { ok: false, error: "api_unavailable" };
  }
}

export async function revokeTrustedDevices(): Promise<{ ok: true; revoked: number } | { ok: false; error: string }> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/auth/trusted-devices`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) return { ok: false, error: `api_${response.status}` };
    const body = (await response.json()) as { revoked?: number };
    return { ok: true, revoked: typeof body.revoked === "number" ? body.revoked : 0 };
  } catch {
    return { ok: false, error: "api_unavailable" };
  }
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
  /** Spec 062 (E-08): additive, absent until the API sends it. */
  averageFirstVisibleReplyMinutes?: number | null;
  firstVisibleReplyMeasured?: number;
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

/**
 * Spec 063: dispute of a lead as the lead detail payloads carry it. Mirrors `brokerCrmDisputeSchema`
 * (CRM) and the `dispute` object of `brokerStarterLeadDetailSchema` (Starter).
 */
export interface BrokerLeadDisputeData {
  id: string;
  status: "opened" | "under_review" | "accepted" | "rejected";
  reason: string;
  comment?: string;
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
  creditMode?: "draft_invoice" | "credit_note" | "pack_credit" | "none";
  creditPackId?: string;
  creditNoteId?: string;
  creditNoteNumber?: string;
  creditAmount?: number;
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
  /** Champs egalement exposes par brokerCrmLeadDetailSchema, optionnels cote UI. */
  contact?: Record<string, unknown>;
  /** Spec 055 FR-001: coordonnees completes pour le courtier affecte, masquees apres retrait. */
  contactVisibility?: "full" | "masked";
  reminders?: Array<Record<string, unknown>>;
  /** Spec 063 FR-B09: disputes of this lead with their finance decision and credit outcome. */
  disputes?: BrokerLeadDisputeData[];
  /** Spec 063 FR-B01: dispute window (30 days after reception). */
  disputeWindow?: LeadDisputeWindow;
  advisorId?: string;
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

/** DASH-B-008: consommation de leads et brouillon du mois en cours (estimation, sans paiement en ligne). */
export function readBrokerBillingStatement() {
  return readBroker<BrokerBillingStatementData>("/broker/billing/statement", emptyStatement);
}

/** Spec 060: miroir de `issuedInvoiceSchema` (contrat partage) pour la vue courtier. */
export interface BrokerInvoiceData {
  id: string;
  number: string;
  countryCode: string;
  plan: string;
  status: "issued" | "partially_paid" | "paid" | "cancelled";
  currency: "XOF";
  periodFrom: string;
  periodTo: string;
  issuedAt: string;
  dueDate: string;
  subtotalAmount: number;
  vatRatePercent: number;
  vatAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  creditNote: { id: string; number: string; invoiceNumber: string; totalAmount: number; reason: string; issuedAt: string } | null;
}

export interface BrokerAccountData {
  partnerId: string;
  currency: "XOF";
  generatedAt: string;
  totals: { invoiced: number; credited: number; paid: number; balanceDue: number };
  entries: Array<{ kind: "invoice" | "credit_note" | "payment"; documentId: string; reference: string; date: string; label: string; debit: number; credit: number; balance: number }>;
  invoices: BrokerInvoiceData[];
  packs: Array<{ id: string; creditsGranted: number; creditsConsumed: number; creditsRemaining: number; reason: string; grantedAt: string }>;
  packCreditsRemaining: number;
  paymentsEnabled: false;
  notice: string;
}

const emptyAccount: BrokerAccountData = {
  partnerId: "",
  currency: "XOF",
  generatedAt: "",
  totals: { invoiced: 0, credited: 0, paid: 0, balanceDue: 0 },
  entries: [],
  invoices: [],
  packs: [],
  packCreditsRemaining: 0,
  paymentsEnabled: false,
  notice: ""
};

/** Spec 060 G-05: etat des comptes du cabinet (tous plans), lu avec billing:read_own. */
export function readBrokerBillingAccount() {
  return readBroker<BrokerAccountData>("/broker/billing/account", emptyAccount);
}

/** Spec 063 FR-B09: disputes of the own cabinet (GET /broker/billing/disputes, billing:read_own). */
export function readBrokerDisputes() {
  return readBroker<{ items: BrokerLeadDisputeView[] }>("/broker/billing/disputes", { items: [] });
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
  /** Spec 062 (E-08): first reply visible by the visitor. Additive, absent until the API sends it. */
  averageFirstVisibleReplyMinutes?: number | null;
  firstVisibleReplyMeasured?: number | null;
  firstVisibleReplyWithinTarget?: number | null;
  firstVisibleReplyComplianceRate?: number | null;
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

/** Spec 022: detail minimal d'un lead Starter, limite aux informations consenties. */
export interface BrokerStarterLeadHistoryEventData {
  id: string;
  eventType: string;
  previousStatus?: string;
  nextStatus?: string;
  reason?: string;
  /** Spec 059 (suite): issue d'une cloture (`closed`): gagne, perdu ou sans_suite. */
  outcome?: string;
  comment?: string;
  occurredAt: string;
}

export interface BrokerStarterLeadDetailData {
  leadAssignmentId: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  status: string;
  assignedAt: string;
  seen: boolean;
  seenAt?: string;
  contact: Record<string, unknown>;
  /** Spec 055 FR-001: `masked` apres un retrait du consentement. */
  contactVisibility?: "full" | "masked";
  answers: Record<string, unknown>;
  history: BrokerStarterLeadHistoryEventData[];
  /** Spec 063 FR-B01/FR-B09: dispute window and dispute of this lead, when any. */
  disputeWindow?: LeadDisputeWindow;
  dispute?: BrokerLeadDisputeData;
}

const emptyStarterLeadDetail: BrokerStarterLeadDetailData = {
  leadAssignmentId: "",
  publicReference: "",
  countryCode: "",
  productKey: "",
  status: "assigned",
  assignedAt: "",
  seen: false,
  contact: {},
  answers: {},
  history: []
};

/** GET /broker/starter/leads/:leadId - marque le lead vu lors du premier acces autorise. */
export function readStarterLeadDetail(leadAssignmentId: string) {
  return readBroker<BrokerStarterLeadDetailData>(`/broker/starter/leads/${encodeURIComponent(leadAssignmentId)}`, emptyStarterLeadDetail);
}

/** GET /broker/starter/leads/:leadId/history - historique minimal audite. */
export function readStarterLeadHistory(leadAssignmentId: string) {
  return readBroker<BrokerStarterLeadHistoryEventData[]>(`/broker/starter/leads/${encodeURIComponent(leadAssignmentId)}/history`, []);
}

/** Distingue un lead inexistant d'une indisponibilite d'API, sans exposer d'information sensible. */
export function isNotFoundState(state: BrokerApiState<unknown>): boolean {
  return state.status === "error" && state.error === "api_404";
}

/** Spec 055: proposition envoyee au visiteur et reponses du visiteur (vue courtier). */
export const BROKER_PROPOSALS_SOURCE_MARKER = "broker-proposals:055";

export interface BrokerProposalResponseData {
  id: string;
  type: "interested" | "declined" | "question";
  callbackSlot?: string;
  declineReason?: string;
  question?: string;
  createdAt: string;
}

export interface BrokerProposalData {
  id: string;
  leadAssignmentId: string;
  status: "sent" | "viewed" | "responded" | "withdrawn" | "expired";
  message: string;
  priceMin?: number;
  priceMax?: number;
  currency: string;
  guarantees: string[];
  validUntil: string;
  document?: { fileName: string; mimeType: string; sizeBytes: number };
  sentAt: string;
  viewedAt?: string;
  respondedAt?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
  nonContractualNotice: string;
  responses: BrokerProposalResponseData[];
}

export interface BrokerProposalListData {
  items: BrokerProposalData[];
  activeCount: number;
  maxActive: number;
  canSend: boolean;
  blockers: string[];
  suggestedNextStatus?: string;
}

const emptyProposalList: BrokerProposalListData = { items: [], activeCount: 0, maxActive: 10, canSend: false, blockers: [] };

/** GET /broker/{starter|crm}/leads/:leadId/proposals - le courtier ne voit que ses propres propositions. */
export function readLeadProposals(channel: "starter" | "crm", leadAssignmentId: string) {
  return readBroker<BrokerProposalListData>(`/broker/${channel}/leads/${encodeURIComponent(leadAssignmentId)}/proposals`, emptyProposalList);
}

/** Spec 055 FR-010: vue Kanban CRM (colonnes = statuts pipeline). */
export function readCrmKanban() {
  return readBroker<Record<string, Array<Record<string, unknown>>>>("/broker/crm/leads/kanban", {});
}

/** Spec 062: conversation courtier <-> visiteur et demandes de documents (miroir de `lead-messaging.ts`). */
export const BROKER_CONVERSATION_SOURCE_MARKER = "broker-conversation:062";

export interface BrokerConversationAttachmentData {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface BrokerConversationMessageData {
  id: string;
  senderType: "broker" | "visitor";
  mine: boolean;
  body: string;
  createdAt: string;
  readAt: string | null;
  attachments: BrokerConversationAttachmentData[];
}

export interface BrokerConversationData {
  conversationId: string;
  partnerName: string;
  state: "open" | "read_only";
  readOnlyReason: string | null;
  canSend: boolean;
  unreadCount: number;
  notice: string;
  messages: BrokerConversationMessageData[];
  nextCursor: string | null;
}

export interface BrokerDocumentRequestFileData {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface BrokerDocumentRequestData {
  id: string;
  label: string;
  note?: string;
  dueAt?: string;
  status: "open" | "fulfilled" | "cancelled";
  createdAt: string;
  fulfilledAt?: string;
  documents: BrokerDocumentRequestFileData[];
}

export interface BrokerDocumentRequestListData {
  items: BrokerDocumentRequestData[];
  openCount: number;
  maxOpen: number;
  canCreate: boolean;
  blockers: string[];
}

const emptyConversation: BrokerConversationData = {
  conversationId: "",
  partnerName: "",
  state: "read_only",
  readOnlyReason: null,
  canSend: false,
  unreadCount: 0,
  notice: "",
  messages: [],
  nextCursor: null
};

const emptyDocumentRequests: BrokerDocumentRequestListData = { items: [], openCount: 0, maxOpen: 10, canCreate: false, blockers: [] };

/**
 * GET /broker/{starter|crm}/leads/:leadId/conversation - la conversation du courtier actuel uniquement.
 * `limit=300` (= LEAD_MESSAGE_THREAD_MAX) : le courtier voit tout le fil, pas seulement les 50 derniers messages.
 */
export function readLeadConversation(channel: "starter" | "crm", leadAssignmentId: string) {
  return readBroker<BrokerConversationData>(`/broker/${channel}/leads/${encodeURIComponent(leadAssignmentId)}/conversation?limit=300`, emptyConversation);
}

/** GET /broker/{starter|crm}/leads/:leadId/document-requests */
export function readLeadDocumentRequests(channel: "starter" | "crm", leadAssignmentId: string) {
  return readBroker<BrokerDocumentRequestListData>(`/broker/${channel}/leads/${encodeURIComponent(leadAssignmentId)}/document-requests`, emptyDocumentRequests);
}
