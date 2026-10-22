import { expect, request, type Page } from "@playwright/test";
import { e2eEnv } from "./env";
import { adminBearerToken } from "./recos-062b";

// Spec 070 (PRD 35/36): opening a country, or making a product public (status or global flag), is
// gated by the activation checklist. Besides the pre-lot-4 conditions (consent, quote forms, licensed
// broker, offer...) the gate now wants, for the product: at least one active scoring rule, the FR and
// EN legal disclaimers, the required document kinds (when the product asks for documents) and four
// manual attestations; for the country: one active routing rule and four manual attestations.
//
// This helper provisions all of it through the existing admin API with the bearer token of the
// back-office session held by `page` (a super_admin that has completed MFA: attesting needs
// compliance_admin or super_admin with MFA). Every step reads first and only writes what is missing,
// so it is safe to call again on a kept stack and from several journeys (CI, then SN).
//
// Behaviour kept neutral on purpose: the routing rule is `first_eligible` (what the router falls
// back to without a rule) and the scoring rule carries the PRD section 15 default weights.

/** Attestable controls of the contract (packages/shared/contracts/activation-checklist.contracts.ts). */
const COUNTRY_ATTESTATIONS = ["country_notifications_tested", "country_support_ready", "country_deactivation_plan", "country_ai_decision_explicit"] as const;
const PRODUCT_ATTESTATIONS = ["product_routing_tested", "product_user_journey_tested", "product_ai_guardrails_configured", "product_dashboard_metrics"] as const;

// 30+ characters (country_deactivation_plan), no e-mail address and no run of 9+ digits (refused as personal data).
const ATTESTATION_NOTE = "Verifie lors du scenario E2E de reference, dossier de conformite interne";
const DISCLAIMERS = {
  fr: "Offre indicative, a confirmer par le courtier partenaire.",
  en: "Indicative offer, to be confirmed by the partner broker."
} as const;
const DEFAULT_SCORING_WEIGHTS = { guaranteeLevel: 30, price: 25, deductible: 15, processingSpeed: 10, paymentFlexibility: 10, informationQuality: 5, userPreferences: 5 };

export interface ActivationPrerequisitesScope {
  countryId: string;
  /** Ids of the products opened in the country. */
  productIds: string[];
  /** Reason recorded in the audit log of every write. */
  reason: string;
}

interface Api {
  get<T>(path: string): Promise<T>;
  send<T>(method: "POST" | "PATCH", path: string, data: Record<string, unknown>): Promise<T>;
}

async function withApi<T>(page: Page, run: (api: Api) => Promise<T>): Promise<T> {
  const token = await adminBearerToken(page);
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const parse = async (response: Awaited<ReturnType<typeof context.fetch>>, label: string): Promise<unknown> => {
    const text = await response.text();
    expect(response.ok(), `${label} -> ${response.status()} ${text}`).toBe(true);
    return text ? JSON.parse(text) : {};
  };
  try {
    return await run({
      get: async <R>(path: string) => await parse(await context.fetch(path, { method: "GET" }), `GET ${path}`) as R,
      send: async <R>(method: "POST" | "PATCH", path: string, data: Record<string, unknown>) => await parse(await context.fetch(path, { method, data }), `${method} ${path}`) as R
    });
  } finally {
    await context.dispose();
  }
}

async function attestAll(api: Api, scopeType: "country" | "product", scopeId: string, keys: readonly string[]): Promise<void> {
  const current = await api.get<{ attestations: Array<{ controlKey: string; revokedAt: string | null }> }>(`/admin/activation-attestations?scopeType=${scopeType}&scopeId=${scopeId}`);
  const active = new Set(current.attestations.filter((attestation) => !attestation.revokedAt).map((attestation) => attestation.controlKey));
  for (const controlKey of keys) {
    if (active.has(controlKey)) continue;
    await api.send("POST", "/admin/activation-attestations", { scopeType, scopeId, controlKey, note: ATTESTATION_NOTE });
  }
}

/**
 * What the product gate (`product_public_enabled` flag, status `public`) asks for one product:
 * scoring rule, FR + EN disclaimers, required document kinds, product attestations.
 */
export async function provisionProductPrerequisites(page: Page, scope: { productIds: string[]; reason: string }): Promise<void> {
  await withApi(page, async (api) => {
    const scoring = await api.get<{ items: Array<{ productId: string | null; status: string }> }>("/admin/scoring-rules");
    for (const productId of scope.productIds) {
      // Global rule (no country): it counts for every country the product is linked to, whichever is opened first.
      if (!scoring.items.some((rule) => rule.productId === productId && rule.status === "active")) {
        await api.send("POST", "/admin/scoring-rules", { productId, countryId: null, weights: DEFAULT_SCORING_WEIGHTS, reason: scope.reason });
      }
      const product = await api.get<{ requiresDocuments: boolean; requiredDocumentKinds: string[]; legalNotice: { fr?: { disclaimer?: string }; en?: { disclaimer?: string } } }>(`/admin/products/${productId}`);
      const missingLanguage = (["fr", "en"] as const).filter((language) => !product.legalNotice?.[language]?.disclaimer?.trim());
      const needsDocuments = product.requiresDocuments && (product.requiredDocumentKinds ?? []).length === 0;
      if (missingLanguage.length > 0 || needsDocuments) {
        await api.send("PATCH", `/admin/products/${productId}`, {
          ...(missingLanguage.length > 0 ? { legalNotice: { fr: { ...product.legalNotice?.fr, disclaimer: product.legalNotice?.fr?.disclaimer?.trim() || DISCLAIMERS.fr }, en: { ...product.legalNotice?.en, disclaimer: product.legalNotice?.en?.disclaimer?.trim() || DISCLAIMERS.en } } } : {}),
          ...(needsDocuments ? { requiredDocumentKinds: ["identity"] } : {}),
          reason: scope.reason
        });
      }
      await attestAll(api, "product", productId, PRODUCT_ATTESTATIONS);
    }
  });
}

/** What the country gate (`country_public_enabled` flag, status `public`) asks beyond the products: routing rule + country attestations. */
export async function provisionCountryPrerequisites(page: Page, scope: { countryId: string; reason: string }): Promise<void> {
  await withApi(page, async (api) => {
    const routing = await api.get<{ items: Array<{ countryId: string; status: string }> }>("/admin/routing-rules");
    if (!routing.items.some((rule) => rule.countryId === scope.countryId && rule.status === "active")) {
      await api.send("POST", "/admin/routing-rules", { countryId: scope.countryId, productId: null, mode: "first_eligible", reason: scope.reason });
    }
    await attestAll(api, "country", scope.countryId, COUNTRY_ATTESTATIONS);
  });
}

/** Everything the activation checklist asks for the opening of a country and its products (idempotent). */
export async function provisionActivationPrerequisites(page: Page, scope: ActivationPrerequisitesScope): Promise<void> {
  await provisionProductPrerequisites(page, { productIds: scope.productIds, reason: scope.reason });
  await provisionCountryPrerequisites(page, { countryId: scope.countryId, reason: scope.reason });
}
