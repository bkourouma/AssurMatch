import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Browser, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { publicCall } from "./recos-062b";
import { card, confirmInDialog, fillReason, idFromUrl, rowWith, uniqueSuffix } from "./ui";
import { addDays, appPage, complianceAccount, isoDate, WORLD_REASON } from "./world";

// Lot 11a (specs 067, 068, 070): building blocks of the visitor gap journeys. Everything goes through
// the real screens, except the two things that have no screen by design: the audited compliance
// command for the sensitive flag `multi_broker_routing_enabled`, and read-only API probes.

// Playwright runs from the repository root (playwright.e2e.config.ts), like support/env.ts assumes.
const PROJECT_ROOT = process.cwd();

export const VG_REASON = "Parcours E2E lot 11a (specs 067, 068, 070)";

export interface QuoteOptionsView {
  multiBrokerAvailable: boolean;
  maxOffers: number;
  documentUploadEnabled: boolean;
  offers: Array<{ offerId: string; partnerId?: string; partnerName?: string }>;
  brokers: Array<{ id: string; displayName: string }>;
}

/** `GET /countries/:c/products/:p/quote-options` (public, no personal data). */
export async function readQuoteOptions(offerIds: string[] = [], countryCode = "CI", productKey = "auto"): Promise<QuoteOptionsView> {
  const query = offerIds.length > 0 ? `?offerIds=${offerIds.join(",")}` : "";
  const result = await publicCall("GET", `/countries/${countryCode}/products/${productKey}/quote-options${query}`);
  expect(result.status, `quote-options -> ${result.status} ${result.text}`).toBe(200);
  return result.body as QuoteOptionsView;
}

/**
 * Polls the public quote options until `predicate` holds: global flags are re-read by the API every
 * few seconds (ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS=5 on this stack).
 */
export async function waitForQuoteOptions(predicate: (options: QuoteOptionsView) => boolean, message: string, offerIds: string[] = []): Promise<QuoteOptionsView> {
  let last: QuoteOptionsView | undefined;
  await expect
    .poll(async () => {
      last = await readQuoteOptions(offerIds);
      return predicate(last);
    }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000], message })
    .toBe(true);
  return last as QuoteOptionsView;
}

interface E2eEnvModule {
  backendEnv: () => Record<string, string>;
}

async function importBackendEnv(file: string): Promise<E2eEnvModule> {
  // Computed URL: the orchestrator settings are a plain .mjs module, not part of the TypeScript program.
  return (await import(pathToFileURL(file).href)) as E2eEnvModule;
}

/**
 * Applies a compliance decision to the SENSITIVE global flag `multi_broker_routing_enabled` with the
 * audited command `scripts/ops/apply-flag-policy.ts` (no admin toggle exists for it by design,
 * constitution III). Runs on the host against the stack database, exactly like the orchestrator does
 * for SC-08. The only flag these journeys open: no AI flag is ever touched.
 */
export async function setMultiBrokerPolicy(value: boolean, reference: string): Promise<void> {
  const settings = await importBackendEnv(path.join(PROJECT_ROOT, "scripts", "e2e", "e2e-env.mjs"));
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/ops/apply-flag-policy.ts", "--flag", "multi_broker_routing_enabled", "--value", String(value), "--reference", reference, "--approved-by", "Conformite E2E", "--reason", `Parcours E2E lot 11a : multi_broker_routing_enabled -> ${value}`],
    { cwd: PROJECT_ROOT, env: { ...process.env, ...settings.backendEnv() }, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`apply-flag-policy multi_broker_routing_enabled=${value} failed (exit ${result.status}): ${result.stderr || result.stdout}`);
}

/** Whether a global flag is currently on, read from the /feature-flags screen of the admin page. */
export async function globalFlagIsOn(page: Page, key: string): Promise<boolean> {
  await page.goto("/feature-flags");
  const row = rowWith(page, key);
  await expect(row, `flag ${key} listed`).toBeVisible();
  return await row.getByRole("button", { name: "Desactiver", exact: true }).isVisible();
}

export interface OfferTypeOptions {
  offerType?: "indicative" | "private";
  /** One document per line in the "Documents requis" field of the offer. */
  requiredDocuments?: string[];
}

/**
 * Same path as `publishOffer` of world.ts (the broker drafts a CI x Auto offer and submits it, the
 * Compliance Admin validates it), with the spec 070 offer type and the offer's required documents.
 */
export async function publishOfferWith(browser: Browser, owner: BackOfficeAccount, label: string, options: OfferTypeOptions = {}): Promise<{ offerId: string; offerTitle: string }> {
  const offerTitle = `Auto ${label} E2E ${uniqueSuffix()}`;
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, owner, "/offers/new");
  const form = broker.locator("form").filter({ has: broker.locator("select[name='scope']") });
  const scope = form.locator("select[name='scope']");
  const autoValue = await scope.locator("option", { hasText: "Côte d'Ivoire (CI) — Assurance auto" }).getAttribute("value");
  await scope.selectOption(autoValue ?? "");
  if (options.offerType) await form.locator("select[name='offerType']").selectOption(options.offerType);
  await form.locator("input[name='name']").fill(offerTitle);
  await form.locator("input[name='insurerName']").fill("Assureur Atlantique CI");
  await form.locator("textarea[name='shortDescription']").fill("Responsabilité civile, défense recours et assistance 24h/24.");
  await form.locator("textarea[name='guaranteeSummary']").fill("RC obligatoire, défense recours, assistance");
  await form.locator("select[name='guaranteeLevel']").selectOption("3");
  await expect(form.locator("input[name='guaranteeLabel']")).toHaveCount(1);
  await form.locator("input[name='guaranteeLabel']").first().fill("Responsabilité civile");
  await form.getByRole("button", { name: "Ajouter une garantie" }).click();
  await form.locator("input[name='guaranteeLabel']").nth(1).fill("Assistance 24h/24");
  await form.locator("textarea[name='exclusionsSummary']").fill("Conduite sans permis, usage course.");
  if (options.requiredDocuments?.length) await form.locator("textarea[name='requiredDocuments']").fill(options.requiredDocuments.join("\n"));
  await form.locator("input[name='deductibleAmount']").fill("50000");
  await form.locator("input[name='processingDelayDays']").fill("2");
  await form.locator("input[name='indicativePriceMin']").fill("85000");
  await form.locator("input[name='indicativePriceMax']").fill("120000");
  await form.locator("input[name='currency']").fill("XOF");
  await form.locator("input[name='pricingUnit']").fill("an");
  await form.locator("select[name='paymentFlexibility']").selectOption("quarterly");
  await form.locator("input[name='validFrom']").fill(isoDate(new Date()));
  await form.locator("input[name='validUntil']").fill(isoDate(addDays(new Date(), 180)));
  await form.locator("input[name='sourceOfInformation']").fill("Grille tarifaire du courtier, octobre 2026");
  await form.getByRole("button", { name: "Créer le brouillon" }).click();
  await broker.waitForURL(/\/offers\/[0-9a-f-]{36}/u);
  const offerId = idFromUrl(broker);
  await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
  await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();
  await broker.context().close();

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, complianceAccount(), `/offers/${offerId}`);
  await confirmInDialog(admin, admin.locator("[data-offer-decision='validate']"), "Valider et publier", (dialog) => fillReason(dialog, WORLD_REASON));
  await expect(admin.locator("[data-offer-decision='suspend']")).toBeVisible();
  await admin.context().close();
  return { offerId, offerTitle };
}

/** Answers of the need step of the CI x Auto quote form (the fields published by the scenario). */
export async function fillAutoNeed(visitor: Page): Promise<void> {
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill("Toyota");
  await visitor.locator("#am-answer-city").fill("Abidjan");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
}

export interface VisitorIdentity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function newVisitor(label: string, names: { firstName?: string; lastName?: string } = {}): VisitorIdentity {
  return {
    firstName: names.firstName ?? "Mariam",
    lastName: names.lastName ?? "Traoré",
    email: `visiteur.${label}.${uniqueSuffix()}@visitor.e2e.test`,
    // A distinct number per visitor (spec 066 F1 flags a shared number as a possible duplicate).
    phone: `+22501${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`
  };
}

/** Fills the need step then the contact step, stopping before the "Vérifier ma demande" button. */
export async function fillNeedAndContact(visitor: Page, identity: VisitorIdentity): Promise<void> {
  await fillAutoNeed(visitor);
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await visitor.locator("#am-quote-first-name").fill(identity.firstName);
  await visitor.locator("#am-quote-last-name").fill(identity.lastName);
  await visitor.locator("#am-quote-email").fill(identity.email);
  await visitor.locator("#am-quote-phone").fill(identity.phone);
}

/**
 * The public API allows 5 quote requests per minute and per IP, country and product (PublicQuoteRateLimitService):
 * a test that sends several requests waits for a fresh window first (all the visitors of the suite share 127.0.0.1).
 */
export async function waitForFreshQuoteRateWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 61_000));
}

/** Ticks the main consent, sends the request and returns the QR- reference of the confirmation. */
export async function consentAndSend(visitor: Page): Promise<string> {
  await visitor.locator("#am-quote-consent").check();
  await visitor.getByRole("button", { name: "Envoyer ma demande" }).click();
  const reference = visitor.getByText(/QR-[A-Z0-9-]+/u).first();
  await expect(reference).toBeVisible();
  return (await reference.innerText()).match(/QR-[A-Z0-9-]+/u)?.[0] as string;
}

/** Whether the broker's lead list (own back-office session on `page`) shows the request. */
export async function brokerSeesLead(page: Page, account: BackOfficeAccount, reference: string): Promise<boolean> {
  // One page is reused for several brokers: drop the previous session, or openAs keeps the previous broker logged in.
  await page.context().clearCookies();
  await openAs(page, account, "/leads");
  return (await page.getByRole("row").filter({ hasText: reference }).count()) > 0;
}

/** Waits until the lead shows up for the broker that must hold it (routing is synchronous, mails are not). */
export async function expectBrokerHasLead(page: Page, account: BackOfficeAccount, reference: string, label: string): Promise<void> {
  await expect.poll(() => brokerSeesLead(page, account, reference), { timeout: 60_000, intervals: [1_000, 3_000], message: `${label} holds ${reference}` }).toBe(true);
}

export async function expectBrokerLacksLead(page: Page, account: BackOfficeAccount, reference: string, label: string): Promise<void> {
  expect(await brokerSeesLead(page, account, reference), `${label} must not hold ${reference}`).toBe(false);
}

/** Age in seconds of the worker heartbeat file, or undefined when the stack does not expose it on this host. */
export function workerHeartbeatAgeSeconds(): number | undefined {
  const file = process.env.E2E_WORKER_HEARTBEAT_FILE;
  if (!file || !existsSync(file)) return undefined;
  return (Date.now() - statSync(file).mtimeMs) / 1000;
}
