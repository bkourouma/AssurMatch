import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Spec 050 (T024): source markers of the consent text administration. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const consentFiles = [
  "apps/admin/app/consent-texts/page.tsx",
  "apps/admin/app/consent-texts/[consentTextId]/page.tsx",
  "apps/admin/app/consent-texts/consent-forms.tsx",
  "apps/admin/app/lib/consent-actions.ts"
];

test("the admin API client calls the consent text routes", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  expect(api).toContain("/admin/consent-texts${query ? `?${query}` : \"\"}");
  expect(api).toContain("\"/admin/consent-texts/templates\"");
  expect(api).toContain("?preview=1");
  expect(api).toContain("\"/admin/consent-texts\", \"POST\"");
  expect(api).toContain("/admin/consent-texts/${encodeURIComponent(consentTextId)}/publish");
  expect(api).toContain("/admin/consent-texts/${encodeURIComponent(consentTextId)}/retire");
});

test("creation never sends a hash and starts from a template", () => {
  const forms = source("apps/admin/app/consent-texts/consent-forms.tsx");
  const actions = source("apps/admin/app/lib/consent-actions.ts");
  const list = source("apps/admin/app/consent-texts/page.tsx");
  expect(forms).toContain("applyTemplate");
  expect(forms).toContain("bodyTemplate");
  expect(forms).toContain("name=\"content\"");
  expect(forms).toContain("Motif (audite)");
  for (const name of ["purpose", "countryId", "productId", "channel", "recipientCategory", "language", "version", "reason"]) {
    expect(forms).toContain(`name="${name}"`);
  }
  expect(forms).not.toContain("name=\"contentHash\"");
  expect(actions).not.toContain("contentHash");
  expect(actions).toContain("\"use server\"");
  expect(list).toContain("readConsentTextTemplates");
  for (const filter of ["countryId", "productId", "purpose", "language", "status"]) {
    expect(list).toContain(`name="${filter}"`);
  }
});

test("the detail screen shows hash, preview and supersession, and publication goes through a confirmation", () => {
  const detail = source("apps/admin/app/consent-texts/[consentTextId]/page.tsx");
  const forms = source("apps/admin/app/consent-texts/consent-forms.tsx");
  expect(detail).toContain("readAdminConsentText(consentTextId, { preview: true })");
  expect(detail).toContain("text.contentHash");
  expect(detail).toContain("text.preview");
  expect(detail).toContain("text.supersededBy");
  expect(detail).toContain("canApprovePublicActivation(session.profile.roles)");
  expect(forms).toContain("ConfirmDialog");
  expect(forms).toContain("data-consent-form\": \"publish\"");
  expect(forms).toContain("data-consent-form=\"retire\"");
});

test("a refused publication lists the failing consent controls in French", () => {
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  const actions = source("apps/admin/app/lib/consent-actions.ts");
  const result = source("apps/admin/app/lib/ui/catalog-action-result.tsx");
  for (const control of ["content_missing", "content_hash_mismatch", "forbidden_wording", "recipient_variable_missing", "technical_role_missing"]) {
    expect(messages).toContain(`${control}:`);
  }
  expect(messages).toContain("CONSENT_TEXT_INVALID");
  expect(actions).toContain("blockers: result.blockers");
  expect(result).toContain("blockerLabel(blocker)");
});

test("consent text copy avoids regulated or promotional wording", () => {
  for (const path of consentFiles) {
    const content = source(path);
    for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
      expect(content, `${path} ${forbidden}`).not.toContain(forbidden);
    }
  }
});
