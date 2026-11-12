import { execFileSync } from "node:child_process";
import { expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { adminToken, api } from "./admin-lot11";
import { e2ePassword, newAppContext, openAs, activateWithMfa, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { loadJourneyState, requireState } from "./journey-state";
import { extractLink, waitForMail } from "./mailpit";
import { apiCall, asRecord, tokenFor, type ApiResult } from "./pro-roles";
import { superAdminAccount, addDays, isoDate } from "./world";
import { idFromUrl, uniqueSuffix } from "./ui";

// Lot 3 (edge cases of phase 4, "validation et publication"): helpers of
// tests/e2e/edge-p2-p4-04-validation-publication.spec.ts. The offers are fabricated through the API
// with the bearer token of the throwaway broker (the creation screen is covered by scenario-core and
// by another file); the decisions, the corrections and every message under test go through the real
// screens. Nothing here writes the shared journey state.

/** One run = one label, added to every name this file types ("E2E Courtage L3-<timestamp>"). */
export const RUN_LABEL = `E2E Courtage L3-${Date.now()}`;
export const DECISION_REASON = `${RUN_LABEL} decision`;

const POSTGRES_CONTAINER = process.env.E2E_L3V_POSTGRES_CONTAINER ?? "assurmatch-e2e-postgres-1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// -------------------------------------------------------------------------------- tokens

/** Bearer tokens last as long as the 15-minute back-office session: refreshed after 8 minutes. */
export class TokenSource {
  private token = "";
  private issuedAt = 0;

  constructor(private readonly fetchToken: () => Promise<string>) {}

  async get(): Promise<string> {
    if (!this.token || Date.now() - this.issuedAt > 8 * 60_000) {
      this.token = await this.fetchToken();
      this.issuedAt = Date.now();
    }
    return this.token;
  }
}

export function brokerTokenSource(browser: Browser, account: BackOfficeAccount): TokenSource {
  return new TokenSource(() => tokenFor(browser, account));
}

export function adminTokenSource(browser: Browser, account: BackOfficeAccount): TokenSource {
  return new TokenSource(() => adminToken(browser, account));
}

// ------------------------------------------------------------------------------ offers via API

export interface OfferScope {
  countryId: string;
  productId: string;
}

/** CI x Assurance auto, read from the broker coverage (the same list as the creation screen). */
export async function ciAutoScope(token: string): Promise<OfferScope> {
  const coverage = await apiCall(token, "GET", "/broker/offers/coverage");
  expect(coverage.status, `coverage -> ${coverage.text.slice(0, 200)}`).toBe(200);
  const items = Array.isArray(coverage.body) ? (coverage.body as Array<Record<string, unknown>>) : [];
  const item = items.find((entry) => entry.countryIsoCode === "CI" && /auto/iu.test(String(entry.productName)));
  expect(item, "the broker covers CI x Assurance auto").toBeDefined();
  return { countryId: String(item?.countryId), productId: String(item?.productId) };
}

export interface OfferOptions {
  indicativePriceMin?: number;
  indicativePriceMax?: number;
  validFrom?: string;
  validUntil?: string;
  publicDisclaimers?: string[];
  [key: string]: unknown;
}

export function offerTitle(tag: string): string {
  return `Auto ${tag} ${RUN_LABEL}-${uniqueSuffix()}`;
}

export function offerBody(scope: OfferScope, name: string, options: OfferOptions = {}): Record<string, unknown> {
  const now = new Date();
  return {
    countryId: scope.countryId,
    productId: scope.productId,
    name,
    insurerName: "Assureur Atlantique CI",
    shortDescription: "Responsabilité civile, défense recours et assistance 24h/24.",
    guaranteeSummary: "RC obligatoire, défense recours, assistance",
    guaranteeLevel: 3,
    guarantees: [
      { key: "rc", label: "Responsabilité civile", included: true },
      { key: "assistance", label: "Assistance 24h/24", included: true }
    ],
    exclusionsSummary: "Conduite sans permis, usage course.",
    deductibleAmount: 50000,
    processingDelayDays: 2,
    indicativePriceMin: 85000,
    indicativePriceMax: 120000,
    currency: "XOF",
    pricingUnit: "an",
    paymentFlexibility: "quarterly",
    validFrom: `${isoDate(now)}T00:00:00.000Z`,
    validUntil: `${isoDate(addDays(now, 180))}T23:59:59.000Z`,
    sourceOfInformation: `Grille tarifaire du courtier, ${RUN_LABEL}`,
    ...options
  };
}

function id(result: ApiResult): string {
  const value = String(asRecord(result.body).id ?? "");
  expect(value, `offer id in ${result.text.slice(0, 200)}`).toMatch(UUID);
  return value;
}

export async function createOffer(token: string, scope: OfferScope, name: string, options: OfferOptions = {}): Promise<string> {
  const created = await apiCall(token, "POST", "/broker/offers", offerBody(scope, name, options));
  expect(created.status, `create offer ${name} -> ${created.text.slice(0, 300)}`).toBeLessThan(300);
  return id(created);
}

/** PATCH /broker/offers/:id (full content, strict schema: no country / product). */
export async function updateOffer(token: string, offerId: string, name: string, options: OfferOptions = {}): Promise<ApiResult> {
  const body = offerBody({ countryId: "", productId: "" }, name, options);
  delete body.countryId;
  delete body.productId;
  return api(token, "PATCH", `/broker/offers/${offerId}`, body);
}

export async function submitOffer(token: string, offerId: string): Promise<void> {
  const submitted = await apiCall(token, "POST", `/broker/offers/${offerId}/submit`, {});
  expect(submitted.status, `submit ${offerId} -> ${submitted.text.slice(0, 300)}`).toBeLessThan(300);
}

export type Decision = "validate" | "reject" | "suspend";

export async function adminDecision(token: string | undefined, offerId: string, action: Decision, reason: string): Promise<ApiResult> {
  return apiCall(token, "POST", `/admin/offers/${offerId}/${action}`, { reason });
}

export async function adminOffer(token: string, offerId: string): Promise<Record<string, unknown>> {
  const detail = await apiCall(token, "GET", `/admin/offers/${offerId}`);
  expect(detail.status, `admin offer ${offerId} -> ${detail.text.slice(0, 200)}`).toBe(200);
  return asRecord(detail.body);
}

export async function brokerOffer(token: string, offerId: string): Promise<Record<string, unknown>> {
  const detail = await apiCall(token, "GET", `/broker/offers/${offerId}`);
  expect(detail.status, `broker offer ${offerId} -> ${detail.text.slice(0, 200)}`).toBe(200);
  return asRecord(detail.body);
}

/** Effective status of an offer as the compliance back-office reads it (draft, submitted, published, suspended, withdrawn, expired). */
export async function statusOf(token: string, offerId: string): Promise<string> {
  return String((await adminOffer(token, offerId)).status);
}

// ---------------------------------------------------------------------------- public (read only)

async function publicGet(path: string): Promise<{ status: number; text: string }> {
  const context = await request.newContext({ baseURL: e2eEnv.publicUrl });
  try {
    const response = await context.get(path);
    return { status: response.status(), text: await response.text() };
  } finally {
    await context.dispose();
  }
}

export const PUBLIC_LIST = "/pays/CI/produits/auto/offres";

/** True when the public CI x Auto comparator lists the offer (matched by its unique title). */
export async function listedPublicly(title: string): Promise<boolean> {
  const page = await publicGet(PUBLIC_LIST);
  return page.status === 200 && page.text.includes(title);
}

/** Polls the public comparator (same budget as SC-10-LIC-4) until the offer is, or is no longer, listed. */
export async function waitPublicListing(title: string, listed: boolean, timeoutMs = 120_000): Promise<number> {
  const started = Date.now();
  await expect
    .poll(() => listedPublicly(title), { timeout: timeoutMs, intervals: [1_000, 2_000, 3_000, 5_000], message: `"${title}" ${listed ? "listed" : "no longer listed"} on ${PUBLIC_LIST}` })
    .toBe(listed);
  return Math.round((Date.now() - started) / 1000);
}

/** Visible digits of the public detail page: prices are grouped with (narrow) no-break spaces. */
export async function publicDetailDigits(offerId: string): Promise<{ status: number; digits: string; text: string }> {
  const page = await publicGet(`/offres/${offerId}?country=CI&product=auto`);
  return { status: page.status, digits: page.text.replace(/[\s\u00A0\u202F]/gu, ""), text: page.text };
}

/** E-P4-03a: a non public offer answers 200 "Offre indisponible" (never a 404) with the button back to the comparator. */
export async function expectOfferUnavailable(browser: Browser, offerId: string, why: string): Promise<{ status: number | undefined; button: string }> {
  const context = await newAppContext(browser, e2eEnv.publicUrl);
  try {
    const page = await context.newPage();
    const response = await page.goto(`/offres/${offerId}?country=CI&product=auto`);
    expect(response?.status(), `${why}: HTTP status of /offres/${offerId}`).toBe(200);
    await expect(page.getByRole("heading", { name: "Offre indisponible" }), `${why}: title`).toBeVisible();
    await expect(page.getByText("Cette offre n'est plus affichée publiquement."), `${why}: sentence`).toBeVisible();
    // The button of the empty state itself (the navigation also carries a "Comparer les offres" link).
    const button = page.locator("main").getByRole("link", { name: "Comparer les offres" });
    await expect(button.first(), `${why}: button`).toBeVisible();
    await expect(button.first(), `${why}: button target`).toHaveAttribute("href", /\/pays\/CI\/produits\/auto\/offres/u);
    return { status: response?.status(), button: "Comparer les offres" };
  } finally {
    await context.close();
  }
}

// -------------------------------------------------------------------- admin decision (screens)

export const DECISION_LABEL: Record<Decision, string> = {
  validate: "Valider et publier",
  reject: "Refuser",
  suspend: "Suspendre"
};

export interface DecisionOutcome {
  ok: boolean;
  /** Text of the notices of the dialog (refusal) or of the server action answer (success). */
  message: string;
  /** Texts of the blocking controls listed under a 422. */
  blockers: string[];
  /** The dialog is still open after the answer (refusal). */
  dialogStillOpen: boolean;
  /** Page URL once the answer is in (a session expiry may redirect to /login). */
  url: string;
}

/**
 * Records every `.bo-notice` that appears on the page ("tone: text"), even for a moment: after a successful
 * decision the page re-renders and the form that carried the notice may unmount at once, so the notice is
 * only readable by observing the DOM while it lasts.
 */
export async function watchNotices(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __l3vNotices?: string[]; __l3vObserver?: MutationObserver };
    w.__l3vNotices = [];
    w.__l3vObserver?.disconnect();
    const scan = () => {
      document.querySelectorAll(".bo-notice").forEach((node) => {
        // Only the notices of an action (form, dialog, decision block), not the status notices of the page itself.
        if (!node.closest("form, dialog, [data-offer-decision], [data-offer-withdraw]")) return;
        const entry = `${node.getAttribute("data-tone") ?? "?"}: ${(node as HTMLElement).innerText.replace(/\s+/g, " ").trim()}`;
        if (!w.__l3vNotices?.includes(entry)) w.__l3vNotices?.push(entry);
      });
    };
    w.__l3vObserver = new MutationObserver(scan);
    w.__l3vObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    scan();
  });
}

export async function seenNotices(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __l3vNotices?: string[] }).__l3vNotices ?? []).catch(() => []);
}

/** Collects the message of the server actions a page triggers (kept for the "no action sent" assertions). */
export function recordActionAnswers(page: Page): { bodies: string[]; stop: () => void } {
  const bodies: string[] = [];
  const listener = async (response: { request(): { method(): string; headers(): Record<string, string> }; text(): Promise<string> }) => {
    if (response.request().method() !== "POST" || !response.request().headers()["next-action"]) return;
    bodies.push(await response.text().catch(() => ""));
  };
  page.on("response", listener);
  return { bodies, stop: () => page.off("response", listener) };
}

/**
 * Clicks a decision of /offers/<id> (admin), fills the audited reason and confirms. Never throws on a refusal:
 * the caller asserts on the outcome (notices and blocker list as the screen shows them).
 */
export async function decideInUi(page: Page, action: Decision, reason: string): Promise<DecisionOutcome> {
  const label = DECISION_LABEL[action];
  const scope = page.locator(`[data-offer-decision='${action}']`);
  await scope.getByRole("button", { name: label }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.locator("input[name='reason']").fill(reason);
  await watchNotices(page);
  const recorder = recordActionAnswers(page);
  await dialog.getByRole("button", { name: label }).last().click();
  await expect
    .poll(async () => {
      if ((await seenNotices(page)).length > 0) return "answered";
      if (recorder.bodies.length > 0 || (await dialog.count()) === 0) return "answered";
      return "pending";
    }, { timeout: 30_000, message: `answer of ${label}` })
    .toBe("answered");
  await page.waitForTimeout(600);
  recorder.stop();
  const notices = await seenNotices(page);
  const dialogStillOpen = (await dialog.count()) > 0;
  const blockers = dialogStillOpen
    ? (await dialog.locator("[data-offer-blockers] li").allInnerTexts()).map((text) => text.replace(/\s+/gu, " ").trim())
    : [];
  const danger = notices.filter((entry) => entry.startsWith("danger:"));
  const ok = danger.length === 0 && !recorder.bodies.some((body) => /"status":"error"/u.test(body));
  if (dialogStillOpen) await dialog.getByRole("button", { name: /Annuler|Fermer/u }).first().click().catch(() => undefined);
  return { ok, message: notices.join(" | "), blockers, dialogStillOpen, url: page.url() };
}

/** True when an answer of a server action contains the exact message. */
export function answered(outcome: DecisionOutcome, message: string): boolean {
  return outcome.message.includes(message);
}

// --------------------------------------------------------------------------- own-rows SQL helper

const ownedOffers = new Set<string>();

export function ownOffer(offerId: string): void {
  expect(offerId).toMatch(UUID);
  ownedOffers.add(offerId);
}

/**
 * Throwaway stack only: puts the validity of ONE offer of this file in the past (the version in progress or the
 * published one, and the projection read by the public catalogue). Filtered by the offer id, which must be one
 * this file created. Returns the output of psql.
 */
export function pastValidity(offerId: string, scope: "pending" | "published" | "both"): string {
  if (!ownedOffers.has(offerId) || !UUID.test(offerId)) throw new Error(`refusing SQL on an offer this file did not create: ${offerId}`);
  const statuses = scope === "pending" ? "'draft','submitted'" : scope === "published" ? "'published'" : "'draft','submitted','published'";
  const statements = [
    `UPDATE "OfferVersion" SET "validFrom" = now() - interval '10 days', "validUntil" = now() - interval '1 day' WHERE "offerId" = '${offerId}' AND status IN (${statuses})`
  ];
  if (scope !== "pending") statements.push(`UPDATE "Offer" SET "validFrom" = now() - interval '10 days', "validUntil" = now() - interval '1 day' WHERE id = '${offerId}'`);
  return statements
    .map((statement) => execFileSync("docker", ["exec", POSTGRES_CONTAINER, "psql", "-U", "assurmatch_e2e", "-d", "assurmatch_e2e", "-c", statement], { encoding: "utf8" }).trim())
    .join(" | ");
}

// ------------------------------------------------------------------------- extra admin account

/**
 * An admin_pays account scoped to Côte d'Ivoire, created through the real /users screen (the scope field takes
 * country UUIDs). Kept in memory only: nothing is written to the shared account files.
 */
export async function adminPaysAccount(browser: Browser, label: string): Promise<BackOfficeAccount> {
  const countryId = requireState(loadJourneyState(), "countryId");
  const email = `${label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  const adminContext = await newAppContext(browser, e2eEnv.adminUrl);
  const admin = await adminContext.newPage();
  await openAs(admin, superAdminAccount(), "/users");
  const create = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Créer et émettre activation" }) });
  await create.locator("input[name='email']").fill(email);
  await create.locator("input[name='displayName']").fill(`${label} E2E`);
  await create.locator("input[name='roles'][value='admin_pays']").check();
  await create.locator("input[name='countryScopes']").fill(countryId);
  await create.locator("textarea[name='reason']").fill(`${RUN_LABEL} compte admin_pays de test`);
  await create.getByRole("button", { name: "Créer et émettre activation" }).click();
  const mail = await waitForMail({ to: email });
  const link = extractLink(mail, /\/activate\?token=/u);
  await adminContext.close();
  const page = await (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
  const password = e2ePassword(label);
  const totpSecret = await activateWithMfa(page, link, password);
  await page.context().close();
  return { app: "admin", email, password, totpSecret };
}

/** A context of the admin app that carries the given bearer token as its session cookie (token of another app). */
export async function adminContextWithToken(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await newAppContext(browser, e2eEnv.adminUrl);
  const url = new URL(e2eEnv.adminUrl);
  await context.addCookies([{ name: "assurmatch_admin_token", value: token, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  return context;
}

export { idFromUrl };
