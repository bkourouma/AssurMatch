import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin scoring page exposes weighted rules, offer validation and suspension through the admin API", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/scoring/page.tsx");
  const forms = source("apps/admin/app/scoring/scoring-forms.tsx");
  const actions = source("apps/admin/app/scoring/actions.ts");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("/admin/scoring-rules");
  expect(api).toContain("/admin/offers");
  expect(api).toContain("/validate");
  expect(api).toContain("/suspend");
  expect(page).toContain("Score indicatif et offres");
  expect(page).toContain("ne designe jamais une meilleure offre");
  expect(forms).toContain("Poids (total 100)");
  expect(forms).toContain("Motif (audite)");
  expect(actions).toContain("doivent totaliser 100");
  expect(shell).toContain("/scoring");
});

test("scoring page avoids regulated wording", () => {
  const files = ["apps/admin/app/scoring/page.tsx", "apps/admin/app/scoring/scoring-forms.tsx"].map(source).join("\n");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(files).not.toContain(forbidden);
  }
});
