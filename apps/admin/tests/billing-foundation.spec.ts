import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("billing foundation page is read-only and payment-free", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/billing/page.tsx");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readBillingFoundation");
  expect(api).toContain("/admin/billing/foundation");
  expect(page).toContain("Billing sans paiements");
  expect(page).toContain("Aucun encaissement, prime, paiement ou emission de facture");
  expect(page).toContain("Reference non facturable");
  expect(page).toContain("payments_enabled: desactive");
  expect(page).toContain("collection: desactivee");
  expect(page).not.toContain("writeAdmin");
  expect(page).not.toContain("POST");
  expect(page).not.toContain("PATCH");
  expect(shell).toContain("/billing");
});

test("billing foundation avoids regulated sales wording", () => {
  const page = source("apps/admin/app/billing/page.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});
