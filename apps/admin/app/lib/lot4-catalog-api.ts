import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import type { AdminApiState, AdminProductWriteInput, AdminWriteBlocker, AdminWriteResult } from "./admin-api";
import type {
  AdminProductCategoryCreateDto,
  AdminProductCategoryUpdateDto,
  AdminProductCategoryView,
  AdminProductView,
  ProductLegalNotice,
  ProductRequiredDocumentKind,
  ProductVersionView
} from "../../../../packages/shared/contracts/catalog.contracts";
import type {
  ActivationAttestationCreateDto,
  ActivationAttestationListResponse,
  ActivationAttestationRecord,
  ActivationAttestationRevokeDto,
  ActivationAttestationScope
} from "../../../../packages/shared/contracts/activation-checklist.contracts";

/**
 * Spec 070 lot 4 (catalogue et offres) back-office client: product categories, product versions,
 * activation attestations and the new product content fields. Kept apart from `admin-api.ts`, whose
 * small read/write helpers are not exported, so they are repeated here in their minimal form.
 */

async function readLot4<T>(path: string, fallback: T): Promise<AdminApiState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, unauthenticated: true, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, forbidden: true, error: "access_denied" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

function toBlockers(value: unknown): AdminWriteBlocker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
    return [{ section: text("section"), control: text("control"), label: text("label") || text("control"), evidence: text("evidence") }];
  });
}

async function writeLot4<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<AdminWriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", blockers: [], availableLanguages: [] };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => undefined) as unknown;
    if (response.ok) return { ok: true, status: response.status, data: payload as T, blockers: [], availableLanguages: [] };
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return {
      ok: false,
      status: response.status,
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      blockers: toBlockers(record.blockers),
      availableLanguages: []
    };
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", blockers: [], availableLanguages: [] };
  }
}

/* --- Product categories (PROD-001) --- */

export type AdminProductCategoryData = AdminProductCategoryView;

export function readAdminProductCategories() {
  return readLot4<AdminProductCategoryView[]>("/admin/product-categories", []);
}

export function createAdminProductCategory(input: AdminProductCategoryCreateDto) {
  return writeLot4<AdminProductCategoryView>("/admin/product-categories", "POST", input);
}

export function updateAdminProductCategory(categoryId: string, input: AdminProductCategoryUpdateDto) {
  return writeLot4<AdminProductCategoryView>(`/admin/product-categories/${encodeURIComponent(categoryId)}`, "PATCH", input);
}

/* --- Product content fields (PROD-005/007) and versions (PROD-008/009) --- */

export interface Lot4ProductWriteInput extends AdminProductWriteInput {
  categoryId?: string;
  legalNotice?: ProductLegalNotice;
  requiredDocumentKinds?: ProductRequiredDocumentKind[];
}

export function createAdminProductWithContent(input: Lot4ProductWriteInput & { key: string; name: string; reason: string }) {
  return writeLot4<AdminProductView>("/admin/products", "POST", input);
}

export function updateAdminProductWithContent(productId: string, input: Lot4ProductWriteInput & { expectedUpdatedAt?: string; reason: string }) {
  return writeLot4<AdminProductView>(`/admin/products/${encodeURIComponent(productId)}`, "PATCH", input);
}

export function readAdminProductVersions(productId: string) {
  return readLot4<ProductVersionView[]>(`/admin/products/${encodeURIComponent(productId)}/versions`, []);
}

/* --- Activation attestations (PRD 35/36) --- */

export function readActivationAttestations(scope: ActivationAttestationScope) {
  const query = `scopeType=${encodeURIComponent(scope.scopeType)}&scopeId=${encodeURIComponent(scope.scopeId)}`;
  return readLot4<ActivationAttestationListResponse | null>(`/admin/activation-attestations?${query}`, null);
}

export function attestActivationControl(input: ActivationAttestationCreateDto) {
  return writeLot4<ActivationAttestationRecord>("/admin/activation-attestations", "POST", input);
}

export function revokeActivationAttestation(input: ActivationAttestationRevokeDto) {
  return writeLot4<ActivationAttestationRecord>("/admin/activation-attestations/revoke", "POST", input);
}
