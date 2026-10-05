import type {
  AdminAuditLogExport,
  AdminAuditLogItem,
  AdminContactMessageStatusResult,
  AdminLeadAssignmentListItem,
  AdminPage,
  AdminQuoteRequestDetail,
  AdminQuoteRequestListItem,
  AdminQuoteReviewQueueItem,
  AdminQuoteReviewResult,
  AdminRoutingDecisionView
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import type { RoutingAnomalyReport } from "../../../../packages/shared/contracts/dashboard.contracts";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/**
 * Spec 056: server-side reads and writes of the admin operations consoles. Kept apart from
 * `admin-api.ts` so the consoles stay a self-contained surface; the shapes mirror
 * `packages/shared/contracts/admin-operations.contracts.ts`.
 */
export const OPERATIONS_API_SOURCE_MARKER = "admin-operations-consoles:056";

export type OperationsReadStatus = "success" | "error" | "unauthenticated" | "forbidden" | "not_found";

export interface OperationsRead<T> {
  status: OperationsReadStatus;
  data: T;
  error?: string;
}

/** A refusal never throws: the screen shows the API code and message instead of a bare status. */
export interface OperationsWriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
}

export type QuoteRequestRow = AdminQuoteRequestListItem;
export type QuoteRequestDetail = AdminQuoteRequestDetail;
export type QuoteReviewQueueItem = AdminQuoteReviewQueueItem;
export type LeadAssignmentRow = AdminLeadAssignmentListItem;
export type AuditLogRow = AdminAuditLogItem;
export type RoutingHistoryRow = AdminRoutingDecisionView & { publicReference: string | null; countryCode: string | null; productKey: string | null };
export type OperationsPage<T> = AdminPage<T>;

export interface ContactMessageRow {
  id: string;
  publicReference: string;
  audience: "visitor" | "broker" | "insurer" | "press";
  name: string;
  emailNormalized: string;
  phone?: string;
  countryId?: string;
  subject: string;
  message: string;
  status: "new" | "handled" | "spam";
  handledAt?: string;
  handledById?: string;
  statusReason?: string;
  createdAt: string;
}

function emptyPage<T>(): AdminPage<T> {
  return { items: [], total: 0, page: 1, pageSize: 50 };
}

/** Keeps only non-empty string filters, in a stable order, for the API query string. */
export function toQueryString(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function readOperations<T>(path: string, fallback: T): Promise<OperationsRead<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    if (response.status === 404) return { status: "not_found", data: fallback, error: "not_found" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

async function writeOperations<T>(path: string, body: unknown): Promise<OperationsWriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => undefined) as unknown;
    if (response.ok) return { ok: true, status: response.status, data: payload as T };
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return {
      ok: false,
      status: response.status,
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {})
    };
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function readQuoteRequests(filters: Record<string, string | number | undefined>) {
  return readOperations<AdminPage<QuoteRequestRow>>(`/admin/operations/quote-requests${toQueryString(filters)}`, emptyPage());
}

export function readQuoteRequestDetail(quoteRequestId: string) {
  return readOperations<QuoteRequestDetail | null>(`/admin/operations/quote-requests/${encodeURIComponent(quoteRequestId)}`, null);
}

export function readQuoteReviewQueue(page = 1) {
  return readOperations<AdminPage<QuoteReviewQueueItem>>(`/admin/operations/quote-review${toQueryString({ page, pageSize: 25 })}`, emptyPage());
}

export function decideQuoteReview(quoteRequestId: string, input: { decision: "route" | "assign" | "non_routable" | "duplicate"; reason: string; partnerTenantId?: string; duplicateOfReference?: string }) {
  return writeOperations<AdminQuoteReviewResult>(`/admin/operations/quote-requests/${encodeURIComponent(quoteRequestId)}/review`, input);
}

export function readLeadAssignments(filters: Record<string, string | number | undefined>) {
  return readOperations<AdminPage<LeadAssignmentRow>>(`/admin/operations/lead-assignments${toQueryString(filters)}`, emptyPage());
}

export function reassignLeadAssignment(assignmentId: string, input: { partnerTenantId: string; reason: string }) {
  return writeOperations<{ assignmentId: string; partnerTenantId: string; status: string }>(`/admin/lead-assignments/${encodeURIComponent(assignmentId)}/reassign`, input);
}

export function readContactMessages(filters: Record<string, string | undefined>) {
  return readOperations<ContactMessageRow[]>(`/admin/contact-messages${toQueryString(filters)}`, []);
}

export function updateContactMessageStatus(messageId: string, input: { status: "new" | "handled" | "spam"; reason?: string }) {
  return writeOperations<AdminContactMessageStatusResult>(`/admin/contact-messages/${encodeURIComponent(messageId)}/status`, input);
}

export function readAuditLogs(filters: Record<string, string | number | undefined>) {
  return readOperations<AdminPage<AuditLogRow>>(`/admin/operations/audit-logs${toQueryString(filters)}`, emptyPage());
}

/** Restricted to compliance and super admin by the API, which audits every export. */
export function exportAuditLogs(filters: Record<string, string | undefined>) {
  return readOperations<AdminAuditLogExport | null>(`/admin/operations/audit-logs/export${toQueryString(filters)}`, null);
}

export function readRoutingHistory(filters: Record<string, string | number | undefined>) {
  return readOperations<AdminPage<RoutingHistoryRow>>(`/admin/routing/history${toQueryString(filters)}`, emptyPage());
}

export function readRoutingAnomalies() {
  return readOperations<RoutingAnomalyReport>("/admin/routing/anomalies", {
    generatedAt: new Date(0).toISOString(),
    totalAnomalies: 0,
    criticalCount: 0,
    warningCount: 0,
    anomalies: []
  });
}

/** First value of a Next `searchParams` entry, trimmed; empty means "no filter". */
export function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstValue(value) ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Link to another page of a filtered console, keeping every active filter. */
export function pageHref(pathname: string, filters: Record<string, string | undefined>, page: number): string {
  return `${pathname}${toQueryString({ ...filters, page: page > 1 ? page : undefined })}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}
