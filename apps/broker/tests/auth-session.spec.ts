import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
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

interface MiddlewareOutcome {
  path: string;
  status: number;
  next: string | null;
  location: string | null;
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
  expect(loginPage).toContain("DevAccountPicker");
});

test("broker local demo account selector is gated to local app env", async () => {
  const actionSource = source("apps/broker/app/lib/dev-demo-login-actions.ts");
  const accountsSource = source("apps/broker/app/lib/dev-demo-accounts.ts");
  const pickerSource = source("apps/broker/app/login/dev-account-picker.tsx");

  expect(accountsSource).toContain("process.env.APP_ENV === \"local\"");
  expect(accountsSource).toContain("process.env.NODE_ENV !== \"production\"");
  expect(actionSource).toContain("isLocalBrokerDemoLoginEnabled()");
  expect(actionSource).toContain("signActorToken");
  expect(actionSource).toContain("local_demo_broker_login.selected");
  expect(pickerSource).toContain("requestSubmit");
  expect(accountsSource).toContain("starter.owner@broker.example");
  expect(accountsSource).toContain("enterprise.owner@broker.example");
});

test("broker runtime client uses bearer authorization and no simulation headers", async () => {
  const apiSource = source("apps/broker/app/lib/broker-api.ts");

  expect(apiSource).toContain("Authorization: `Bearer ${token}`");
  expect(apiSource).toContain("session_expired");
  expect(apiSource).toContain("status: \"error\"");
  expect(apiSource).toContain("status: \"forbidden\"");
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
  expect(middlewareSource).toContain("normalizedPathname === \"/crm\"");
  expect(middlewareSource).toContain("normalizedPathname.startsWith(\"/crm/\")");
});

test("broker middleware allows Starter CRM landing and blocks active CRM subroutes", async () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "--eval", `
    import { NextRequest } from "next/server";
    import { middleware } from "./apps/broker/middleware.ts";

    globalThis.fetch = async () => new Response(JSON.stringify({
      roles: ["broker_owner_starter"],
      partnerPlan: "starter",
      mfaVerified: true
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const request = (pathname) => new NextRequest(\`http://broker.local\${pathname}\`, {
      headers: { cookie: "assurmatch_backoffice_token=test-token" }
    });
    const paths = ["/crm", "/crm/", "/crm/leads", "/crm/leads/demo-lead"];
    const outcomes = [];

    for (const path of paths) {
      const response = await middleware(request(path));
      outcomes.push({
        path,
        status: response.status,
        next: response.headers.get("x-middleware-next"),
        location: response.headers.get("location")
      });
    }

    process.stdout.write(JSON.stringify(outcomes));
  `], { cwd: process.cwd(), encoding: "utf8" });

  const outcomes = JSON.parse(output) as MiddlewareOutcome[];
  expect(outcomes).toEqual([
    { path: "/crm", status: 200, next: "1", location: null },
    { path: "/crm/", status: 200, next: "1", location: null },
    { path: "/crm/leads", status: 307, next: null, location: "http://broker.local/login?error=starter_crm_denied" },
    { path: "/crm/leads/demo-lead", status: 307, next: null, location: "http://broker.local/login?error=starter_crm_denied" }
  ]);
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
