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

test("broker login stores bearer token in an http-only back-office session cookie", async () => {
  const actionSource = source("apps/broker/app/lib/backoffice-session-actions.ts");
  const loginPage = source("apps/broker/app/login/page.tsx");

  expect(actionSource).toContain("/auth/login");
  expect(actionSource).toContain("httpOnly: true");
  expect(actionSource).toContain("BACKOFFICE_TOKEN_COOKIE");
  expect(actionSource).toContain("/auth/logout");
  expect(loginPage).toContain("Connexion");
  expect(loginPage).toContain("MFA requise");
});

test("broker runtime client uses bearer authorization and no simulation headers", async () => {
  const apiSource = source("apps/broker/app/lib/broker-api.ts");

  expect(apiSource).toContain("Authorization: `Bearer ${token}`");
  expect(apiSource).toContain("session_expired");
  for (const header of forbiddenRuntimeHeaders) {
    expect(apiSource).not.toContain(header);
  }
});

test("broker middleware redirects absent or invalid sessions and blocks Starter CRM", async () => {
  const middlewareSource = source("apps/broker/middleware.ts");

  expect(middlewareSource).toContain("/auth/me");
  expect(middlewareSource).toContain("session_expired");
  expect(middlewareSource).toContain("mfa_required");
  expect(middlewareSource).toContain("starter_crm_denied");
  expect(middlewareSource).toContain("profile.partnerPlan === \"starter\"");
});

test("broker pages render access denied states instead of protected fallback data", async () => {
  const leadsPage = source("apps/broker/app/leads/page.tsx");
  const crmPage = source("apps/broker/app/crm/leads/page.tsx");
  const detailPage = source("apps/broker/app/leads/[leadAssignmentId]/page.tsx");
  const crmDetailPage = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");

  expect(leadsPage).toContain("Aucune donnee protegee");
  expect(leadsPage).not.toContain("fallbackLeads");
  expect(crmPage).toContain("Aucune donnee CRM");
  expect(crmPage).not.toContain("fallbackLeads");
  expect(detailPage).toContain("Acces refuse");
  expect(crmDetailPage).toContain("Acces CRM refuse");
});
