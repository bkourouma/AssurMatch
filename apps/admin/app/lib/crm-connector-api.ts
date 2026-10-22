import type { CrmConnectorDeliveriesResponse, CrmConnectorsResponse } from "../../../../packages/shared/contracts/crm-connector.contracts";
import { readAdminFeatureFlags } from "./admin-api";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/** Spec 077 FR-002: server-side readers for the CRM connector screen (spec 076 routes). */
export interface CrmReadState<T> {
  status: "success" | "unauthenticated" | "forbidden" | "error";
  data: T;
  error?: string;
}

export const emptyCrmConnectors: CrmConnectorsResponse = { generatedAt: "", items: [], total: 0 };
export const emptyCrmDeliveries: CrmConnectorDeliveriesResponse = { generatedAt: "", items: [], total: 0 };

async function readCrm<T>(path: string, fallback: T): Promise<CrmReadState<T>> {
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
    return { status: "success", data: (await response.json()) as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function readCrmConnectors() {
  return readCrm<CrmConnectorsResponse>("/admin/crm-connectors", emptyCrmConnectors);
}

export function readCrmConnectorDeliveries(connectorId?: string) {
  const query = connectorId ? `?connectorId=${encodeURIComponent(connectorId)}` : "";
  return readCrm<CrmConnectorDeliveriesResponse>(`/admin/crm-connectors/deliveries${query}`, emptyCrmDeliveries);
}

export type CrmFlagReading = { readable: true; value: boolean } | { readable: false };

/** Best effort read of `crm_connector_enabled`: a refused or failed read never breaks the screen. */
export async function readCrmConnectorFlag(): Promise<CrmFlagReading> {
  const flags = await readAdminFeatureFlags();
  if (flags.status !== "success") return { readable: false };
  const flag = flags.data.find((entry) => entry.key === "crm_connector_enabled" && entry.scopeType === "global");
  return { readable: true, value: flag?.value === true };
}
