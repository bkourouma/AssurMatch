import { expect, request, type Locator, type Page } from "@playwright/test";
import { e2eEnv } from "./env";
import { uniqueSuffix } from "./ui";

// Helpers of the lot 3 edge cases of phase 3 (offers in draft, edge-p2-p4-03-offers-draft.spec.ts):
// direct calls to the offer API with the bearer token of a real session (PATCH included, which
// pro-roles.apiCall does not offer), the "Créer le brouillon" form filled through the real screen,
// the public catalogue read-back and a few payload builders. Nothing here touches the database.

export interface OfferApiResult {
  status: number;
  body: unknown;
  text: string;
}

export async function offerApi(token: string | undefined, method: "GET" | "POST" | "PATCH" | "PUT", path: string, data?: unknown): Promise<OfferApiResult> {
  const context = await request.newContext({
    baseURL: e2eEnv.apiUrl,
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {})
  });
  try {
    const response = await context.fetch(path, { method, ...(data === undefined ? {} : { data }) });
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

/** `code` and `message` of an error answer, flattened for assertion messages. */
export function errorOf(result: OfferApiResult): { code: string; message: string; blockers: Array<{ code: string; field?: string }> } {
  const body = rec(result.body);
  const message = Array.isArray(body.message) ? body.message.join("; ") : String(body.message ?? "");
  const blockers = Array.isArray(body.blockers) ? (body.blockers as Array<{ code: string; field?: string }>) : [];
  return { code: String(body.code ?? ""), message, blockers };
}

export function describeResult(result: OfferApiResult): string {
  const error = errorOf(result);
  return `HTTP ${result.status}${error.code ? ` ${error.code}` : ""}${error.message ? ` « ${error.message} »` : ""}`;
}

/* ------------------------------------------------------------------------------------ labels */

/** Unique label of the run, put in every name typed by this file ("E2E Courtage L3-<timestamp>"). */
export const L3 = `E2E Courtage L3-${Date.now().toString(36)}`;

export function offerName(tag: string): string {
  return `${L3} ${tag} ${uniqueSuffix()}`;
}

export function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------------------ public ids */

export interface Scope {
  countryId: string;
  autoId: string;
  voyageId: string;
}

/** CI and its Auto / Voyage product ids from the public catalogue (no state file involved). */
export async function loadScope(): Promise<Scope> {
  const countries = await offerApi(undefined, "GET", "/countries");
  const ci = (Array.isArray(countries.body) ? countries.body : []).map(rec).find((item) => item.isoCode === "CI");
  const countryId = String(ci?.id ?? "");
  const products = await offerApi(undefined, "GET", "/countries/CI/products");
  const list = (Array.isArray(products.body) ? products.body : []).map(rec);
  const autoId = String(list.find((item) => item.key === "auto")?.id ?? "");
  const voyageId = String(list.find((item) => item.key === "voyage")?.id ?? "");
  expect(countryId, "CI id").not.toBe("");
  expect(autoId, "auto id").not.toBe("");
  expect(voyageId, "voyage id").not.toBe("");
  return { countryId, autoId, voyageId };
}

/* ---------------------------------------------------------------------------------- payloads */

export const SOURCE = "Grille tarifaire du courtier, novembre 2026";

/** Content accepted by the API (no scope): update body. */
export function contentPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: offerName("Auto"),
    insurerName: "Assureur Atlantique CI",
    shortDescription: "Responsabilité civile et assistance, prix indicatif à confirmer par le courtier.",
    guaranteeSummary: "RC obligatoire et assistance",
    guaranteeLevel: 3,
    guarantees: [{ key: "responsabilite_civile", label: "Responsabilité civile", included: true }],
    indicativePriceMin: 85000,
    indicativePriceMax: 120000,
    currency: "XOF",
    pricingUnit: "an",
    validFrom: `${isoDay(0)}T00:00:00.000Z`,
    validUntil: `${isoDay(180)}T23:59:59.000Z`,
    sourceOfInformation: SOURCE,
    ...overrides
  };
}

/** Body of POST /broker/offers (content + scope). */
export function createPayload(scope: Scope, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { countryId: scope.countryId, productId: scope.autoId, ...contentPayload(overrides) };
}

/** A draft that passes the completeness minimum, created through the API (bearer token of an owner). */
export async function createDraft(token: string, scope: Scope, overrides: Record<string, unknown> = {}): Promise<{ id: string; name: string; view: Record<string, unknown> }> {
  const payload = createPayload(scope, overrides);
  const result = await offerApi(token, "POST", "/broker/offers", payload);
  expect(result.status, `create draft ${String(payload.name)}: ${describeResult(result)}`).toBe(201);
  const view = rec(result.body);
  return { id: String(view.id), name: String(payload.name), view };
}

/** Names of the broker's offers (published version first, else the version in progress). */
export async function offerNames(token: string): Promise<string[]> {
  const list = await offerApi(token, "GET", "/broker/offers");
  expect(list.status, "broker offer list").toBe(200);
  return (Array.isArray(list.body) ? list.body : []).map((item) => {
    const view = rec(item);
    return String(rec(rec(view.published).content).name ?? rec(rec(view.pending).content).name ?? view.publicKey ?? "");
  });
}

export async function brokerOffer(token: string, id: string): Promise<Record<string, unknown>> {
  const detail = await offerApi(token, "GET", `/broker/offers/${id}`);
  expect(detail.status, `read offer ${id}`).toBe(200);
  return rec(detail.body);
}

/* ------------------------------------------------------------------------------- public side */

/** Public catalogue of CI x Auto (unauthenticated JSON): `id` and `name` of every listed offer. */
export async function publicListing(): Promise<Array<{ id: string; name: string }>> {
  const result = await offerApi(undefined, "GET", "/countries/CI/products/auto/offers");
  expect(result.status, "public offer listing").toBe(200);
  return (Array.isArray(result.body) ? result.body : []).map((item) => ({ id: String(rec(item).id ?? ""), name: String(rec(item).name ?? "") }));
}

/* --------------------------------------------------------------------------- the create form */

export interface OfferFormValues {
  name: string;
  insurerName: string;
  shortDescription: string;
  guaranteeSummary: string;
  guaranteeLabels: string[];
  indicativePriceMin: string;
  indicativePriceMax: string;
  currency: string;
  pricingUnit: string;
  validFrom: string;
  validUntil: string;
  sourceOfInformation: string;
}

export function formValues(overrides: Partial<OfferFormValues> = {}): OfferFormValues {
  return {
    name: offerName("Form"),
    insurerName: "Assureur Atlantique CI",
    shortDescription: "Responsabilité civile et assistance, prix indicatif à confirmer par le courtier.",
    guaranteeSummary: "RC obligatoire et assistance",
    guaranteeLabels: ["Responsabilité civile"],
    indicativePriceMin: "85000",
    indicativePriceMax: "120000",
    currency: "XOF",
    pricingUnit: "an",
    validFrom: isoDay(0),
    validUntil: isoDay(180),
    sourceOfInformation: SOURCE,
    ...overrides
  };
}

/** The create form of /offers/new (the page must already be open). */
export function createForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.locator("select[name='scope']") });
}

/** The edit form of /offers/<id>. */
export function editForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.getByRole("button", { name: "Enregistrer le brouillon" }) });
}

/** Fills the create form (CI x Auto scope). Does not submit. */
export async function fillCreateForm(page: Page, values: OfferFormValues, options: { removeMaxLength?: boolean } = {}): Promise<Locator> {
  const form = createForm(page);
  // Playwright's fill() honours maxlength like a keyboard would; a forged request ignores it.
  if (options.removeMaxLength) await form.locator("input[maxlength], textarea[maxlength]").evaluateAll((nodes) => nodes.forEach((node) => node.removeAttribute("maxlength")));
  const scope = form.locator("select[name='scope']");
  const autoValue = await scope.locator("option", { hasText: "Côte d'Ivoire (CI) — Assurance auto" }).getAttribute("value");
  await scope.selectOption(autoValue ?? "");
  await form.locator("input[name='name']").fill(values.name);
  await form.locator("input[name='insurerName']").fill(values.insurerName);
  await form.locator("textarea[name='shortDescription']").fill(values.shortDescription);
  await form.locator("textarea[name='guaranteeSummary']").fill(values.guaranteeSummary);
  for (const [index, label] of values.guaranteeLabels.entries()) {
    if (index > 0) await form.getByRole("button", { name: "Ajouter une garantie" }).click();
    await form.locator("input[name='guaranteeLabel']").nth(index).fill(label);
  }
  await form.locator("input[name='indicativePriceMin']").fill(values.indicativePriceMin);
  await form.locator("input[name='indicativePriceMax']").fill(values.indicativePriceMax);
  await form.locator("input[name='currency']").fill(values.currency);
  await form.locator("input[name='pricingUnit']").fill(values.pricingUnit);
  await form.locator("input[name='validFrom']").fill(values.validFrom);
  await form.locator("input[name='validUntil']").fill(values.validUntil);
  await form.locator("input[name='sourceOfInformation']").fill(values.sourceOfInformation);
  return form;
}

export interface CreateOutcome {
  /** Set when the app redirected to the new offer. */
  offerId?: string;
  /** Text of the danger notice when the action was refused. */
  message?: string;
}

/**
 * Clicks "Créer le brouillon" and waits for the outcome: a redirect to /offers/<id> or a danger notice.
 * `bypassBrowserValidation` switches off the HTML constraints (required, minlength) so the server action and
 * the API are the ones answering.
 */
export async function submitCreateForm(page: Page, form: Locator, options: { bypassBrowserValidation?: boolean; doubleClick?: boolean } = {}): Promise<CreateOutcome> {
  if (options.bypassBrowserValidation) await form.evaluate((node) => ((node as HTMLFormElement).noValidate = true));
  const button = form.getByRole("button", { name: "Créer le brouillon" });
  if (options.doubleClick) await button.dblclick();
  else await button.click();
  await expect
    .poll(async () => {
      if (/\/offers\/[0-9a-f-]{36}/u.test(page.url())) return "created";
      if (await form.locator(".bo-notice[data-tone='danger']").count()) return "refused";
      return "pending";
    }, { timeout: 30_000, message: "outcome of Créer le brouillon" })
    .not.toBe("pending");
  const match = page.url().match(/\/offers\/([0-9a-f-]{36})/u);
  if (match) return { offerId: match[1] as string };
  const message = (await form.locator(".bo-notice[data-tone='danger']").first().innerText()).replace(/\s+/gu, " ").trim();
  return { message };
}

/** Text of the first notice (any tone) found in `scope`, whitespace collapsed. */
export async function noticeText(scope: Locator, tone: "success" | "danger" | "warning" | "info"): Promise<string> {
  const notice = scope.locator(`.bo-notice[data-tone='${tone}']`).first();
  await expect(notice, `${tone} notice`).toBeVisible({ timeout: 30_000 });
  return (await notice.innerText()).replace(/\s+/gu, " ").trim();
}

/** Collects the native dialogs (alert, confirm, prompt) a page opens: an executed XSS payload would show up here. */
const watched = new WeakSet<Page>();
export const dialogsSeen: string[] = [];
export function watchDialogs(page: Page): void {
  if (watched.has(page)) return;
  watched.add(page);
  page.on("dialog", (dialog) => {
    dialogsSeen.push(`${page.url()} -> ${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
}
