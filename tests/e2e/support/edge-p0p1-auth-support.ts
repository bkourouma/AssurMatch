import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { appUrl, e2ePassword, freshTotp, newAppContext, verifyTotp, type BackOfficeAccount } from "./backoffice";
import { EDGE_REASON, L2_TAG } from "./edge-p0p1-accounts";
import { e2eEnv } from "./env";
import { extractLink, waitForMail } from "./mailpit";
import { uniqueSuffix } from "./ui";
import type { Browser } from "@playwright/test";
import { openAs } from "./backoffice";

// Helpers of edge-p0-p1-auth.spec.ts (admin app authentication edge cases): raw password step of the login
// screen that leaves the page wherever the app sends it, text of the notices, an "observation" log that is
// both printed and attached to the test as an annotation, and an invitation (activation link) that is NOT
// consumed so the spec can try bad passwords and bad tokens on it.

export const ADMIN_TOKEN_COOKIE = "assurmatch_admin_token";

export interface Observation {
  caseId: string;
  what: string;
  observed: string;
}

export const observations: Observation[] = [];

/** Prints and annotates what the app really did (texts, statuses), for the report. */
export function observe(caseId: string, what: string, observed: string): void {
  observations.push({ caseId, what, observed });
  console.log(`[OBS ${caseId}] ${what} => ${observed}`);
  test.info().annotations.push({ type: "observed", description: `${caseId} ${what}: ${observed}` });
}

/** Records a defect found by a test (the test stays red when the assertion that follows fails). */
export function anomaly(description: string): void {
  console.log(`[ANOMALY] ${description}`);
  test.info().annotations.push({ type: "anomaly", description });
}

export function hypothesis(description: string): void {
  console.log(`[HYPOTHESIS] ${description}`);
  test.info().annotations.push({ type: "hypothesis", description });
}

/** Visible texts of every `.bo-notice` of the page (login and flow errors, info banners). */
export async function noticeTexts(page: Page): Promise<string[]> {
  return (await page.locator(".bo-notice").allInnerTexts()).map((text) => text.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

export async function adminCookie(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === ADMIN_TOKEN_COOKIE)?.value;
}

export interface PasswordStepResult {
  url: URL;
  notices: string[];
  hasSession: boolean;
}

/** Submits the password step of /login on a fresh page of `context` and waits for the app to react. */
export async function passwordStep(context: BrowserContext, email: string, password: string, returnTo = "/"): Promise<{ page: Page; result: PasswordStepResult }> {
  const page = await context.newPage();
  await page.goto(`${e2eEnv.adminUrl}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/login" || url.searchParams.has("error"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return { page, result: { url: new URL(page.url()), notices: await noticeTexts(page), hasSession: (await adminCookie(context)) !== undefined } };
}

/** A fresh isolated context of the admin app. */
export function adminContext(browser: Browser): Promise<BrowserContext> {
  return newAppContext(browser, e2eEnv.adminUrl);
}

/** The e-mail and activation link of an admin invited by `creatorPage` (a logged-in Super Admin page); NOT consumed. */
export async function inviteAdmin(creatorPage: Page, creator: BackOfficeAccount, label: string, roles: string[]): Promise<{ email: string; link: string; password: string }> {
  const email = `l2.${label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  await openAs(creatorPage, creator, "/users");
  const create = creatorPage.locator("form").filter({ has: creatorPage.getByRole("button", { name: "Créer et émettre activation" }) });
  await create.locator("input[name='email']").fill(email);
  await create.locator("input[name='displayName']").fill(`${L2_TAG} ${label}`);
  for (const role of roles) await create.locator(`input[name='roles'][value='${role}']`).check();
  await create.locator("textarea[name='reason']").fill(EDGE_REASON);
  await create.getByRole("button", { name: "Créer et émettre activation" }).click();
  await expect(create.locator(".bo-notice[data-tone='success']").first()).toBeVisible({ timeout: 30_000 });
  const mail = await waitForMail({ to: email });
  return { email, link: extractLink(mail, /\/activate\?token=/u), password: e2ePassword(label) };
}

/** Submits /activate for `token` and `password` on a fresh page; returns where the app went and what it said. */
export async function submitActivation(context: BrowserContext, token: string, password: string): Promise<{ page: Page; url: URL; notices: string[]; hasSession: boolean }> {
  const page = await context.newPage();
  await page.goto(`${e2eEnv.adminUrl}/activate?token=${encodeURIComponent(token)}`);
  await page.locator("#activate-password").fill(password);
  await page.getByRole("button", { name: /Activer/u }).click();
  await expect
    .poll(async () => new URL(page.url()).pathname.startsWith("/mfa") || (await noticeTexts(page)).length > 0, { timeout: 30_000 })
    .toBe(true);
  return { page, url: new URL(page.url()), notices: await noticeTexts(page), hasSession: (await adminCookie(context)) !== undefined };
}

/** TOTP code that is valid for at least a few more seconds. */
export async function currentCode(secret: string): Promise<string> {
  return freshTotp(secret);
}

export { appUrl, verifyTotp };

/** Same wording rule as the report: a raw technical token shown to the user is a minor UX anomaly (a). */
export function classifyText(text: string): string {
  if (/^(api_\d+|validation_error|invalid_session|invalid_credentials|account_\w+|action_failed|session_required)$/u.test(text)) return "(a) texte technique brut";
  if (/^[A-Z][A-Za-z ]+$/u.test(text) && !/[àâçéèêëîïôûù]/u.test(text)) return "(a) message serveur anglais brut";
  return "(c) message lisible, a valider par le produit";
}

// Verdicts handed from the serial tests to the "open findings" tests (a failure restarts the worker, module state is lost).
const verdictFile = path.resolve("test-results", "e2e-edge-p0p1", process.env.EDGE_OUT ?? "default", "auth-verdicts.json");

function readVerdicts(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(verdictFile, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveVerdict(key: string, value: unknown): void {
  mkdirSync(path.dirname(verdictFile), { recursive: true });
  writeFileSync(verdictFile, JSON.stringify({ ...readVerdicts(), [key]: value }, null, 2));
}

export function loadVerdict<T>(key: string): T {
  const value = readVerdicts()[key];
  if (value === undefined) throw new Error(`verdict "${key}" missing: run the whole file (the serial group records it)`);
  return value as T;
}
