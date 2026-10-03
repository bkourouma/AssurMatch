import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { e2eEnv } from "./env";
import { totp } from "./totp";

// Admin and broker back-office access through their real screens (activation, MFA enrolment, login
// + TOTP). Both apps share the field ids of their auth forms (#activate-*, #mfa-code, #login-*).

export interface BackOfficeAccount {
  app: "admin" | "broker";
  email: string;
  password: string;
  /** Base32 TOTP secret captured at enrolment. */
  totpSecret: string;
  /** Activation link read from Mailpit, until the account is activated. */
  activationLink?: string;
}

export function appUrl(app: BackOfficeAccount["app"]): string {
  return app === "admin" ? e2eEnv.adminUrl : e2eEnv.brokerUrl;
}

/** A fresh, isolated browser context per app (no cookie is ever shared between apps). */
export async function newAppContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return browser.newContext({ baseURL, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
}

/** Generates a TOTP that is not about to expire (avoids a code issued in the last second of a step). */
export async function freshTotp(secret: string): Promise<string> {
  const remaining = 30 - Math.floor(Date.now() / 1000) % 30;
  if (remaining < 4) await new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 250));
  return totp(secret);
}

/**
 * Consumes an activation link, sets the password, enrols MFA and verifies the first TOTP code.
 * Returns the TOTP secret shown once on the enrolment screen.
 */
export async function activateWithMfa(page: Page, activationLink: string, password: string): Promise<string> {
  await page.goto(activationLink);
  await expect(page.locator("#activate-token")).not.toHaveValue("");
  await page.locator("#activate-password").fill(password);
  await page.getByRole("button", { name: /Activer/u }).click();
  await page.waitForURL(/\/mfa/u);
  await page.getByRole("button", { name: /Generer secret/u }).click();
  const secretLine = page.getByText(/Secret TOTP/u);
  await expect(secretLine).toBeVisible();
  const secret = (await secretLine.locator("code").textContent())?.trim() ?? "";
  expect(secret, "TOTP secret shown at enrolment").toMatch(/^[A-Z2-7]{16,}$/u);
  await verifyTotp(page, secret);
  return secret;
}

export async function verifyTotp(page: Page, secret: string): Promise<void> {
  await page.locator("#mfa-code").fill(await freshTotp(secret));
  await page.getByRole("button", { name: /Verifier MFA|Vérifier/u }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/mfa"));
}

/** Password + TOTP login (sessions last 15 minutes: long journeys log in again when needed). */
export async function login(page: Page, account: BackOfficeAccount, returnTo = "/"): Promise<void> {
  await page.goto(`${appUrl(account.app)}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  if (new URL(page.url()).pathname.startsWith("/mfa")) await verifyTotp(page, account.totpSecret);
}

/** Opens `path`, logging in again first if the session expired or was never opened. */
export async function openAs(page: Page, account: BackOfficeAccount, path: string): Promise<void> {
  await page.goto(`${appUrl(account.app)}${path}`);
  const pathname = new URL(page.url()).pathname;
  if (pathname.startsWith("/login") || pathname.startsWith("/mfa")) {
    await login(page, account, path);
    await page.goto(`${appUrl(account.app)}${path}`);
  }
}

/** Strong random-enough password for throwaway e2e accounts (12+ characters, mixed classes). */
export function e2ePassword(label: string): string {
  return `E2e-${label}-${Math.random().toString(36).slice(2, 10)}-Pw!9`;
}
