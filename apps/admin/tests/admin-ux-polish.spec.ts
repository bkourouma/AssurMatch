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
  // The sidebar and the topbar now come from the shared AppShell, mounted with the admin route
  // table, the admin wording and the admin logout action.
  expect(shell).toContain("AppShell");
  expect(shell).toContain("logoutAction");
  expect(shell).toContain("logoutLabel=\"Deconnexion\"");
  expect(shell).toContain("Back-office Admin");
  for (const label of ["Dashboard", "Catalogue", "Partenaires", "Utilisateurs", "Feature flags", "Conformite", "Operations"]) {
    expect(shell).toContain(label);
  }
  // The logout button of the sidebar footer is gone: the user menu of the topbar is the only exit,
  // so the admin shell never renders a logout form of its own any more.
  expect(shell).not.toContain("<form action={logoutAction}>");
});

test("the shared shell keeps the admin and the courtier back-offices separate", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  const appShell = source("packages/ui/backoffice/shell/app-shell.tsx");
  // The package must carry no route, no access rule and no surface wording.
  for (const brokerRoute of ["/leads", "/crm", "/enterprise", "/notifications"]) {
    expect(shell).not.toContain(brokerRoute);
  }
  for (const surfaceWord of ["Navigation admin principale", "Deconnexion", "/quote-form-definitions", "/users\""]) {
    expect(appShell).not.toContain(surfaceWord);
  }
});

test("auth routes keep simplified presentation outside the admin shell", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  for (const route of ["/login", "/mfa", "/activate", "/password-change", "/password-reset"]) {
    expect(shell).toContain(route);
  }
  // The marker is now passed to the shared AuthShell as a data attribute map instead of being
  // written inline on a div, but it still has to reach the rendered auth screen unchanged.
  expect(shell).toContain("\"data-admin-auth-shell\": \"simple\"");
  expect(shell).toContain("AuthShell");
});

test("back-office css includes responsive shell and visible focus treatment", () => {
  // The admin stylesheet was replaced by the shared, `bo-` prefixed back-office stylesheet; the
  // layout imports it, so the responsive shell and the focus treatment are asserted there.
  const layout = source("apps/admin/app/layout.tsx");
  expect(layout).toContain("@assurmatch/ui/tokens.css");
  expect(layout).toContain("@assurmatch/ui/backoffice.css");

  const css = source("packages/ui/styles/backoffice.css");
  expect(css).toContain(".bo-shell");
  expect(css).toContain(".bo-sidebar");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("@media (max-width: 760px)");
  expect(css).toContain(".bo-grid--kpi");
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
