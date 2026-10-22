import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, request, type Browser, type Page } from "@playwright/test";
import { activateWithMfa, e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { extractLink, waitForMail } from "./mailpit";
import { adminBearerToken } from "./recos-062b";
import { sessionPage, type ApiResult } from "./pro-roles";
import { uniqueSuffix } from "./ui";

// Helpers of the lot 11c admin journeys (admin-cms, admin-ai-integrations, admin-channels): extra
// admin accounts (content_admin, support_admin) created through the real /users screen, a session
// per account, and direct API calls with the bearer token of a real MFA session. The API probes only
// target refusals and read-backs; the happy paths go through the screens wherever one exists.

export type AdminRole = "content_admin" | "support_admin" | "compliance_admin" | "super_admin";

const ACCOUNTS_FILE = path.resolve(".local", "e2e", "lot11c-accounts.json");

function readAccounts(): Record<string, BackOfficeAccount> {
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")) as Record<string, BackOfficeAccount>;
  } catch {
    return {};
  }
}

function writeAccount(key: string, account: BackOfficeAccount): void {
  mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify({ ...readAccounts(), [key]: account }, null, 2));
}

/**
 * An admin account with exactly one role: reused when a previous file of the same run created it,
 * otherwise invited by the Super Admin on /users, activated from the e-mail and enrolled in MFA.
 */
export async function adminWithRole(browser: Browser, superAdmin: BackOfficeAccount, role: AdminRole, label: string): Promise<BackOfficeAccount> {
  const key = `${role}:${label}`;
  const known = readAccounts()[key];
  if (known) return known;

  const email = `${label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  const adminContext = await newAppContext(browser, e2eEnv.adminUrl);
  const admin = await adminContext.newPage();
  await openAs(admin, superAdmin, "/users");
  const create = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Creer et emettre activation" }) });
  await create.locator("input[name='email']").fill(email);
  await create.locator("input[name='displayName']").fill(`${label} E2E`);
  await create.locator(`input[name='roles'][value='${role}']`).check();
  await create.locator("textarea[name='reason']").fill("Parcours E2E lot 11c - compte de test");
  await create.getByRole("button", { name: "Creer et emettre activation" }).click();
  const mail = await waitForMail({ to: email });
  const link = extractLink(mail, /\/activate\?token=/u);
  await adminContext.close();

  const page = await (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
  const password = e2ePassword(label);
  const totpSecret = await activateWithMfa(page, link, password);
  await page.context().close();
  const account: BackOfficeAccount = { app: "admin", email, password, totpSecret };
  writeAccount(key, account);
  return account;
}

/** The API bearer token of the account: opens a light admin page (logging in again when the session expired). */
export async function adminToken(browser: Browser, account: BackOfficeAccount): Promise<string> {
  const page = await sessionPage(browser, account);
  await openAs(page, account, "/");
  return adminBearerToken(page);
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api(token: string | undefined, method: Method, urlPath: string, data?: Record<string, unknown>): Promise<ApiResult> {
  const context = await request.newContext({
    baseURL: e2eEnv.apiUrl,
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {})
  });
  try {
    const response = await context.fetch(urlPath, { method, ...(data ? { data } : {}) });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

export function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** `{ items: [...] }` envelope or a bare array. */
export function itemsOfBody(body: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(body) ? body : rec(body).items;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}

/** Opens `route` as `account` and returns the page. */
export async function openPage(browser: Browser, account: BackOfficeAccount, route: string): Promise<Page> {
  const page = await sessionPage(browser, account);
  await openAs(page, account, route);
  return page;
}

export function expectStatus(result: ApiResult, status: number, label: string): void {
  expect(result.status, `${label} -> ${result.status} ${result.text.slice(0, 300)}`).toBe(status);
}

/** Public HTTPS origin that resolves to a public address (the webhook policy checks DNS, never connects in these journeys). */
export const PARTNER_HTTPS_ORIGIN = "https://example.com";

/** Makes sure `origin` is on the webhook allow-list of the partner (the CRM connector and the webhooks share it). */
export async function ensureAllowlisted(token: string, partnerTenantId: string, origin: string, reason: string): Promise<void> {
  const list = await api(token, "GET", "/admin/partner-integrations/webhook-allowlist");
  expectStatus(list, 200, "list webhook allow-list");
  const present = itemsOfBody(list.body).some((entry) => entry.partnerTenantId === partnerTenantId && entry.origin === origin && entry.status === "active");
  if (present) return;
  const created = await api(token, "POST", "/admin/partner-integrations/webhook-allowlist", { partnerTenantId, origin, reason });
  expect(created.status, `allow-list ${origin} -> ${created.status} ${created.text.slice(0, 300)} (the host must resolve to a public address)`).toBeLessThan(300);
}
