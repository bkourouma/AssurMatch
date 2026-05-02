import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("admin shell exposes sidebar, header, logout and required navigation", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  expect(shell).toContain("data-admin-shell");
  expect(shell).toContain("Navigation admin principale");
  expect(shell).toContain("admin-topbar");
  expect(shell).toContain("logoutAction");
  for (const label of ["Dashboard", "Catalogue", "Partenaires", "Utilisateurs", "Feature flags", "Conformite", "Operations"]) {
    expect(shell).toContain(label);
  }
});

test("auth routes keep simplified presentation outside the admin shell", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  for (const route of ["/login", "/mfa", "/activate", "/password-change", "/password-reset"]) {
    expect(shell).toContain(route);
  }
  expect(shell).toContain("data-admin-auth-shell=\"simple\"");
});

test("admin css includes responsive shell and visible focus treatment", () => {
  const css = source("apps/admin/app/globals.css");
  expect(css).toContain(".admin-shell");
  expect(css).toContain(".admin-sidebar");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("@media (max-width: 760px)");
  expect(css).toContain(".admin-grid--kpi");
});

test("dashboard pages render KPI cards and sensitive flag disabled states", () => {
  const home = source("apps/admin/app/page.tsx");
  const dashboard = source("apps/admin/app/dashboard/page.tsx");
  const viewModels = source("apps/admin/app/lib/ui/admin-view-models.ts");
  for (const label of ["Leads recus", "Leads transmis", "Leads refuses", "Leads non routes", "Licences expirees", "Licences < 30 jours", "Pays actifs", "Produits actifs", "Partenaires actifs", "Offres expirees"]) {
    expect(viewModels).toContain(label);
  }
  expect(home).toContain("KpiCard");
  expect(dashboard).toContain("KpiCard");
  expect(viewModels).toContain("payments_enabled");
  expect(viewModels).toContain("ai_recommendation_enabled");
  expect(viewModels).toContain("disabled");
});

test("existing admin pages use shared page structure", () => {
  for (const path of [
    "apps/admin/app/catalog/page.tsx",
    "apps/admin/app/partners/page.tsx",
    "apps/admin/app/users/page.tsx",
    "apps/admin/app/feature-flags/page.tsx",
    "apps/admin/app/compliance/page.tsx",
    "apps/admin/app/operations/page.tsx",
    "apps/admin/app/dashboard/page.tsx"
  ]) {
    const page = source(path);
    expect(page).toContain("PageHeader");
  }
});

test("admin source avoids forbidden regulated wording", () => {
  const combined = files("apps/admin/app").map((file) => source(file)).join("\n");
  for (const forbidden of ["Souscrire maintenant", "Contrat valide", "Contrat validé", "Garantie acceptee", "Garantie acceptée", "Acheter maintenant"]) {
    expect(combined).not.toContain(forbidden);
  }
});
