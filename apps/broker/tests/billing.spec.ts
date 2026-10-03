import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { canReadBrokerBilling } from "../app/lib/broker-permissions";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const profile = (roles: string[], partnerPlan: "starter" | "pro" | "enterprise" = "starter") => ({ roles, partnerTenantId: "tenant-a", partnerPlan, mfaVerified: true });

test("broker billing page is available to every plan and lists invoices, balance and packs (spec 060 G-05)", () => {
  const page = source("apps/broker/app/billing/page.tsx");
  const api = source("apps/broker/app/lib/broker-api.ts");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");

  expect(api).toContain("/broker/billing/account");
  expect(api).toContain("/broker/billing/statement");
  expect(page).toContain("Facturation du cabinet");
  expect(page).toContain("Solde a regler");
  expect(page).toContain("Factures et avoirs");
  expect(page).toContain("Packs de leads");
  expect(page).toContain("/billing/invoices/${invoice.id}/pdf");
  expect(page).toContain("canReadBrokerBilling(session.profile)");
  // The billing entry is not gated by plan, unlike the CRM entries.
  expect(shell).toContain('{ label: "Facturation", href: "/billing", icon: "receipt", match: ["/billing"] }');
  expect(page).not.toContain("isStarterCrmDenied");
});

test("broker invoice PDFs go through a server-side proxy that carries the session", () => {
  const proxy = source("apps/broker/app/lib/billing-pdf-proxy.ts");
  expect(proxy).toContain("getBackOfficeToken");
  expect(proxy).toContain("/broker/billing/${kind}/${id}/pdf");
  expect(proxy).toContain('"cache-control": "no-store"');
  expect(source("apps/broker/app/billing/invoices/[id]/pdf/route.ts")).toContain('proxyBrokerBillingPdf("invoices", id)');
  expect(source("apps/broker/app/billing/credit-notes/[id]/pdf/route.ts")).toContain('proxyBrokerBillingPdf("credit-notes", id)');
});

test("owners, managers and read-only members read billing; agents do not", () => {
  expect(canReadBrokerBilling(profile(["broker_owner_starter"]))).toBe(true);
  expect(canReadBrokerBilling(profile(["broker_owner_pro"], "pro"))).toBe(true);
  expect(canReadBrokerBilling(profile(["broker_manager"], "pro"))).toBe(true);
  expect(canReadBrokerBilling(profile(["broker_read_only"], "enterprise"))).toBe(true);
  expect(canReadBrokerBilling(profile(["broker_agent"], "pro"))).toBe(false);
  expect(canReadBrokerBilling(profile(["finance_admin"]))).toBe(false);
});

test("broker billing wording stays manual: no online payment, no premium collection", () => {
  const page = source("apps/broker/app/billing/page.tsx").toLowerCase();
  for (const forbidden of ["payer maintenant", "payer en ligne", "carte bancaire", "lien de paiement", "souscrire", "acheter"]) {
    expect(page).not.toContain(forbidden);
  }
  expect(page).toContain("hors plateforme");
  expect(page).toContain("aucun paiement en ligne");
});
