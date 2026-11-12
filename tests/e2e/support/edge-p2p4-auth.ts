import { execFileSync } from "node:child_process";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { e2ePassword, newAppContext, openAs } from "./backoffice";
import { e2eEnv } from "./env";
import { extractLink, searchMessages, waitForMail } from "./mailpit";
import { onboardBrokerDirect } from "./partners";
import { apiCall, asRecord, type ApiResult } from "./pro-roles";
import { card, uniqueSuffix } from "./ui";
import { appPage, superAdminAccount } from "./world";
import { verifyTotp } from "./backoffice";
import type { BackOfficeAccount } from "./backoffice";

// Helpers of edge-p2-p4-02-auth.spec.ts (lot 3, phase 2: authentication and session of the broker).
// Everything targets the throwaway firm and the throwaway accounts created by the spec. Two things
// go beyond the screens, both limited to the spec's own rows and both reported:
//  - `psql` (docker exec on the e2e Postgres) to age the activation token of ONE account of the spec
//    (E-P2-01d: no clock control) and to read back the lockout counter of the spec's own accounts;
//  - a READ-ONLY look at the Redis rate-limit counters, so the spec waits instead of ever pushing the
//    shared IP bucket (100 attempts per 15 minutes, shared by every team) towards its limit.

export const BROKER_TOKEN_COOKIE = "assurmatch_broker_token";
export const AUTH_LABEL = `E2E Courtage L3-${Date.now()}`;

// ---------------------------------------------------------------------------------------------
// Observation log (T-09): every authentication message really shown, for the product decision.
// ---------------------------------------------------------------------------------------------

export interface AuthMessage {
  caseId: string;
  situation: string;
  shown: string;
  extra?: string;
}

export const authMessages: AuthMessage[] = [];

export function recordMessage(caseId: string, situation: string, shown: string, extra?: string): void {
  authMessages.push({ caseId, situation, shown, ...(extra ? { extra } : {}) });
  console.log(`[MSG ${caseId}] ${situation} => ${shown}${extra ? ` (${extra})` : ""}`);
}

export function authMessagesTable(): string {
  const rows = authMessages.map((entry) => `| ${entry.caseId} | ${entry.situation} | ${entry.shown.replace(/\|/gu, "/")} | ${entry.extra ?? ""} |`);
  return ["| Cas | Situation | Texte réellement affiché | Complément |", "|---|---|---|---|", ...rows].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Rate-limit budget (read-only) and Postgres (own rows only)
// ---------------------------------------------------------------------------------------------

const composeProject = process.env.E2E_COMPOSE_PROJECT ?? "assurmatch-e2e";
const redisPort = process.env.E2E_REDIS_PORT ?? "48679";
/** The IP buckets allow 100 attempts per 15 minutes for every team: the spec stays under this line. */
const BUDGET_CEILING = 78;

function redisCli(...args: string[]): string {
  return execFileSync("docker", ["exec", `${composeProject}-redis-1`, "redis-cli", "-p", redisPort, ...args], { encoding: "utf8" }).trim();
}

function ipBucket(route: string): { count: number; ttl: number } {
  let count = 0;
  let ttl = 0;
  for (const key of redisCli("--scan", "--pattern", `auth:rl:${route}:ip:*`).split(/\r?\n/u).filter(Boolean)) {
    const value = Number(redisCli("get", key));
    if (value >= count) {
      count = value;
      ttl = Number(redisCli("ttl", key));
    }
  }
  return { count, ttl };
}

export function authBucketSnapshot(): string {
  const login = ipBucket("/auth/login");
  const mfa = ipBucket("/auth/mfa/verify");
  return `login ${login.count} (ttl ${login.ttl}s), mfa ${mfa.count} (ttl ${mfa.ttl}s)`;
}

/**
 * Waits (never tests a limit) until the shared IP buckets of /auth/login and /auth/mfa/verify have room
 * for `need` more attempts under a conservative ceiling. The counters are read only, never changed.
 */
export async function waitForAuthBudget(need: { login: number; mfa: number }): Promise<void> {
  const deadline = Date.now() + 20 * 60_000;
  for (;;) {
    const login = ipBucket("/auth/login");
    const mfa = ipBucket("/auth/mfa/verify");
    if (login.count + need.login <= BUDGET_CEILING && mfa.count + need.mfa <= BUDGET_CEILING) return;
    if (Date.now() > deadline) throw new Error(`rate-limit budget not available after 20 minutes: ${authBucketSnapshot()}`);
    const pause = Math.min(Math.max(Math.max(login.ttl, mfa.ttl), 5), 30);
    console.log(`[BUDGET] waiting ${pause}s: ${authBucketSnapshot()}, need ${JSON.stringify(need)}`);
    await new Promise((resolve) => setTimeout(resolve, pause * 1000));
  }
}

const SAFE_EMAIL = /^[a-z0-9._+-]+@[a-z0-9.-]+$/u;

/** One SQL statement on the e2e Postgres. ONLY ever used with a filter on the e-mail of an account of this spec. */
export function psql(sql: string): string {
  return execFileSync("docker", ["exec", `${composeProject}-postgres-1`, "psql", "-U", "assurmatch_e2e", "-d", "assurmatch_e2e", "-tA", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
}

function safeEmail(email: string): string {
  if (!SAFE_EMAIL.test(email)) throw new Error(`refusing SQL on an unexpected e-mail: ${email}`);
  return email;
}

export interface UserRow {
  id: string;
  status: string;
  mfaStatus: string;
  failedLoginCount: number;
  lockedReason: string;
  hasToken: boolean;
}

export function userRow(email: string): UserRow {
  const out = psql(`SELECT id, status, "mfaStatus", "failedLoginCount", coalesce("lockedReason", ''), ("passwordResetTokenHash" IS NOT NULL) FROM "User" WHERE email = '${safeEmail(email)}'`);
  const [id = "", status = "", mfaStatus = "", failed = "0", lockedReason = "", hasToken = "f"] = out.split("|");
  if (!id) throw new Error(`no user row for ${email}`);
  return { id, status, mfaStatus, failedLoginCount: Number(failed), lockedReason, hasToken: hasToken === "t" };
}

/** E-P2-01d: moves the expiry of the activation token of ONE account of the spec to one minute ago. Returns the rows changed. */
export function expireActivationToken(email: string): number {
  const out = psql(`WITH changed AS (UPDATE "User" SET "passwordResetTokenExpiresAt" = (now() AT TIME ZONE 'utc') - interval '1 minute' WHERE email = '${safeEmail(email)}' AND "passwordResetTokenHash" IS NOT NULL RETURNING id) SELECT count(*) FROM changed`);
  return Number(out.split(/\r?\n/u)[0] ?? "0");
}

// ---------------------------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------------------------

/** Visible texts of every `.bo-notice` (login and flow errors, info banners). */
export async function noticeTexts(page: Page): Promise<string[]> {
  return (await page.locator(".bo-notice").allInnerTexts()).map((text) => text.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

export async function brokerSessionCookie(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((cookie) => cookie.name === BROKER_TOKEN_COOKIE)?.value;
}

export async function brokerPage(browser: Browser): Promise<Page> {
  return (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
}

export interface ScreenOutcome {
  path: string;
  search: string;
  notices: string[];
  hasSession: boolean;
}

async function outcomeOf(page: Page, scope?: string): Promise<ScreenOutcome> {
  const url = new URL(page.url());
  const notices = scope ? (await page.locator(`${scope} .bo-notice`).allInnerTexts()).map((entry) => entry.replace(/\s+/gu, " ").trim()).filter(Boolean) : await noticeTexts(page);
  return { path: url.pathname, search: url.search, notices, hasSession: Boolean(await brokerSessionCookie(page)) };
}

/** Turns the native browser validation off for the form around `field`, so only the server rules guard it. */
export async function bypassValidation(field: Locator): Promise<void> {
  await field.evaluate((element) => {
    const form = element.closest("form");
    if (form) form.noValidate = true;
  });
}

/** Submits the activation form (token prefilled from the link) and waits for the screen to settle. */
export async function submitActivation(page: Page, link: string, password: string): Promise<ScreenOutcome> {
  await page.goto(link);
  await expect(page.locator("#activate-token")).not.toHaveValue("");
  await page.locator("#activate-password").fill(password);
  await page.getByRole("button", { name: /Activer/u }).click();
  await expect
    .poll(async () => (new URL(page.url()).pathname.startsWith("/mfa") ? "mfa" : (await noticeTexts(page)).length > 0 ? "notice" : "pending"), { timeout: 30_000, message: "activation result" })
    .not.toBe("pending");
  return outcomeOf(page);
}

/** Submits the password step of /login on `page` and waits for the app to react. */
export async function submitLogin(page: Page, email: string, password: string, options: { bypass?: boolean; returnTo?: string } = {}): Promise<ScreenOutcome> {
  await page.goto(`${e2eEnv.brokerUrl}/login${options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : ""}`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  if (options.bypass) await bypassValidation(page.locator("#login-email"));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.searchParams.has("error") || !url.pathname.startsWith("/login"), { timeout: 30_000 });
  return outcomeOf(page);
}

const MFA_VERIFY_FORM = "form:has(#mfa-code)";

async function mfaNotices(page: Page): Promise<string[]> {
  return (await page.locator(`${MFA_VERIFY_FORM} .bo-notice`).allInnerTexts()).map((entry) => entry.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

/** Submits a code on the MFA verification form without waiting for a redirect (refusals stay on /mfa). */
export async function submitMfaCode(page: Page, code: string): Promise<ScreenOutcome> {
  const before = (await mfaNotices(page)).join("|");
  await page.locator("#mfa-code").fill(code);
  await page.getByRole("button", { name: /Vérifier MFA/u }).click();
  await expect
    .poll(async () => {
      if (!new URL(page.url()).pathname.startsWith("/mfa")) return "left";
      const now = (await mfaNotices(page)).join("|");
      // The same refusal text can come back: the button is enabled again once the action ended.
      return now && (now !== before || (await page.getByRole("button", { name: /Vérifier MFA/u }).isEnabled())) ? "notice" : "pending";
    }, { timeout: 30_000, message: "MFA result" })
    .not.toBe("pending");
  await page.waitForTimeout(300);
  return outcomeOf(page, MFA_VERIFY_FORM);
}

/** Reads the one-time secret of the enrolment screen. */
export async function shownSecret(page: Page): Promise<string> {
  const line = page.getByText(/Secret TOTP/u);
  await expect(line).toBeVisible();
  return ((await line.locator("code").textContent()) ?? "").trim();
}

/** Activation link -> password -> MFA enrolment -> first code. `trustDevice` ticks "trust this device". */
export async function activateAndEnrol(page: Page, link: string, password: string, options: { trustDevice?: boolean } = {}): Promise<string> {
  await page.goto(link);
  await expect(page.locator("#activate-token")).not.toHaveValue("");
  await page.locator("#activate-password").fill(password);
  await page.getByRole("button", { name: /Activer/u }).click();
  await page.waitForURL(/\/mfa/u);
  await page.getByRole("button", { name: /G[ée]n[ée]rer secret/u }).click();
  const secret = await shownSecret(page);
  expect(secret, "TOTP secret shown at enrolment").toMatch(/^[A-Z2-7]{16,}$/u);
  await verifyTotp(page, secret, options);
  return secret;
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

export interface ApiLogin {
  result: ApiResult;
  accessToken: string;
  mfaRequired: boolean;
}

export async function apiLogin(email: string, password: string): Promise<ApiLogin> {
  const result = await apiCall(undefined, "POST", "/auth/login", { email, password });
  const body = asRecord(result.body);
  return { result, accessToken: String(body.accessToken ?? ""), mfaRequired: body.mfaRequired === true };
}

/** Status + body of an API answer without the per-request correlation id, to compare two refusals. */
export function refusalSignature(result: ApiResult): string {
  const body = asRecord(result.body);
  return `${result.status} ${String(body.code ?? "")} ${String(body.message ?? result.text.slice(0, 120))}`;
}

export function tokenOf(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}

/** The same token with one character (in the middle) replaced. */
export function alteredToken(token: string): string {
  const index = 10;
  const replacement = token[index] === "A" ? "B" : "A";
  return `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
}

export function withToken(link: string, token: string): string {
  const url = new URL(link);
  url.searchParams.set("token", token);
  return url.toString();
}

// ---------------------------------------------------------------------------------------------
// Throwaway firm and invitations that are NOT consumed
// ---------------------------------------------------------------------------------------------

export interface AuthFirm {
  partnerId: string;
  partnerName: string;
  owner: BackOfficeAccount;
  /** The owner's page, still holding its first session (15 minutes). */
  ownerPage: Page;
}

/**
 * The admin creates a Pro broker "E2E Courtage L3-<timestamp>" and takes it to "Actif public" (same screens as
 * provisionBroker); the owner activates the account from the e-mail and keeps the session for the invitations.
 */
export async function provisionAuthFirm(browser: Browser): Promise<AuthFirm> {
  const suffix = uniqueSuffix();
  const partnerName = AUTH_LABEL;
  const ownerEmail = `owner.l3auth.${suffix}@broker-l3auth.e2e.test`;
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/partners");
  const partnerId = await onboardBrokerDirect(admin, { legalName: partnerName, ownerEmail, licenseNumber: `CI-AGR-L3AUTH-${suffix}`, plan: "pro" });
  await admin.context().close();
  const invitation = await waitForMail({ to: ownerEmail, subject: /activation|invitation/iu });
  const ownerPage = await brokerPage(browser);
  const password = e2ePassword("l3-owner");
  const totpSecret = await activateAndEnrol(ownerPage, extractLink(invitation, /\/activate\?token=/u), password);
  return { partnerId, partnerName, owner: { app: "broker", email: ownerEmail, password, totpSecret }, ownerPage };
}

export interface Invitee {
  key: string;
  email: string;
  displayName: string;
  link: string;
  token: string;
}

/** The owner invites agents from /team; returns their activation links (read from Mailpit), none consumed. */
export async function inviteAgents(ownerPage: Page, keys: readonly string[]): Promise<Invitee[]> {
  await ownerPage.goto(`${e2eEnv.brokerUrl}/team`);
  const invitees: Invitee[] = [];
  for (const key of keys) {
    const email = `agent.${key}.${uniqueSuffix()}@broker-l3auth.e2e.test`;
    const displayName = `Agent L3 ${key} ${uniqueSuffix()}`;
    const invite = card(ownerPage, "Inviter un collaborateur");
    await invite.getByLabel(/Nom affiché/u).fill(displayName);
    await invite.getByLabel(/E-mail professionnel/u).fill(email);
    await invite.getByLabel(/Rôle/u).selectOption("broker_agent");
    await invite.getByRole("button", { name: "Inviter", exact: true }).click();
    await expect
      .poll(async () => {
        const danger = invite.locator(".bo-notice[data-tone='danger']");
        if (await danger.count()) return `refused: ${(await danger.first().innerText()).replace(/\s+/gu, " ")}`;
        return (await searchMessages(`to:"${email}"`)).length > 0 ? "sent" : "pending";
      }, { timeout: 90_000, intervals: [500, 1_000, 2_000], message: `invitation ${key}` })
      .toBe("sent");
    const mail = await waitForMail({ to: email });
    const link = extractLink(mail, /\/activate\?token=/u);
    invitees.push({ key, email, displayName, link, token: tokenOf(link) });
  }
  return invitees;
}

// ---------------------------------------------------------------------------------------------
// Super Admin actions (the spec's own accounts only)
// ---------------------------------------------------------------------------------------------

let adminPageCache: Page | undefined;

/** One cached Super Admin page for the file; `openAs` logs in again when the 15-minute session ended. */
export async function adminOpen(browser: Browser, path: string): Promise<Page> {
  if (!adminPageCache || adminPageCache.isClosed()) adminPageCache = await appPage(browser, e2eEnv.adminUrl);
  await openAs(adminPageCache, superAdminAccount(), path);
  return adminPageCache;
}

export async function closeAdminPage(): Promise<void> {
  await adminPageCache?.context().close().catch(() => undefined);
  adminPageCache = undefined;
}

/** "Réinitialisation mot de passe" > "Émettre un jeton" on /users/<id>: returns the temporary token shown to the admin. */
export async function adminIssueToken(browser: Browser, userId: string, email: string): Promise<string> {
  const page = await adminOpen(browser, `/users/${userId}?tab=actions`);
  const reset = card(page, "Réinitialisation mot de passe");
  await reset.getByRole("button", { name: "Émettre un jeton" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Raison auditable/u).fill("Lot 3 auth: réémission du jeton d'un compte jetable");
  await dialog.getByRole("button", { name: "Émettre un jeton" }).last().click();
  const success = dialog.locator(".bo-notice[data-tone='success']");
  const danger = dialog.locator(".bo-notice[data-tone='danger']");
  await expect.poll(async () => ((await success.count()) > 0 ? "ok" : (await danger.count()) > 0 ? "refused" : "pending"), { timeout: 30_000 }).not.toBe("pending");
  if ((await danger.count()) > 0) throw new Error(`token issuance refused: ${(await danger.first().innerText()).replace(/\s+/gu, " ")}`);
  const shown = (await success.locator("code").first().textContent().catch(() => null))?.trim();
  if (shown) return shown;
  // No token on screen (production-like delivery): read it from the e-mail.
  const mail = await waitForMail({ to: email, subject: /initialisation|reset|mot de passe/iu });
  return tokenOf(extractLink(mail, /token=/u));
}

/** "Actions sensibles" > unlock on /users/<id>. */
export async function adminUnlock(browser: Browser, userId: string): Promise<string> {
  const page = await adminOpen(browser, `/users/${userId}?tab=actions`);
  await page.locator("#user-reason-unlock").fill("Lot 3 auth: déblocage d'un compte jetable");
  await page.getByRole("button", { name: "Confirmer unlock" }).click();
  await page.waitForURL(/notice=unlock/u);
  return (await page.getByText(/Action terminée/u).first().innerText()).replace(/\s+/gu, " ");
}

/** Rows (header excluded) of the "Appareils de confiance actifs" table of /account/security. */
export function trustedDeviceRows(page: Page): Locator {
  return page.getByRole("table", { name: "Appareils de confiance actifs" }).getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
}

/** A code that is none of the TOTP codes of the previous, current and next 30-second windows. */
export function wrongCode(valid: readonly string[]): string {
  for (let candidate = 123456; ; candidate += 7) {
    const text = String(candidate % 1_000_000).padStart(6, "0");
    if (!valid.includes(text)) return text;
  }
}
