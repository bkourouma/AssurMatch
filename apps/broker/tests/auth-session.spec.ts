import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

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
  expect(middlewareSource).toContain("crm_requires_pro");
  expect(middlewareSource).not.toContain("starter_crm_denied");
  expect(source("apps/broker/app/page.tsx")).toContain("Le CRM est réservé aux formules Pro et Enterprise.");
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
      headers: { cookie: "assurmatch_broker_token=test-token" }
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
    { path: "/crm/leads", status: 307, next: null, location: "http://broker.local/?notice=crm_requires_pro" },
    { path: "/crm/leads/demo-lead", status: 307, next: null, location: "http://broker.local/?notice=crm_requires_pro" }
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

test("broker session cookie name is distinct from the admin back-office cookie", async () => {
  const authSource = source("apps/broker/app/lib/backoffice-auth.ts");
  const middlewareSource = source("apps/broker/middleware.ts");

  expect(authSource).toContain('BACKOFFICE_TOKEN_COOKIE = "assurmatch_broker_token"');
  expect(middlewareSource).toContain('TOKEN_COOKIE = "assurmatch_broker_token"');
  expect(authSource).not.toContain("assurmatch_admin_token");
  expect(middlewareSource).not.toContain("assurmatch_admin_token");
  expect(authSource).not.toContain("assurmatch_backoffice_token");
  expect(middlewareSource).not.toContain("assurmatch_backoffice_token");
});

// --- Spec 063 (FR-A04 / FR-A11): MFA trusted devices, broker back-office ---------------------------------

function sourcesUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "tests") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...sourcesUnder(full));
    else if (/\.(ts|tsx)$/u.test(entry.name)) files.push(full);
  }
  return files;
}

function functionBody(code: string, signature: string): string {
  const start = code.indexOf(signature);
  expect(start, `${signature} must exist`).toBeGreaterThanOrEqual(0);
  const next = code.indexOf("\nexport ", start + signature.length);
  return code.slice(start, next === -1 ? undefined : next);
}

test("broker trusted-device cookie is httpOnly, SameSite=Strict, secure in production and named per app", async () => {
  const authSource = source("apps/broker/app/lib/backoffice-auth.ts");
  const setter = functionBody(authSource, "export async function setTrustedDeviceCookie");

  expect(authSource).toContain('BACKOFFICE_DEVICE_COOKIE = "assurmatch_broker_device"');
  expect(authSource).toContain("BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60");
  expect(setter).toContain("name: BACKOFFICE_DEVICE_COOKIE");
  expect(setter).toContain("httpOnly: true");
  expect(setter).toContain('sameSite: "strict"');
  expect(setter).toContain('secure: process.env.NODE_ENV === "production"');
  expect(setter).toContain('path: "/"');
  expect(setter).toContain("Math.min(BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS");
  // The session cookie keeps its own name and is not the device cookie.
  expect(authSource).toContain('BACKOFFICE_TOKEN_COOKIE = "assurmatch_broker_token"');
});

test("broker trusted-device cookie name never leaks into the admin back-office", async () => {
  for (const file of sourcesUnder("apps/broker")) {
    expect(source(file), file).not.toContain("assurmatch_admin_device");
  }
  for (const file of sourcesUnder("apps/admin")) {
    expect(source(file), file).not.toContain("assurmatch_broker_device");
  }
  // The Next middleware does not read the device cookie: only server actions forward it to the API.
  expect(source("apps/broker/middleware.ts")).not.toContain("_device");
});

test("broker login action forwards the trusted-device token and clears the cookie when the API rejects it", async () => {
  const actionSource = source("apps/broker/app/lib/backoffice-session-actions.ts");
  const apiSource = source("apps/broker/app/lib/broker-api.ts");
  const login = functionBody(actionSource, "export async function loginAction");

  expect(login).toContain("readTrustedDeviceToken()");
  expect(login).toContain("loginBackOffice(email, password, trustedDeviceToken)");
  expect(login).toContain("session.trustedDeviceRejected");
  expect(login).toContain("clearTrustedDeviceCookie()");
  expect(login).toContain("if (session.mfaRequired) redirect(`/mfa?returnTo=");
  expect(apiSource).toContain("trustedDeviceToken");
  expect(apiSource).toContain("/auth/login");
});

test("broker logout keeps the trusted-device cookie (the 30-day trust survives logout)", async () => {
  const actionSource = source("apps/broker/app/lib/backoffice-session-actions.ts");
  const logout = functionBody(actionSource, "export async function logoutAction");

  expect(logout).toContain("cookieStore.delete(BACKOFFICE_TOKEN_COOKIE)");
  expect(logout).not.toContain("BACKOFFICE_DEVICE_COOKIE");
  expect(logout).not.toContain("clearTrustedDeviceCookie");
  expect(logout).not.toContain("trusted-devices");
});

test("broker MFA verification form offers the unchecked trust checkbox and forwards it with a coarse device label", async () => {
  const formSource = source("apps/broker/app/auth-flow-form.tsx");
  const actionSource = source("apps/broker/app/lib/auth-flow-actions.ts");
  const verify = functionBody(actionSource, "export async function verifyMfaAction");
  const panel = functionBody(formSource, "export function MfaPanel");

  expect(panel).toContain('name="trustDevice"');
  expect(panel).toContain("Faire confiance à cet appareil pendant 30 jours");
  expect(panel).toContain("Le code ne vous sera plus demandé sur cet appareil pendant 30 jours. Ne cochez pas sur un ordinateur partagé.");
  expect(panel).not.toContain("defaultChecked");
  expect(panel).not.toMatch(/checked[=\s]/u);
  // Existing field ids and button text used by the e2e helpers stay in place.
  expect(panel).toContain('id="mfa-code"');
  expect(panel).toContain('name="kind"');
  expect(panel).toContain("Verifier MFA");
  expect(panel).toContain("Generer secret et codes de secours");

  expect(verify).toContain('formData.get("trustDevice") === "on"');
  expect(verify).toContain("deviceLabelFromUserAgent");
  expect(verify).toContain('get("user-agent")');
  expect(verify).not.toMatch(/x-forwarded-for|remoteAddress/iu);
  expect(verify).toContain("setTrustedDeviceCookie(session.trustedDevice.token, session.trustedDevice.expiresAt)");

  const authSource = source("apps/broker/app/lib/backoffice-auth.ts");
  expect(authSource).toContain(".slice(0, 120)");
});

test("broker MFA page hides the enrolment form for an enrolled account", async () => {
  const pageSource = source("apps/broker/app/mfa/page.tsx");
  const formSource = source("apps/broker/app/auth-flow-form.tsx");
  const authSource = source("apps/broker/app/lib/backoffice-auth.ts");
  const panel = functionBody(formSource, "export function MfaPanel");

  expect(authSource).toContain("mfaEnrolled?: boolean");
  expect(pageSource).toContain('session.status === "mfa_required" && session.profile.mfaEnrolled === true');
  expect(pageSource).toContain("mfaEnrolled={mfaEnrolled}");
  expect(pageSource).toContain('if (session.status === "authenticated") redirect(returnTo)');
  // The enrolment form is rendered only when not enrolled, or once an enrolment was attempted (one-time secret).
  expect(panel).toContain('(showEnrollment ?? !mfaEnrolled) || enrollState.status !== "idle"');
  expect(panel).toContain("enrollmentVisible ? (");
});

test("broker account security page lists trusted devices and exposes revoke-all", async () => {
  const pageSource = source("apps/broker/app/account/security/page.tsx");
  const formSource = source("apps/broker/app/auth-flow-form.tsx");
  const actionSource = source("apps/broker/app/lib/auth-flow-actions.ts");
  const apiSource = source("apps/broker/app/lib/broker-api.ts");
  const revoke = functionBody(actionSource, "export async function revokeTrustedDevicesAction");

  expect(pageSource).toContain("Sécurité du compte");
  expect(pageSource).toContain("listTrustedDevices()");
  expect(pageSource).toContain("RevokeTrustedDevicesForm");
  expect(pageSource).toContain("/password-change");
  expect(pageSource).toContain('session.status === "mfa_required"');
  expect(pageSource).toContain("fr-FR");
  expect(formSource).toContain("Révoquer tous les appareils de confiance");
  expect(apiSource).toContain("/auth/trusted-devices");
  expect(apiSource).toContain('method: "DELETE"');
  // Revoking forgets the local cookie too and reports the count.
  expect(revoke).toContain("revokeTrustedDevices()");
  expect(revoke).toContain("clearTrustedDeviceCookie()");
  expect(revoke).toContain("result.revoked");
  // A password change revokes every device server side: the stale local cookie is dropped as well.
  expect(functionBody(actionSource, "export async function passwordChangeAction")).toContain("clearTrustedDeviceCookie()");
});
