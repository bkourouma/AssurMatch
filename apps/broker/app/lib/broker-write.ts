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
    const payload = await response.json().catch(() => undefined) as { code?: unknown } | undefined;
    return { status: 403, suspended: payload?.code === PARTNER_SUSPENDED_CODE };
  } catch {
    return { status: 0, suspended: false };
  }
}
