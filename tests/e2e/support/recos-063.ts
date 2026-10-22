import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { appUrl, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { card, confirmInDialog } from "./ui";

// Spec 065 phase B / lot 063: building blocks of recos-063-mfa-disputes.spec.ts (MFA trusted devices, lead disputes).

export const BROKER_DEVICE_COOKIE = "assurmatch_broker_device";
export const ADMIN_DEVICE_COOKIE = "assurmatch_admin_device";
const ADMIN_TOKEN_COOKIE = "assurmatch_admin_token";
const BROKER_TOKEN_COOKIE = "assurmatch_broker_token";

export function deviceCookieName(app: BackOfficeAccount["app"]): string {
  return app === "admin" ? ADMIN_DEVICE_COOKIE : BROKER_DEVICE_COOKIE;
}

/** Value of a cookie of the context (undefined when absent). */
export async function cookieValue(context: BrowserContext, name: string): Promise<string | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === name)?.value;
}

/** The API bearer token of the back-office session held by `page` (admin or broker cookie). */
export async function sessionToken(page: Page, app: BackOfficeAccount["app"]): Promise<string> {
  const value = await cookieValue(page.context(), app === "admin" ? ADMIN_TOKEN_COOKIE : BROKER_TOKEN_COOKIE);
  if (!value) throw new Error(`no ${app} session cookie: open a back-office page with openAs first`);
  return value;
}

/** Signs out through the user menu of the shell (the trusted-device cookie is kept on purpose). */
export async function logoutFromShell(page: Page): Promise<void> {
  await page.locator(".bo-user-menu__button").click();
  await page.getByRole("menuitem", { name: /D[ée]connexion/u }).click();
  await page.waitForURL(/\/login/u);
}

/** Submits a wrong password on the login screen: the app must stay on /login and never reach /mfa. */
export async function expectWrongPasswordRefused(page: Page, account: BackOfficeAccount): Promise<void> {
  await page.goto(`${appUrl(account.app)}/login`);
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(`${account.password}-wrong`);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/login") && url.searchParams.has("error"));
  expect(new URL(page.url()).pathname.startsWith("/mfa")).toBe(false);
  await expect(page.locator("#mfa-code")).toHaveCount(0);
}

/** Rows of the "Appareils de confiance actifs" table of /account/security (header excluded). */
export function trustedDeviceRows(page: Page): Locator {
  return page.getByRole("table", { name: "Appareils de confiance actifs" }).getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
}

/** The admin decision form of /billing?tab=contestations (detail card of one dispute). */
export function disputeDetailCard(page: Page, reference: string): Locator {
  return card(page, new RegExp(`^\\s*Contestation du lead ${reference}\\s*$`, "u"));
}

/** Opens the detail of the dispute of a lead reference in the admin "Contestations" tab. */
export async function openDisputeDetail(page: Page, reference: string, partnerName: string): Promise<void> {
  await page.goto(`${e2eEnv.adminUrl}/billing?tab=contestations`);
  const row = page.getByRole("row").filter({ hasText: reference }).filter({ hasText: partnerName }).first();
  await expect(row, `dispute of ${reference} in the list`).toBeVisible();
  await row.getByRole("link", { name: reference }).click();
  await expect(disputeDetailCard(page, reference)).toBeVisible();
}

/** Records the finance decision (reason required) from the detail card; fails with the server message if refused. */
export async function decideDispute(page: Page, reference: string, decision: "accept" | "reject", reason: string): Promise<void> {
  await confirmInDialog(
    page,
    disputeDetailCard(page, reference),
    "Statuer sur la contestation",
    async (dialog) => {
      await dialog.getByRole("radio", { name: decision === "accept" ? /Accepter la contestation/u : /Rejeter la contestation/u }).check({ force: true });
      await dialog.getByLabel("Motif de la décision").fill(reason);
    },
    "Enregistrer la décision"
  );
}
