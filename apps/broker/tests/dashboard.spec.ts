import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker dashboard API client exposes readBrokerDashboard with bearer token", () => {
  const apiSource = source("apps/broker/app/lib/broker-api.ts");
  expect(apiSource).toContain("readBrokerDashboard");
  expect(apiSource).toContain("/broker/dashboard");
  expect(apiSource).toContain("Authorization: `Bearer ${token}`");
});

test("broker home page consumes readBrokerDashboard and renders refusal/empty states", () => {
  const home = source("apps/broker/app/page.tsx");
  expect(home).toContain("readBrokerDashboard");
  expect(home).toContain("Acces dashboard refuse");
  expect(home).toContain("Alertes licence");
});

test("broker CRM page consumes readBrokerDashboard and gates the CRM section", () => {
  const crm = source("apps/broker/app/crm/page.tsx");
  expect(crm).toContain("readBrokerDashboard");
  expect(crm).toContain("Section CRM indisponible");
  expect(crm).toContain("Pipeline par statut");
  expect(crm).toContain("Indicateurs operationnels internes");
});

test("broker dashboard surfaces avoid forbidden wording", () => {
  const home = source("apps/broker/app/page.tsx");
  const crm = source("apps/broker/app/crm/page.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(home).not.toContain(forbidden);
    expect(crm).not.toContain(forbidden);
  }
});
