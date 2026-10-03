import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import { PARTNER_SUSPENDED_CODE } from "./broker-write";
import type {
  BrokerAccountView,
  BrokerCatalogChoicesView,
  BrokerLicenseDocumentView,
  BrokerLicenseView,
  BrokerTeamInviteResult,
  BrokerTeamMemberView,
  PartnerChangeRequestView
} from "../../../../packages/shared/contracts/broker-self-service.contracts";

/**
 * Spec 053: broker self-service client (company profile, requests, licences, team). Reads and writes
 * run on the server only: the session token stays in the httpOnly cookie. Only `/broker/*` routes
 * are called; the partner is always the one of the session, never a parameter.
 */
export type {
  BrokerAccountView,
  BrokerCatalogChoicesView,
  BrokerLicenseDocumentView,
  BrokerLicenseView,
  BrokerTeamInviteResult,
  BrokerTeamMemberView,
  PartnerChangeRequestView
};

export interface SelfServiceReadState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden";
  data: T;
  error?: string;
}

async function readSelfService<T>(path: string, fallback: T): Promise<SelfServiceReadState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function readBrokerAccount() {
  return readSelfService<BrokerAccountView | null>("/broker/account/profile", null);
}

export function readBrokerRequests() {
  return readSelfService<PartnerChangeRequestView[]>("/broker/account/requests", []);
}

export function readBrokerCatalogChoices() {
  return readSelfService<BrokerCatalogChoicesView>("/broker/account/catalog", { countries: [], products: [] });
}

export function readBrokerLicenses() {
  return readSelfService<BrokerLicenseView[]>("/broker/licenses", []);
}

export function readBrokerTeam() {
  return readSelfService<BrokerTeamMemberView[]>("/broker/team", []);
}

export interface SelfServiceWriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
  suspended: boolean;
}

async function toWriteResult<T>(response: Response): Promise<SelfServiceWriteResult<T>> {
  const payload = await response.json().catch(() => undefined) as unknown;
  if (response.ok) return { ok: true, status: response.status, data: payload as T, suspended: false };
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  return {
    ok: false,
    status: response.status,
    ...(code ? { code } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
    suspended: response.status === 403 && code === PARTNER_SUSPENDED_CODE
  };
}

export async function writeSelfService<T = unknown>(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<SelfServiceWriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", suspended: false };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return toWriteResult<T>(response);
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", suspended: false };
  }
}

/** Spec 053 FR-007: multipart licence proof, forwarded by the same-origin route handler. */
export async function uploadBrokerLicenseProof(licenseId: string, form: FormData): Promise<SelfServiceWriteResult<{ license: BrokerLicenseView; document: BrokerLicenseDocumentView }>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", suspended: false };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/broker/licenses/${encodeURIComponent(licenseId)}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store"
    });
    return toWriteResult(response);
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", suspended: false };
  }
}
