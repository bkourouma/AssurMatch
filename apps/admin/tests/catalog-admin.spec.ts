import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  COUNTRY_CATALOG_TOGGLEABLE_FLAGS,
  PRODUCT_CATALOG_TOGGLEABLE_FLAGS
} from "../../../packages/shared/contracts/catalog.contracts";
import { isSensitiveFeatureFlagKey } from "../../../backend/src/modules/feature-flags/sensitive-feature-flag-policy";
import {
  COUNTRY_TOGGLEABLE_FLAGS,
  PRODUCT_TOGGLEABLE_FLAGS,
  correctionTarget,
  isSensitiveFlagKey,
  scopeFromSection
} from "../app/lib/catalog-messages";

/** Spec 050 (T014, T015, T019, T031, T032, T036): source markers of the admin catalogue screens. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const catalogFiles = [
  "apps/admin/app/catalog/page.tsx",
  "apps/admin/app/catalog/catalog-forms.tsx",
  "apps/admin/app/catalog/countries/page.tsx",
  "apps/admin/app/catalog/countries/[countryId]/page.tsx",
  "apps/admin/app/catalog/products/page.tsx",
  "apps/admin/app/catalog/products/[productId]/page.tsx",
  "apps/admin/app/catalog/regimes/page.tsx",
  "apps/admin/app/lib/catalog-actions.ts",
  "apps/admin/app/lib/catalog-messages.ts",
  "apps/admin/app/lib/ui/catalog-action-result.tsx",
  "apps/admin/app/feature-flags/page.tsx",
  "apps/admin/app/feature-flags/feature-flag-forms.tsx",
  "apps/admin/app/activation-checklist/page.tsx"
];

test("the admin API client calls the spec 050 catalogue routes", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  for (const route of [
    "\"/admin/countries\"",
    "/admin/countries/${encodeURIComponent(countryId)}/status",
    "/admin/countries/${encodeURIComponent(countryId)}/flags",
    "/admin/countries/${encodeURIComponent(countryId)}/products",
    "/products/${encodeURIComponent(productId)}/retire",
    "/products/${encodeURIComponent(productId)}/flags",
    "/admin/products",
    "/admin/products/${encodeURIComponent(productId)}/flags",
    "/admin/regulatory-regimes",
    "/admin/regulatory-regimes/${encodeURIComponent(regimeId)}/retire",
    "/admin/feature-flags/${encodeURIComponent(flagId)}"
  ]) {
    expect(api).toContain(route);
  }
  // Refusals are surfaced with their blockers instead of being thrown away; writeAdmin is untouched.
  expect(api).toContain("writeAdminResult");
  expect(api).toContain("blockers: toBlockers(record.blockers)");
  expect(api).toContain("availableLanguages");
  expect(api).toContain("async function writeAdmin<T>(path: string, method: \"POST\" | \"PATCH\" | \"DELETE\", body: unknown): Promise<T>");
});

test("the admin navigation reaches every catalogue screen", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  for (const href of ["/catalog/countries", "/catalog/products", "/catalog/regimes", "/consent-texts", "/quote-form-definitions"]) {
    expect(shell).toContain(`href: "${href}"`);
  }
  const hub = source("apps/admin/app/catalog/page.tsx");
  expect(hub).toContain("Catalogue socle");
  expect(hub).toContain("exposition publique desactivee");
  expect(hub).toContain("checklist d&apos;activation");
});

test("every catalogue mutation asks for an audited reason and edits carry the concurrency token", () => {
  const forms = source("apps/admin/app/catalog/catalog-forms.tsx");
  const actions = source("apps/admin/app/lib/catalog-actions.ts");
  expect(forms).toContain("Motif (audite)");
  expect(forms).toContain("name=\"expectedUpdatedAt\" value={country.updatedAt}");
  expect(forms).toContain("name=\"expectedUpdatedAt\" value={product.updatedAt}");
  expect(forms).toContain("name=\"expectedUpdatedAt\" value={regime.updatedAt}");
  expect(actions).toContain("\"use server\"");
  expect(actions).toContain("REASON_MIN_LENGTH = 8");
  expect(actions).toContain("revalidatePath");
  // One submit button per flag: the Switch needs JavaScript and is not used for catalogue flags.
  expect(forms).not.toMatch(/<Switch\b|\bSwitch,/);
  expect(forms).toContain("data-catalog-flag-form");
});

test("only the allowlisted flags get a toggle; sensitive and AI flags stay read-only", () => {
  expect([...COUNTRY_TOGGLEABLE_FLAGS].sort()).toEqual([...COUNTRY_CATALOG_TOGGLEABLE_FLAGS].sort());
  expect([...PRODUCT_TOGGLEABLE_FLAGS].sort()).toEqual([...PRODUCT_CATALOG_TOGGLEABLE_FLAGS].sort());
  for (const key of ["country_ai_enabled", "product_ai_scoring_enabled", "product_ai_form_assistant_enabled", "product_sensitive_data_enabled"]) {
    expect((COUNTRY_TOGGLEABLE_FLAGS as readonly string[]).includes(key)).toBe(false);
    expect((PRODUCT_TOGGLEABLE_FLAGS as readonly string[]).includes(key)).toBe(false);
  }
  const country = source("apps/admin/app/catalog/countries/[countryId]/page.tsx");
  const product = source("apps/admin/app/catalog/products/[productId]/page.tsx");
  for (const page of [country, product]) {
    expect(page).toContain("SENSITIVE_FLAG_EXPLANATION");
    expect(page).toContain("TOGGLEABLE_FLAGS");
  }
  expect(source("apps/admin/app/lib/catalog-messages.ts")).toContain("procédure de conformité");
});

test("public activation and manual review removal are only offered to compliance", () => {
  const country = source("apps/admin/app/catalog/countries/[countryId]/page.tsx");
  const forms = source("apps/admin/app/catalog/catalog-forms.tsx");
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  expect(messages).toContain("PUBLIC_ACTIVATION_ROLES = [\"compliance_admin\", \"super_admin\"]");
  expect(country).toContain("canApprovePublicActivation(session.profile.roles)");
  expect(country).toContain("PUBLIC_ACTIVATION_FLAGS.has(key) && !canApprovePublic");
  expect(forms).toContain("status !== \"public\" || canApprovePublic");
});

test("activation refusals list their blockers with a Corriger link", () => {
  const result = source("apps/admin/app/lib/ui/catalog-action-result.tsx");
  const country = source("apps/admin/app/catalog/countries/[countryId]/page.tsx");
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  expect(result).toContain("data-catalog-blockers");
  expect(result).toContain("blocker.evidence");
  expect(result).toContain("Corriger");
  expect(country).toContain("BlockersList blockers={checklist.blockers}");
  expect(country).toContain("id=\"liaisons\"");
  expect(messages).toContain("Action refusée : droits insuffisants ou hors périmètre");
  expect(messages).toContain("CATALOG_UPDATE_CONFLICT");
  expect(messages).toContain("ACTIVATION_BLOCKED");
});

test("failing checklist controls map to the screen that fixes them", () => {
  const countryId = "11111111-1111-4111-8111-111111111111";
  const productId = "22222222-2222-4222-8222-222222222222";
  expect(correctionTarget("country_regime", { countryId })?.href).toBe(`/catalog/countries/${countryId}`);
  expect(correctionTarget("country_public_enabled", { countryId })?.href).toBe(`/catalog/countries/${countryId}`);
  expect(correctionTarget("product_quote_enabled", { productId })?.href).toBe(`/catalog/products/${productId}`);
  expect(correctionTarget("product_quote_enabled", { countryId, productId })?.href).toBe(`/catalog/countries/${countryId}#liaisons`);
  expect(correctionTarget("published_quote_form", { countryId, productId })?.href).toBe("/quote-form-definitions");
  expect(correctionTarget("published_consent_text", { countryId, productId })?.href).toBe(`/consent-texts?countryId=${countryId}&productId=${productId}`);
  expect(correctionTarget("country_active_licensed_partner", { countryId })?.note).toContain("spec 051");
  expect(correctionTarget("partner_license_valid", {})?.href).toBe("/partners");
  expect(correctionTarget("publishable_offer", {})?.href).toBe("/offers");
  expect(scopeFromSection(`quote:${countryId}:${productId}`)).toEqual({ countryId, productId });
});

test("the activation checklist stays read-only while linking to fixes", () => {
  const page = source("apps/admin/app/activation-checklist/page.tsx");
  expect(page).toContain("correctionTarget");
  expect(page).toContain("Corriger");
  expect(page).toContain("name=\"country\"");
  expect(page).toContain("name=\"product\"");
  expect(page).not.toContain("useActionState");
  expect(page).not.toContain("\"use server\"");
});

test("the feature flag screen toggles global non-sensitive flags only", () => {
  const page = source("apps/admin/app/feature-flags/page.tsx");
  const forms = source("apps/admin/app/feature-flags/feature-flag-forms.tsx");
  const actions = source("apps/admin/app/lib/catalog-actions.ts");
  expect(page).toContain("flag.scopeType === \"global\"");
  expect(page).toContain("isSensitiveFlagKey(flag.key, sensitiveFeatureFlagKeys)");
  expect(page).toContain("Flags pays et produits (lecture seule)");
  expect(forms).toContain("Motif (audite)");
  expect(forms).not.toMatch(/<Switch\b|\bSwitch,/);
  expect(actions).toContain("if (isSensitiveFlagKey(key)) return { status: \"error\", message: SENSITIVE_FLAG_EXPLANATION }");
});

test("the admin sensitivity mirror agrees with the backend policy", () => {
  for (const key of [
    "payments_enabled",
    "ai_recommendation_enabled",
    "ai_summary_enabled",
    "ai_partner_opt_out",
    "partner_webhooks_enabled",
    "premium_quotes_enabled",
    "insurer_sync_enabled",
    "public_comparator_enabled",
    "quote_request_enabled",
    "sponsored_offers_enabled",
    "billing_enabled",
    "claims_enabled"
  ]) {
    expect(isSensitiveFlagKey(key), key).toBe(isSensitiveFeatureFlagKey(key));
  }
});

test("catalogue copy avoids regulated or promotional wording", () => {
  for (const path of catalogFiles) {
    const content = source(path);
    for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
      expect(content, `${path} ${forbidden}`).not.toContain(forbidden);
    }
  }
});

test("quote form administration filters by language and flags superseded consent", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/quote-form-definitions/page.tsx");
  const forms = source("apps/admin/app/quote-form-definitions/quote-form-forms.tsx");
  expect(api).toContain("consentSuperseded?: boolean");
  expect(page).toContain("form.consentSuperseded");
  expect(page).toContain("Consentement remplacé");
  expect(page).toContain("name=\"language\"");
  expect(forms).toContain("Les champs generiques");
});
