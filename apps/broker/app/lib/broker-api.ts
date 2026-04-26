import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

export interface BrokerApiState<T> {
  data: T;
  error?: string;
  unauthenticated?: boolean;
  forbidden?: boolean;
  mfaRequired?: boolean;
}

async function readBroker<T>(path: string, fallback: T): Promise<BrokerApiState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { data: fallback, unauthenticated: true, error: "session_required" };

  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { data: fallback, unauthenticated: true, error: "session_expired" };
    if (response.status === 403) return { data: fallback, forbidden: true, mfaRequired: true, error: "access_denied" };
    if (!response.ok) return { data: fallback, error: `api_${response.status}` };
    return { data: await response.json() as T };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
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
