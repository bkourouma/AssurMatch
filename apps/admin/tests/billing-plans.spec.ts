import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin billing page manages plans, drafts and packs without any payment control", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/billing/page.tsx");
  const actions = source("apps/admin/app/lib/billing-actions.ts");

  expect(api).toContain("/admin/billing/plans");
  expect(api).toContain("/admin/billing/invoices");
  expect(api).toContain("/admin/billing/packs");
  expect(page).toContain("Tarifs par plan et pays");
  expect(page).toContain("Brouillons mensuels non facturables");
  expect(page).toContain("Packs de leads prepayes");
  expect(page).toContain("aucune facture n'est emise");
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/admin/billing/invoices/recompute");
});

test("broker CRM page shows lead consumption without payment wording (DASH-B-008)", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/crm/page.tsx");

  expect(api).toContain("/broker/billing/statement");
  expect(page).toContain("Consommation et facturation");
  expect(page).toContain("Leads factures (brouillon)");
  expect(page).toContain("Credits pack restants");
  expect(page).toContain("paiement: desactive");
});

test("billing surfaces avoid payment, issued-invoice and regulated wording", () => {
  const admin = source("apps/admin/app/billing/page.tsx").toLowerCase();
  const broker = source("apps/broker/app/crm/page.tsx").toLowerCase();
  for (const forbidden of ["payer maintenant", "facture emise", "acheter", "souscrire maintenant", "contrat valide", "garantie acceptee"]) {
    expect(admin).not.toContain(forbidden);
    expect(broker).not.toContain(forbidden);
  }
});
