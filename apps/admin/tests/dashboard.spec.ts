import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin api client exposes readAdminDashboard and readComplianceAlerts", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  expect(api).toContain("readAdminDashboard");
  expect(api).toContain("readComplianceAlerts");
  expect(api).toContain("/admin/dashboard");
  expect(api).toContain("/admin/dashboard/compliance-alerts");
  expect(api).toContain("Authorization: `Bearer ${token}`");
});

test("admin home page renders dashboard summary section", () => {
  const home = source("apps/admin/app/page.tsx");
  expect(home).toContain("readAdminDashboard");
  expect(home).toContain("Dashboard plateforme synthese");
  expect(home).toContain("Acces dashboard plateforme refuse");
});

test("admin dashboard page renders aggregates and feature flag summary", () => {
  const dashboard = source("apps/admin/app/dashboard/page.tsx");
  expect(dashboard).toContain("Dashboard plateforme");
  expect(dashboard).toContain("Volumes de leads");
  expect(dashboard).toContain("Feature flags sensibles");
  expect(dashboard).toContain("Alertes conformite");
  expect(dashboard).toContain("signaux de pilotage");
});

test("admin compliance alerts page paginates and refuses without admin", () => {
  const page = source("apps/admin/app/dashboard/compliance-alerts/page.tsx");
  expect(page).toContain("readComplianceAlerts");
  expect(page).toContain("Acces refuse");
  expect(page).toContain("Categorie");
});

test("admin dashboard pages avoid forbidden wording", () => {
  const home = source("apps/admin/app/page.tsx");
  const dashboard = source("apps/admin/app/dashboard/page.tsx");
  const alerts = source("apps/admin/app/dashboard/compliance-alerts/page.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(home).not.toContain(forbidden);
    expect(dashboard).not.toContain(forbidden);
    expect(alerts).not.toContain(forbidden);
  }
});
