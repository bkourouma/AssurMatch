import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";
import { activateWithMfa, e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { extractLink, waitForMail, type MailMessage, type MailSummary } from "./mailpit";
import { card, confirmInDialog, uniqueSuffix } from "./ui";
import { api, type Method } from "./admin-lot11";
import { adminBearerToken } from "./recos-062b";
import type { ApiResult } from "./pro-roles";
import { superAdminAccount } from "./world";

// Lot 4 / spec file 04 (closing, feedback survey, billing, visitor cross-access): extra admin accounts
// created through the real /users screen (finance_admin and support_admin: the lot 11c helper only
// knows four roles), the lead closing gesture, survey / unsubscribe links read from Mailpit, and the
// Mailpit scanner of T-07. Everything is stored in files owned by this spec.

export type ClosingAdminRole = "finance_admin" | "support_admin";

const ACCOUNTS_FILE = path.resolve(".local", "e2e", "edge-p5p7-04-accounts.json");

function readAccounts(): Record<string, BackOfficeAccount> {
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")) as Record<string, BackOfficeAccount>;
  } catch {
    return {};
  }
}

/** An admin with exactly one role (and an optional country scope: billing refuses a non Super Admin without scope): reused from the lot file when it exists, otherwise invited on /users and activated. */
export async function ensureAdminAccount(browser: Browser, role: ClosingAdminRole, label: string, countryId?: string): Promise<BackOfficeAccount> {
  const key = `${role}:${label}`;
  const known = readAccounts()[key];
  if (known) return known;
  const email = `${label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  const adminContext = await newAppContext(browser, e2eEnv.adminUrl);
  const admin = await adminContext.newPage();
  await openAs(admin, superAdminAccount(), "/users");
  const create = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Créer et émettre activation" }) });
  await create.locator("input[name='email']").fill(email);
  await create.locator("input[name='displayName']").fill(`${label} E2E`);
  await create.locator(`input[name='roles'][value='${role}']`).check();
  if (countryId) await create.locator("input[name='countryScopes']").fill(countryId);
  await create.locator("textarea[name='reason']").fill("Parcours E2E lot 4 (cas limites phases 5 a 7) - compte de test");
  await create.getByRole("button", { name: "Créer et émettre activation" }).click();
  const mail = await waitForMail({ to: email });
  const link = extractLink(mail, /\/activate\?token=/u);
  await adminContext.close();

  const page = await (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
  const password = e2ePassword(label);
  const totpSecret = await activateWithMfa(page, link, password);
  await page.context().close();
  const account: BackOfficeAccount = { app: "admin", email, password, totpSecret };
  mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify({ ...readAccounts(), [key]: account }, null, 2));
  return account;
}

const tokenPages = new Map<string, Page>();

/**
 * Admin bearer token of a real MFA session of `account`. Uses its own page (never the page the spec drives on screen),
 * logging in again when the 15-minute session expired.
 */
export async function adminSessionToken(browser: Browser, account: BackOfficeAccount): Promise<string> {
  let page = tokenPages.get(account.email);
  if (!page || page.isClosed()) {
    page = await (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
    tokenPages.set(account.email, page);
  }
  await openAs(page, account, "/");
  return adminBearerToken(page);
}

export async function closeTokenPages(): Promise<void> {
  for (const page of tokenPages.values()) await page.context().close().catch(() => undefined);
  tokenPages.clear();
}

export async function adminApi(token: string | undefined, method: Method, urlPath: string, data?: Record<string, unknown>): Promise<ApiResult> {
  return api(token, method, urlPath, data);
}

/** The body of a refusal without the per-request correlation id (to compare two refusals byte for byte). */
export function withoutCorrelation(text: string): string {
  return text.replace(/"correlationId":"[^"]*"/gu, '"correlationId":"-"');
}

/** Starter lead page: "Clôturer" with an issue and a comment (the real dialog). */
export async function closeLeadViaUi(page: Page, owner: BackOfficeAccount, assignmentId: string, outcome: "gagne" | "perdu" | "sans_suite", comment: string): Promise<void> {
  await openAs(page, owner, `/leads/${assignmentId}`);
  await confirmInDialog(page, card(page, "Actions Starter"), "Clôturer", async (dialog) => {
    await dialog.locator("#close-outcome").selectOption(outcome);
    await dialog.locator("#close-comment").fill(comment);
  }, "Clôturer le lead");
  await expect(page.getByText("Lead clôturé avec son issue")).toBeVisible();
}

export interface SurveyLinks {
  mail: MailMessage;
  feedbackLink: string;
  unsubscribeLink: string;
  reference: string;
  token: string;
}

/** The satisfaction e-mail of a visitor (delay 0 on this stack): survey link and opt-out link. */
export async function waitSurveyLinks(email: string): Promise<SurveyLinks> {
  const mail = await waitForMail({ to: email, subject: /Votre avis sur votre mise en relation/u, timeoutMs: 150_000 });
  const feedbackLink = extractLink(mail, new RegExp(`^${e2eEnv.publicUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/avis/SF-[A-Z0-9]+\\?token=`, "u"));
  const unsubscribeLink = extractLink(mail, /\/desinscription\?token=/u);
  const url = new URL(feedbackLink);
  const token = url.searchParams.get("token") ?? "";
  return { mail, feedbackLink, unsubscribeLink, reference: url.pathname.split("/").pop() ?? "", token };
}

// ---------------------------------------------------------------------------------------------
// Mailpit scan (T-07)
// ---------------------------------------------------------------------------------------------

/** Every Mailpit message (all pages), newest first. */
export async function allMailSummaries(): Promise<MailSummary[]> {
  const out: MailSummary[] = [];
  for (let start = 0; start < 5_000; start += 200) {
    const response = await fetch(`${e2eEnv.mailpitUrl}/api/v1/messages?start=${start}&limit=200`);
    if (!response.ok) throw new Error(`Mailpit list: HTTP ${response.status}`);
    const page = (await response.json()) as { messages: MailSummary[]; total: number };
    out.push(...page.messages);
    if (out.length >= page.total || page.messages.length === 0) break;
  }
  return out;
}

export function urlsOf(message: MailMessage): string[] {
  return [...new Set(`${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s"'<>)]+/gu) ?? [])].map((url) => url.replace(/&amp;/gu, "&"));
}

/** Text of a message without its links (what a reader sees besides the clickable links). */
export function visibleTextWithoutLinks(message: MailMessage): string {
  return message.Text.replace(/https?:\/\/[^\s"'<>)]+/gu, "<lien>");
}
