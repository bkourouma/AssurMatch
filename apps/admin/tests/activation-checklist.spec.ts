import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin activation checklist client and page are read-only", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/activation-checklist/page.tsx");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readActivationChecklist");
  expect(api).toContain("/admin/activation-checklist");
  expect(page).toContain("Checklist d'activation");
  expect(page).toContain("readActivationChecklist");
  expect(page).toContain("Cette surface ne modifie aucun flag");
  expect(shell).toContain("/activation-checklist");
  expect(page).not.toContain("PATCH");
  expect(page).not.toContain("POST");
});

test("admin activation checklist avoids regulated public wording", () => {
  const page = source("apps/admin/app/activation-checklist/page.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});
