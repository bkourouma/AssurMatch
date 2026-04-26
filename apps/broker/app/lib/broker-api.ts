import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

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

const emptyDashboard: BrokerDashboardData = {
  plan: "starter",
  window: { from: "", to: "" },
  starter: { received: 0, accepted: 0, rejected: 0, disputed: 0, pendingAction: 0, averageFirstActionMinutes: null, byProduct: [], byCountry: [] },
  licenseAlerts: []
};

export function readBrokerDashboard() {
  return readBroker<BrokerDashboardData>("/broker/dashboard", emptyDashboard);
}
