import { expect, request, type Browser, type Page } from "@playwright/test";
import { newAppContext, openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";

// Helpers of the Pro role / AI journeys (pro-03-roles, pro-04-ai-disabled): one cached browser page
// per back-office account, and direct calls to the API with the bearer token of a real session.
// The broker app keeps that token in an httpOnly cookie and forwards it to the API as a bearer
// token (apps/broker/app/lib/broker-write.ts), so the same call made here sees what a forged
// request from a logged-in user would see.

const BROKER_TOKEN_COOKIE = "assurmatch_broker_token";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;

const pages = new Map<string, Page>();

/** One logged-in-on-demand page per account for the whole file (its own isolated browser context). */
export async function sessionPage(browser: Browser, account: BackOfficeAccount): Promise<Page> {
  const known = pages.get(account.email);
  if (known && !known.isClosed()) return known;
  const context = await newAppContext(browser, account.app === "admin" ? e2eEnv.adminUrl : e2eEnv.brokerUrl);
  const page = await context.newPage();
  pages.set(account.email, page);
  return page;
}

export async function closeSessions(): Promise<void> {
  for (const page of pages.values()) await page.context().close().catch(() => undefined);
  pages.clear();
}

/** Opens `path` (logging in again when the 15-minute session expired) and returns the session page. */
export async function visit(browser: Browser, account: BackOfficeAccount, path: string): Promise<Page> {
  const page = await sessionPage(browser, account);
  await openAs(page, account, path);
  return page;
}

/** The API bearer token of the session held by `page` (the page must have been opened with `openAs`). */
export async function bearerToken(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((entry) => entry.name === BROKER_TOKEN_COOKIE);
  if (!cookie?.value) throw new Error(`no ${BROKER_TOKEN_COOKIE} cookie: the page has no broker session`);
  return cookie.value;
}

export interface ApiResult {
  status: number;
  /** Parsed JSON body (or the raw text when the body is not JSON). */
  body: unknown;
  /** Raw response text, to assert that a refusal leaks nothing. */
  text: string;
}

export async function apiCall(token: string | undefined, method: "GET" | "POST" | "PUT", path: string, data?: Record<string, unknown>): Promise<ApiResult> {
  const context = await request.newContext({
    baseURL: e2eEnv.apiUrl,
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {})
  });
  try {
    const response = await context.fetch(path, { method, ...(data ? { data } : {}) });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON (CSV export, plain refusal...)
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

/** A fresh bearer token for `account` (opens a light page, which logs in again if needed). */
export async function tokenFor(browser: Browser, account: BackOfficeAccount): Promise<string> {
  return bearerToken(await visit(browser, account, "/notifications"));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Items of a CRM list answer (`{ items: [...] }` or a bare array). */
export function itemsOf(result: ApiResult): Array<Record<string, unknown>> {
  const body = result.body;
  const list = Array.isArray(body) ? body : asRecord(body).items;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}

export function referenceOf(item: Record<string, unknown>): string {
  return String(item.publicReference ?? item.reference ?? "");
}

export function idOf(item: Record<string, unknown>): string {
  return String(item.id ?? item.leadAssignmentId ?? "");
}

/** Maps the QR- references of the given leads to their lead assignment ids (owner token). */
export async function assignmentIds(ownerToken: string, references: Record<string, string>): Promise<Record<string, string>> {
  const list = await apiCall(ownerToken, "GET", "/broker/crm/leads");
  expect(list.status, "owner can list the CRM leads").toBe(200);
  const items = itemsOf(list);
  const ids: Record<string, string> = {};
  for (const [key, reference] of Object.entries(references)) {
    const item = items.find((entry) => referenceOf(entry) === reference);
    expect(item, `${key} (${reference}) is in the owner's CRM list`).toBeDefined();
    const id = idOf(item as Record<string, unknown>);
    expect(id, `${key} assignment id`).toMatch(UUID);
    ids[key] = id;
  }
  return ids;
}

export interface LeadFootprint {
  notes: number;
  tasks: number;
  reminders: number;
  history: number;
  status: string;
  advisorId: string;
}

/** What a write would change on a lead (owner token): counts of notes / tasks / reminders / history, status, advisor. */
export async function leadFootprint(ownerToken: string, leadId: string): Promise<LeadFootprint> {
  const detail = await apiCall(ownerToken, "GET", `/broker/crm/leads/${leadId}`);
  expect(detail.status, "owner can read the lead").toBe(200);
  const lead = asRecord(detail.body);
  const count = (key: string) => (Array.isArray(lead[key]) ? (lead[key] as unknown[]).length : 0);
  return {
    notes: count("notes"),
    tasks: count("tasks"),
    reminders: count("reminders"),
    history: count("history"),
    status: String(lead.status ?? ""),
    advisorId: String(lead.advisorId ?? "")
  };
}

/** Records the requests a page issues (method + URL), to prove a screen triggers no AI call or server action. */
export function recordRequests(page: Page): { all: Array<{ method: string; url: string }>; stop: () => void } {
  const all: Array<{ method: string; url: string }> = [];
  const listener = (req: { method(): string; url(): string }) => all.push({ method: req.method(), url: req.url() });
  page.on("request", listener);
  return { all, stop: () => page.off("request", listener) };
}
