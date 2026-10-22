import type { ChannelOutboxItem } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

export type { ChannelOutboxItem };
export { readMessagingDeliveries, readMessagingProviders } from "./admin-api";

export interface ChannelOutboxState {
  status: "success" | "unauthenticated" | "forbidden" | "error";
  data: ChannelOutboxItem[];
  error?: string;
}

/** Read of GET /admin/messaging/outbox (retry queue; never carries recipient or body). */
export async function readChannelOutbox(): Promise<ChannelOutboxState> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: [], error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/messaging/outbox`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: [], error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: [], error: "access_denied" };
    if (!response.ok) return { status: "error", data: [], error: `api_${response.status}` };
    const body = await response.json() as ChannelOutboxItem[];
    return { status: "success", data: Array.isArray(body) ? body : [] };
  } catch (error) {
    return { status: "error", data: [], error: error instanceof Error ? error.message : "api_unavailable" };
  }
}
