import { expect, test } from "@playwright/test";
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
  expect(pageSource).toContain("Accès refusé");
  expect(pageSource).toContain("Accès santé système refusé");
  expect(pageSource).toContain("logoutAction");
});

test("admin session cookie name is distinct from the broker back-office cookie", async () => {
  const authSource = source("apps/admin/app/lib/backoffice-auth.ts");
  const middlewareSource = source("apps/admin/middleware.ts");

  expect(authSource).toContain('BACKOFFICE_TOKEN_COOKIE = "assurmatch_admin_token"');
  expect(middlewareSource).toContain('TOKEN_COOKIE = "assurmatch_admin_token"');
  expect(authSource).not.toContain("assurmatch_broker_token");
  expect(middlewareSource).not.toContain("assurmatch_broker_token");
  expect(authSource).not.toContain("assurmatch_backoffice_token");
  expect(middlewareSource).not.toContain("assurmatch_backoffice_token");
});

// --- Spec 063 (FR-A04 / FR-A11): MFA trusted devices, admin back-office ---------------------------------

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

test("admin trusted-device cookie is httpOnly, SameSite=Strict, secure in production and named per app", async () => {
  const authSource = source("apps/admin/app/lib/backoffice-auth.ts");
  const setter = functionBody(authSource, "export async function setTrustedDeviceCookie");

  expect(authSource).toContain('BACKOFFICE_DEVICE_COOKIE = "assurmatch_admin_device"');
  expect(authSource).toContain("BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60");
  expect(setter).toContain("name: BACKOFFICE_DEVICE_COOKIE");
  expect(setter).toContain("httpOnly: true");
  expect(setter).toContain('sameSite: "strict"');
  expect(setter).toContain('secure: process.env.NODE_ENV === "production"');
  expect(setter).toContain('path: "/"');
  expect(setter).toContain("Math.min(BACKOFFICE_DEVICE_COOKIE_MAX_AGE_SECONDS");
  // The session cookie keeps its own name and is not the device cookie.
  expect(authSource).toContain('BACKOFFICE_TOKEN_COOKIE = "assurmatch_admin_token"');
});

test("admin trusted-device cookie name never leaks into the broker back-office", async () => {
  for (const file of sourcesUnder("apps/admin")) {
    expect(source(file), file).not.toContain("assurmatch_broker_device");
  }
  for (const file of sourcesUnder("apps/broker")) {
    expect(source(file), file).not.toContain("assurmatch_admin_device");
  }
  // The Next middleware does not read the device cookie: only server actions forward it to the API.
  expect(source("apps/admin/middleware.ts")).not.toContain("_device");
});

test("admin login action forwards the trusted-device token and clears the cookie when the API rejects it", async () => {
  const actionSource = source("apps/admin/app/lib/backoffice-session-actions.ts");
  const apiSource = source("apps/admin/app/lib/admin-api.ts");
  const login = functionBody(actionSource, "export async function loginAction");

  expect(login).toContain("readTrustedDeviceToken()");
  expect(login).toContain("loginBackOffice(email, password, trustedDeviceToken)");
  expect(login).toContain("session.trustedDeviceRejected");
  expect(login).toContain("clearTrustedDeviceCookie()");
  expect(login).toContain("if (session.mfaRequired) redirect(`/mfa?returnTo=");
  expect(apiSource).toContain("trustedDeviceToken");
  expect(apiSource).toContain("/auth/login");
});

test("admin logout keeps the trusted-device cookie (the 30-day trust survives logout)", async () => {
  const actionSource = source("apps/admin/app/lib/backoffice-session-actions.ts");
  const logout = functionBody(actionSource, "export async function logoutAction");

  expect(logout).toContain("cookieStore.delete(BACKOFFICE_TOKEN_COOKIE)");
  expect(logout).not.toContain("BACKOFFICE_DEVICE_COOKIE");
  expect(logout).not.toContain("clearTrustedDeviceCookie");
  expect(logout).not.toContain("trusted-devices");
});

test("admin MFA verification form offers the unchecked trust checkbox and forwards it with a coarse device label", async () => {
  const formSource = source("apps/admin/app/auth-flow-form.tsx");
  const actionSource = source("apps/admin/app/lib/auth-flow-actions.ts");
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
  expect(panel).toContain("Vérifier MFA");
  expect(panel).toContain("Générer secret et codes de secours");

  expect(verify).toContain('formData.get("trustDevice") === "on"');
  expect(verify).toContain("deviceLabelFromUserAgent");
  expect(verify).toContain('get("user-agent")');
  expect(verify).not.toMatch(/x-forwarded-for|remoteAddress/iu);
  expect(verify).toContain("setTrustedDeviceCookie(session.trustedDevice.token, session.trustedDevice.expiresAt)");

  const authSource = source("apps/admin/app/lib/backoffice-auth.ts");
  expect(authSource).toContain(".slice(0, 120)");
});

test("admin MFA page hides the enrolment form for an enrolled account", async () => {
  const pageSource = source("apps/admin/app/mfa/page.tsx");
  const formSource = source("apps/admin/app/auth-flow-form.tsx");
  const authSource = source("apps/admin/app/lib/backoffice-auth.ts");
  const panel = functionBody(formSource, "export function MfaPanel");

  expect(authSource).toContain("mfaEnrolled?: boolean");
  expect(pageSource).toContain('session.status === "mfa_required" && session.profile.mfaEnrolled === true');
  expect(pageSource).toContain("mfaEnrolled={mfaEnrolled}");
  expect(pageSource).toContain('if (session.status === "authenticated") redirect(returnTo)');
  // The enrolment form is rendered only when not enrolled, or once an enrolment was attempted (one-time secret).
  expect(panel).toContain('(showEnrollment ?? !mfaEnrolled) || enrollState.status !== "idle"');
  expect(panel).toContain("enrollmentVisible ? (");
});

test("admin account security page lists trusted devices and exposes revoke-all", async () => {
  const pageSource = source("apps/admin/app/account/security/page.tsx");
  const formSource = source("apps/admin/app/auth-flow-form.tsx");
  const actionSource = source("apps/admin/app/lib/auth-flow-actions.ts");
  const apiSource = source("apps/admin/app/lib/admin-api.ts");
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
