import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type Browser, type Page, type Response } from "@playwright/test";
import { e2eEnv } from "./env";
import { publicCall } from "./recos-062b";
import type { ApiResult } from "./pro-roles";
import { newVisitor, type VisitorIdentity } from "./visitor-gaps";

// Lot 4, spec 01 (visitor side of phase 5): helpers private to tests/e2e/edge-p5-p7-01-visitor-quote.spec.ts.

export const FR_QUOTE_PATH = (offerId: string): string => `/pays/CI/produits/auto/devis?offerId=${offerId}`;
export const EN_QUOTE_PATH = (offerId: string): string => `/en/countries/CI/products/auto/quote?offerId=${offerId}`;

export const XSS_SCRIPT = "<script>alert(1)</script>";
export const XSS_IMG = "\"><img src=x onerror=alert(1)>";
export const SQL_DROP = "'; DROP TABLE leads;--";
export const SQL_OR = "' OR '1'='1";

/** A visitor page in its own context (no cookie shared with anything), with a collector of JS dialogs. */
export interface VisitorSession {
  page: Page;
  /** Messages of every alert/confirm/prompt the page raised (must stay empty). */
  dialogs: string[];
  close: () => Promise<void>;
}

export interface VisitorSessionOptions {
  locale?: "fr-FR" | "en-US";
  width?: number;
  height?: number;
}

export async function openVisitor(browser: Browser, options: VisitorSessionOptions = {}): Promise<VisitorSession> {
  const context = await browser.newContext({
    baseURL: e2eEnv.publicUrl,
    locale: options.locale ?? "fr-FR",
    timezoneId: "Africa/Abidjan",
    ...(options.width ? { viewport: { width: options.width, height: options.height ?? 812 } } : {})
  });
  const page = await context.newPage();
  const dialogs = watchDialogs(page);
  return { page, dialogs, close: () => context.close() };
}

/** Records and dismisses every JavaScript dialog (an executed `alert(1)` would land here). */
export function watchDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on("dialog", (dialog) => {
    seen.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
  return seen;
}

export interface NeedAnswers {
  use: string;
  brand?: string;
  city: string;
  contact: string;
  budget?: string;
}

export const DEFAULT_NEED: NeedAnswers = { use: "prive", brand: "Toyota", city: "Abidjan", contact: "email" };

/** Fills the "Votre besoin" step (ids come from the published form fields). */
export async function fillNeedStep(page: Page, need: NeedAnswers = DEFAULT_NEED): Promise<void> {
  await page.locator("#am-answer-vehicle_use").selectOption(need.use);
  if (need.brand !== undefined) await page.locator("#am-answer-vehicle_brand").fill(need.brand);
  await page.locator("#am-answer-city").fill(need.city);
  await page.locator("#am-answer-contact_preference").selectOption(need.contact);
  if (need.budget !== undefined) await page.locator("#am-answer-budget").fill(need.budget);
}

export async function fillContactStep(page: Page, identity: VisitorIdentity): Promise<void> {
  await page.locator("#am-quote-first-name").fill(identity.firstName);
  await page.locator("#am-quote-last-name").fill(identity.lastName);
  await page.locator("#am-quote-email").fill(identity.email);
  await page.locator("#am-quote-phone").fill(identity.phone);
}

export function visitorIdentity(label: string, names: { firstName?: string; lastName?: string } = {}): VisitorIdentity {
  return newVisitor(label, names);
}

/** True for the browser's POST to the API quote route (the preflight OPTIONS is ignored). */
export function isQuotePost(response: { url(): string; request(): { method(): string } }): boolean {
  return response.request().method() === "POST" && /\/quote-requests$/u.test(new URL(response.url()).pathname);
}

export function waitForQuotePost(page: Page): Promise<Response> {
  return page.waitForResponse((response) => isQuotePost(response));
}

/**
 * Rewrites the JSON body of the browser's next POST /quote-requests (the real API still answers): the way to
 * reach a server-side refusal that the client-side checks would never let through.
 */
export async function tamperQuotePost(page: Page, mutate: (body: Record<string, unknown>) => void): Promise<void> {
  await page.route("**/quote-requests", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    mutate(body);
    await route.continue({ postData: JSON.stringify(body) });
  });
}

export interface PublishedForm {
  formDefinitionId: string;
  consent: { consentTextId: string; version: string; contentHash: string };
}

export async function readPublishedForm(language: "fr" | "en" = "fr", productKey = "auto"): Promise<PublishedForm> {
  const result = await publicCall("GET", `/countries/CI/products/${productKey}/quote-form?language=${language}`);
  if (result.status !== 200) throw new Error(`quote-form ${productKey}/${language} -> ${result.status} ${result.text}`);
  return result.body as PublishedForm;
}

export interface DirectQuoteOptions {
  offerId: string;
  identity: VisitorIdentity;
  answers?: Record<string, unknown>;
  phone?: string;
  consentHash?: string;
  language?: "fr" | "en";
}

/** POST /quote-requests straight to the public API (what a forged client sends); each call uses one rate slot. */
export async function directQuote(options: DirectQuoteOptions): Promise<ApiResult> {
  const form = await readPublishedForm(options.language ?? "fr");
  return publicCall("POST", "/quote-requests", {
    json: {
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: form.formDefinitionId,
      language: options.language ?? "fr",
      selectedOfferId: options.offerId,
      contact: {
        firstName: options.identity.firstName,
        lastName: options.identity.lastName,
        email: options.identity.email,
        phone: options.phone ?? options.identity.phone
      },
      answers: options.answers ?? { vehicle_use: "prive", vehicle_brand: "Toyota", city: "Abidjan", contact_preference: "email" },
      consent: {
        accepted: true,
        consentTextId: form.consent.consentTextId,
        version: form.consent.version,
        contentHash: options.consentHash ?? form.consent.contentHash,
        multiBrokerAccepted: false
      }
    }
  });
}

/** Horizontal overflow of the current page: scrollWidth against the viewport width. */
export async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; widest: string }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    let widest = "";
    let widestRight = 0;
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const right = element.getBoundingClientRect().right;
      if (right > widestRight && right > limit + 1) {
        widestRight = right;
        widest = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0] ?? ""} right=${Math.round(right)}`;
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: limit, widest };
  });
}

/** Forbidden visitor vocabulary (T-08), matched on accent-free lowercase text with word boundaries. */
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "souscrire", pattern: /\bsouscrire\b/gu },
  { label: "acheter", pattern: /\bacheter\b/gu },
  { label: "payer", pattern: /\bpayer\b/gu },
  { label: "contrat valide", pattern: /\bcontrat valide\b/gu },
  { label: "garantie acceptee", pattern: /\bgarantie acceptee\b/gu },
  { label: "garanti", pattern: /\bgaranti\b/gu },
  { label: "buy now", pattern: /\bbuy now\b/gu },
  { label: "subscribe", pattern: /\bsubscribe\b/gu },
  { label: "guaranteed", pattern: /\bguaranteed\b/gu }
];

export function forbiddenVocabulary(text: string): string[] {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();
  const hits: string[] = [];
  for (const { label, pattern } of FORBIDDEN) {
    for (const match of plain.matchAll(pattern)) {
      const at = match.index ?? 0;
      hits.push(`"${label}" ... ${plain.slice(Math.max(0, at - 50), at + label.length + 50).replace(/\s+/gu, " ")}`);
    }
  }
  return hits;
}

/** Files of apps/packages (relative paths) whose source contains `needle`; test folders and build output excluded. */
export function filesContaining(needle: string, roots: string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".next" || entry === "tests" || entry === "dist") continue;
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?)$/u.test(entry) && readFileSync(full, "utf8").includes(needle)) found.push(path.relative(process.cwd(), full).replace(/\\/gu, "/"));
    }
  };
  for (const root of roots) walk(path.resolve(root));
  return found;
}
