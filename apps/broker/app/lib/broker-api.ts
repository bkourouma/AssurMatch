const BROKER_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface BrokerApiState<T> {
  data: T;
  error?: string;
  forbidden?: boolean;
}

function brokerHeaders(): Record<string, string> {
  return {
    "x-assurmatch-actor-id": process.env.ASSURMATCH_DEV_BROKER_ACTOR_ID ?? "dev-broker",
    "x-assurmatch-roles": process.env.ASSURMATCH_DEV_BROKER_ROLES ?? "broker_owner_starter",
    "x-assurmatch-partner-tenant-id": process.env.ASSURMATCH_DEV_BROKER_TENANT_ID ?? "dev-tenant",
    "x-assurmatch-partner-plan": process.env.ASSURMATCH_DEV_BROKER_PLAN ?? "starter",
    "x-assurmatch-mfa-verified": process.env.ASSURMATCH_DEV_BROKER_MFA ?? "true"
  };
}

async function readBroker<T>(path: string, fallback: T): Promise<BrokerApiState<T>> {
  try {
    const response = await fetch(`${BROKER_API_BASE_URL}${path}`, { headers: brokerHeaders(), cache: "no-store" });
    if (response.status === 401 || response.status === 403) return { data: fallback, forbidden: true, error: `api_${response.status}` };
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
