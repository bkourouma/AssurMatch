import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const forbiddenRuntimeHeaders = [
  "x-assurmatch-actor-id",
  "x-assurmatch-roles",
  "x-assurmatch-partner-tenant-id",
  "x-assurmatch-partner-plan",
  "x-assurmatch-country-scopes",
  "x-assurmatch-product-scopes",
  "x-assurmatch-mfa-verified"
];

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin login stores bearer token in an http-only back-office session cookie", async () => {
  const actionSource = source("apps/admin/app/lib/backoffice-session-actions.ts");
  const loginPage = source("apps/admin/app/login/page.tsx");

  expect(actionSource).toContain("/auth/login");
  expect(actionSource).toContain("httpOnly: true");
  expect(actionSource).toContain("BACKOFFICE_TOKEN_COOKIE");
  expect(actionSource).toContain("/auth/logout");
  expect(loginPage).toContain("Connexion admin");
  expect(loginPage).toContain("MFA requise");
  expect(loginPage).toContain("DevAccountPicker");
});

test("admin local demo account selector is gated to local app env", async () => {
  const actionSource = source("apps/admin/app/lib/dev-demo-login-actions.ts");
  const accountsSource = source("apps/admin/app/lib/dev-demo-accounts.ts");
  const pickerSource = source("apps/admin/app/login/dev-account-picker.tsx");
  const seedSource = source("scripts/local-app/seed-broker-demo.ts");

  expect(accountsSource).toContain('process.env.APP_ENV === "local"');
  expect(accountsSource).toContain('process.env.NODE_ENV !== "production"');
  expect(accountsSource).toContain("super.admin@assurmatch.local");
  expect(accountsSource).toContain("compliance.admin@assurmatch.local");
  expect(actionSource).toContain("signActorToken");
  expect(actionSource).toContain("mfaVerified: true");
  expect(actionSource).toContain("local_demo_admin_login.selected");
  expect(actionSource).toContain("BACKOFFICE_TOKEN_COOKIE");
  expect(actionSource).toContain("surface: \"admin\"");
  expect(pickerSource).toContain("requestSubmit");
  expect(seedSource).toContain("seedAdminUsers");
  expect(seedSource).toContain("super.admin@assurmatch.local");
});

test("admin runtime client uses bearer authorization and no simulation headers", async () => {
  const apiSource = source("apps/admin/app/lib/admin-api.ts");

  expect(apiSource).toContain("Authorization: `Bearer ${token}`");
  expect(apiSource).toContain("session_expired");
  expect(apiSource).toContain("ok: false");
  for (const header of forbiddenRuntimeHeaders) {
    expect(apiSource).not.toContain(header);
  }
});

test("admin middleware redirects invalid sessions and blocks broker profiles", async () => {
  const middlewareSource = source("apps/admin/middleware.ts");

  expect(middlewareSource).toContain("/auth/me");
  expect(middlewareSource).toContain("session_expired");
  expect(middlewareSource).toContain("mfa_required");
  expect(middlewareSource).toContain("access_denied");
  expect(middlewareSource).toContain("ADMIN_ROLES");
});

test("admin home handles 401 and 403 states without exposing partial success", async () => {
  const pageSource = source("apps/admin/app/page.tsx");

  expect(pageSource).toContain("readBackOfficeSession");
  expect(pageSource).toContain("Acces refuse");
  expect(pageSource).toContain("Acces sante systeme refuse");
  expect(pageSource).toContain("logoutAction");
});
