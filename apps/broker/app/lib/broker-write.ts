import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/**
 * Broker write call shared by the server actions. It returns the HTTP status and whether the API
 * refused the write because the partner is suspended (spec 051 FR-021: 403 `PARTNER_SUSPENDED`),
 * so the screen can show "Compte suspendu : consultation seule" instead of a generic refusal.
 * Server-only: the session token is read from the httpOnly cookie and never leaves the server.
 */
export interface BrokerWriteResult {
  status: number;
  suspended: boolean;
  /** Spec 064: machine reason of a 403 refusal when the API gives one (e.g. `owner_required_for_manager_target`). */
  reason?: string | undefined;
}

export const PARTNER_SUSPENDED_CODE = "PARTNER_SUSPENDED";

export async function callBrokerWrite(path: string, method: "POST" | "PUT" | "PATCH", body: Record<string, unknown>): Promise<BrokerWriteResult> {
  const token = await getBackOfficeToken();
  if (!token) return { status: 401, suspended: false };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    if (response.status !== 403) return { status: response.status, suspended: false };
    const payload = await response.json().catch(() => undefined) as { code?: unknown; reason?: unknown; message?: unknown } | undefined;
    return { status: 403, suspended: payload?.code === PARTNER_SUSPENDED_CODE, reason: refusalReason(payload) };
  } catch {
    return { status: 0, suspended: false };
  }
}

/** Reads the machine reason of a refusal: an explicit `reason`, or the suffix of `Enterprise access denied: <reason>`. */
function refusalReason(payload: { reason?: unknown; message?: unknown } | undefined): string | undefined {
  if (typeof payload?.reason === "string" && /^[a-z_]{3,80}$/.test(payload.reason)) return payload.reason;
  if (typeof payload?.message === "string") {
    const match = /Enterprise access denied: ([a-z_]{3,80})/.exec(payload.message);
    if (match) return match[1];
  }
  return undefined;
}
