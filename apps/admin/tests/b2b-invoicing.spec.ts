import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin billing page issues invoices, records manual payments and credit notes (spec 060)", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/billing/page.tsx");
  const actions = source("apps/admin/app/lib/billing-actions.ts");

  expect(api).toContain("/admin/billing/issued-invoices");
  expect(api).toContain("/admin/billing/accounts/");
  expect(page).toContain('{ key: "factures", label: "Factures" }');
  expect(page).toContain('{ key: "comptes", label: "Comptes" }');
  expect(page).toContain("Emettre la facture d'un brouillon");
  expect(page).toContain("Enregistrer un paiement recu");
  expect(page).toContain("Emettre un avoir");
  expect(page).toContain("Attribuer un pack apres paiement constate");
  expect(page).toContain("/billing/invoices/${invoice.id}/pdf");
  for (const method of ["bank_transfer", "mobile_money", "cheque", "other"]) expect(page).toContain(`"${method}"`);
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/admin/billing/issued-invoices");
  expect(actions).toContain("/payments");
  expect(actions).toContain("/credit-note");
  expect(actions).toContain("invoiceId");
});

test("admin invoice PDFs are served through an authenticated server-side proxy", () => {
  const proxy = source("apps/admin/app/lib/billing-pdf-proxy.ts");
  const invoiceRoute = source("apps/admin/app/billing/invoices/[id]/pdf/route.ts");
  const creditNoteRoute = source("apps/admin/app/billing/credit-notes/[id]/pdf/route.ts");

  expect(proxy).toContain("getBackOfficeToken");
  expect(proxy).toContain("Authorization: `Bearer ${token}`");
  expect(proxy).toContain('"cache-control": "no-store"');
  expect(proxy).toContain("UUID.test(id)");
  expect(invoiceRoute).toContain('proxyBillingPdf("issued-invoices", id)');
  expect(creditNoteRoute).toContain('proxyBillingPdf("credit-notes", id)');
});

test("admin invoicing never offers online payment or premium collection", () => {
  const page = source("apps/admin/app/billing/page.tsx").toLowerCase();
  const actions = source("apps/admin/app/lib/billing-actions.ts").toLowerCase();
  for (const forbidden of ["payer maintenant", "payer en ligne", "carte bancaire", "lien de paiement", "souscrire", "acheter"]) {
    expect(page).not.toContain(forbidden);
    expect(actions).not.toContain(forbidden);
  }
  expect(page).toContain("aucun paiement en ligne");
  expect(page).toContain("hors plateforme");
});
