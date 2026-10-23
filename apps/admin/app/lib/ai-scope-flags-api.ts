import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/** Spec 074 FR-001: the only three keys the dedicated AI scope-flag route accepts. */
export type AiScopeFlagKey = "country_ai_enabled" | "product_ai_scoring_enabled" | "product_ai_form_assistant_enabled";

export interface AiScopeFlagsData {
  generatedAt: string;
  globalFlags: Array<{ key: string; value: boolean }>;
  countries: Array<{ id: string; code: string; name: string; flags: { country_ai_enabled: boolean } }>;
  products: Array<{
    id: string;
    key: string;
    name: string;
    sensitivity: string;
    flags: { product_ai_scoring_enabled: boolean; product_ai_form_assistant_enabled: boolean };
  }>;
  history: Array<{ key: string; scopeType: string; scopeId: string | null; value: boolean; reason: string | null; changedAt: string }>;
}

export interface AiScopeFlagsState {
  status: "success" | "unauthenticated" | "forbidden" | "error";
  data: AiScopeFlagsData;
  error?: string;
}

export const emptyAiScopeFlags: AiScopeFlagsData = { generatedAt: "", globalFlags: [], countries: [], products: [], history: [] };

/** Read of GET /admin/ai/scope-flags (same contract as `readAdmin` in admin-api.ts, kept local on purpose). */
export async function readAiScopeFlags(): Promise<AiScopeFlagsState> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: emptyAiScopeFlags, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/ai/scope-flags`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: emptyAiScopeFlags, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: emptyAiScopeFlags, error: "access_denied" };
    if (!response.ok) return { status: "error", data: emptyAiScopeFlags, error: `api_${response.status}` };
    const body = await response.json() as Partial<AiScopeFlagsData>;
    return {
      status: "success",
      data: {
        generatedAt: body.generatedAt ?? "",
        globalFlags: body.globalFlags ?? [],
        countries: body.countries ?? [],
        products: body.products ?? [],
        history: body.history ?? []
      }
    };
  } catch (error) {
    return { status: "error", data: emptyAiScopeFlags, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}
