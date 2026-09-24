import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the admin screen administers quote form definitions through the admin API", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/quote-form-definitions/page.tsx");
  const forms = source("apps/admin/app/quote-form-definitions/quote-form-forms.tsx");
  const actions = source("apps/admin/app/quote-form-definitions/actions.ts");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readQuoteFormDefinitions");
  expect(api).toContain("createQuoteFormDefinition");
  expect(api).toContain("publishQuoteFormDefinition");
  expect(api).toContain("retireQuoteFormDefinition");
  expect(api).toContain("/admin/quote-form-definitions");
  expect(page).toContain("Formulaires de demande de devis");
  expect(forms).toContain("Creer un brouillon");
  expect(forms).toContain("Publier une version");
  expect(forms).toContain("Retirer une version");
  expect(forms).toContain("Motif (audite)");
  expect(actions).toContain("revalidatePath(\"/quote-form-definitions\")");
  // The screen was a stub that nothing linked to, so reachability is part of the fix.
  expect(shell).toContain("href: \"/quote-form-definitions\"");
});

test("publishing states plainly that it exposes the form and rotates the version", () => {
  const forms = source("apps/admin/app/quote-form-definitions/quote-form-forms.tsx");
  const page = source("apps/admin/app/quote-form-definitions/page.tsx");

  expect(forms).toContain("Publier expose ce formulaire aux visiteurs");
  expect(forms).toContain("lie la version du texte de consentement");
  expect(forms).toContain("est retiree dans la meme operation");
  expect(forms).toContain("toujours cree en brouillon");
  expect(page).toContain("Une seule version publiee par pays, produit et langue");
  expect(page).toContain("Un champ sensible n'est publiable que si le flag produit correspondant est ouvert");
});

test("the screen warns when no version is published, matching the activation checklist", () => {
  const page = source("apps/admin/app/quote-form-definitions/page.tsx");

  expect(page).toContain("la demande de devis est indisponible");
  expect(page).toContain("le parcours de demande de devis reste indisponible cote public");
});

test("quote form administration copy avoids regulated or promotional wording", () => {
  for (const path of [
    "apps/admin/app/quote-form-definitions/page.tsx",
    "apps/admin/app/quote-form-definitions/quote-form-forms.tsx",
    "apps/admin/app/quote-form-definitions/actions.ts"
  ]) {
    const content = source(path);
    for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
      expect(content).not.toContain(forbidden);
    }
  }
});
