import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("spec 070 admin client exposes categories, versions and attestations", () => {
  const api = source("apps/admin/app/lib/lot4-catalog-api.ts");
  expect(api).toContain("/admin/product-categories");
  expect(api).toContain("/versions");
  expect(api).toContain("/admin/activation-attestations");
  expect(api).toContain("/admin/activation-attestations/revoke");
});

test("spec 070 categories page lists, creates and edits categories", () => {
  const page = source("apps/admin/app/catalog/categories/page.tsx");
  const forms = source("apps/admin/app/catalog/catalog-forms.tsx");
  const hub = source("apps/admin/app/catalog/page.tsx");
  const actions = source("apps/admin/app/lib/lot4-catalog-actions.ts");
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  expect(hub).toContain("/catalog/categories");
  expect(page).toContain("Catégories de produits");
  expect(page).toContain("productCount");
  expect(page).toContain("CreateCategoryForm");
  expect(forms).toContain('data-catalog-form="category-create"');
  expect(forms).toContain('data-catalog-form="category-update"');
  expect(forms).toContain("Nom (anglais)");
  expect(forms).toContain("Ordre d'affichage");
  expect(actions).toContain("createProductCategoryAction");
  expect(actions).toContain("updateProductCategoryAction");
  expect(messages).toContain("CATALOG_CATEGORY_IN_USE");
  expect(messages).toContain("des produits sont rattachés à cette catégorie");
});

test("spec 070 product form carries category, legal notice and required documents", () => {
  const forms = source("apps/admin/app/catalog/catalog-forms.tsx");
  const actions = source("apps/admin/app/lib/catalog-actions.ts");
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  for (const name of ["categoryId", "legalText_fr", "disclaimer_fr", "legalText_en", "disclaimer_en", "requiredDocumentKinds"]) {
    expect(forms).toContain(`name="${name}"`);
  }
  expect(forms).toContain("LEGAL_TEXT_MAX_LENGTH");
  expect(forms).toContain("DISCLAIMER_MAX_LENGTH");
  expect(messages).toContain("LEGAL_TEXT_MAX_LENGTH = 5000");
  expect(messages).toContain("DISCLAIMER_MAX_LENGTH = 1000");
  for (const label of ["Pièce d'identité", "Carte grise", "Permis de conduire", "Justificatif de domicile", "Formulaire médical", "Contrat d'assurance existant", "Autre"]) {
    expect(messages).toContain(label);
  }
  expect(actions).toContain("legalNoticeFields");
  expect(actions).toContain("requiredDocumentKindFields");
  expect(actions).toContain("createAdminProductWithContent");
  expect(actions).toContain("updateAdminProductWithContent");
});

test("spec 070 product page shows the version history with field diffs", () => {
  const page = source("apps/admin/app/catalog/products/[productId]/page.tsx");
  expect(page).toContain("Historique des conditions");
  expect(page).toContain("readAdminProductVersions");
  expect(page).toContain("authorLabel");
  expect(page).toContain("Aucune version enregistrée");
  expect(page).toContain("Création");
  expect(page).toContain("versionFieldLabel");
  expect(page).toContain("→");
  expect(page).toContain("Version courante");
});

test("spec 070 activation checklist offers attestation to compliance only", () => {
  const page = source("apps/admin/app/activation-checklist/page.tsx");
  const forms = source("apps/admin/app/activation-checklist/attestation-forms.tsx");
  const actions = source("apps/admin/app/lib/lot4-catalog-actions.ts");
  const messages = source("apps/admin/app/lib/catalog-messages.ts");
  expect(page).toContain("Attestation de conformité");
  expect(page).toContain("canApprovePublicActivation");
  expect(page).toContain("control.manual");
  expect(forms).toContain("Attester");
  expect(forms).toContain("Révoquer l&apos;attestation");
  expect(actions).toContain("ACTIVATION_ATTESTABLE_CONTROLS");
  expect(actions).toContain('revalidatePath');
  expect(actions).toContain("Note trop courte");
  expect(messages).toContain("country_deactivation_plan");
  expect(messages).toContain("product_dashboard_metrics");
  expect(page).not.toContain("PATCH");
});
