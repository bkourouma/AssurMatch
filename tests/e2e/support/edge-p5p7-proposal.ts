import { spawnSync } from "node:child_process";
import { expect, request, type Browser, type Locator, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./backoffice";
import { openAs } from "./edge-p5p7-login";
import { e2eEnv } from "./env";
import { quoteSlot } from "./edge-p5p7-support";
import { extractLink, waitForMail } from "./mailpit";
import { asRecord, apiCall, bearerToken, type ApiResult } from "./pro-roles";
import { reviewQuote } from "./quote-form";
import { card, uniqueSuffix } from "./ui";
import { appPage, type VisitorQuote } from "./world";

// Lot 4, spec 02 (lead handling and proposals): building blocks of edge-p5-p7-02-lead-proposal.spec.ts.
// Everything here is local to that spec: nothing of the shared support files is changed.

export type UploadFile = { name: string; mimeType: string; buffer: Buffer };

/** UTC calendar day `days` from now, as the `YYYY-MM-DD` value of the proposal form. */
export function isoDay(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Throwaway database (docker exec on the e2e Postgres container; only ever touches rows by id)
// ---------------------------------------------------------------------------------------------

const POSTGRES_CONTAINER = `${process.env.E2E_COMPOSE_PROJECT ?? "assurmatch-e2e"}-postgres-1`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function psql(sql: string): string {
  const result = spawnSync("docker", ["exec", POSTGRES_CONTAINER, "psql", "-U", "assurmatch_e2e", "-d", "assurmatch_e2e", "-t", "-A", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

/** H11: the minimal validity is tomorrow, so a proposal expires only by moving its date in the throwaway database. */
export function expireProposalInDatabase(proposalId: string): void {
  if (!UUID.test(proposalId)) throw new Error(`not a proposal id: ${proposalId}`);
  const out = psql(`update "LeadProposal" set "validUntil" = now() - interval '2 hours' where id = '${proposalId}' returning id`);
  if (!out.startsWith(proposalId)) throw new Error(`proposal ${proposalId} not updated: ${out}`);
}

export function proposalRowCount(assignmentId: string): number {
  if (!UUID.test(assignmentId)) throw new Error(`not an assignment id: ${assignmentId}`);
  return Number.parseInt(psql(`select count(*) from "LeadProposal" where "leadAssignmentId" = '${assignmentId}'`), 10);
}

/** Audit rows `cross_tenant_access` recorded against a lead assignment (target id). */
export function crossTenantAuditCount(assignmentId: string): number {
  if (!UUID.test(assignmentId)) throw new Error(`not an assignment id: ${assignmentId}`);
  return Number.parseInt(psql(`select count(*) from "AuditLog" where "targetId" = '${assignmentId}' and reason = 'cross_tenant_access'`), 10);
}

// ---------------------------------------------------------------------------------------------
// Broker API (bearer token of a real session)
// ---------------------------------------------------------------------------------------------

export interface ProposalPayload {
  message: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  guarantees?: string[];
  validUntil?: string;
}

export function validPayload(message: string, overrides: Partial<ProposalPayload> = {}): Record<string, unknown> {
  return { message, priceMin: 90_000, priceMax: 110_000, currency: "XOF", guarantees: ["Responsabilité civile"], validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...overrides };
}

export function sendProposalApi(token: string, assignmentId: string, payload: Record<string, unknown>): Promise<ApiResult> {
  return apiCall(token, "POST", `/broker/starter/leads/${assignmentId}/proposals`, payload);
}

/** Multipart send (`payload` JSON field plus a `file`), as the broker route handler relays it. */
export async function sendProposalMultipart(token: string, assignmentId: string, payload: Record<string, unknown>, file: UploadFile): Promise<ApiResult> {
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const response = await context.post(`/broker/starter/leads/${assignmentId}/proposals`, { multipart: { payload: JSON.stringify(payload), file } });
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

/**
 * GET on the broker app with the session of `page`. The session cookie is Secure and the stack runs on plain http,
 * so the token is replayed as an explicit Cookie header (page.request would not send it).
 */
export async function brokerGet(page: Page, path: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer; text: string }> {
  const token = await bearerToken(page);
  const context = await request.newContext({ extraHTTPHeaders: { Cookie: `assurmatch_broker_token=${token}` } });
  try {
    const response = await context.get(new URL(path, e2eEnv.brokerUrl).toString(), { maxRedirects: 0 });
    const body = await response.body();
    return { status: response.status(), headers: response.headers(), body, text: body.toString("utf8") };
  } finally {
    await context.dispose();
  }
}

export function listProposalsApi(token: string, assignmentId: string): Promise<ApiResult> {
  return apiCall(token, "GET", `/broker/starter/leads/${assignmentId}/proposals`);
}

export interface BrokerProposalView {
  id: string;
  status: string;
  message: string;
  responses: Array<Record<string, unknown>>;
}

export async function proposalsOf(token: string, assignmentId: string): Promise<{ items: BrokerProposalView[]; activeCount: number; canSend: boolean; blockers: string[] }> {
  const result = await listProposalsApi(token, assignmentId);
  expect(result.status, `list proposals of ${assignmentId}: ${result.text.slice(0, 200)}`).toBe(200);
  const body = asRecord(result.body);
  const items = (Array.isArray(body.items) ? body.items : []) as BrokerProposalView[];
  return { items, activeCount: Number(body.activeCount), canSend: body.canSend === true, blockers: (body.blockers as string[] | undefined) ?? [] };
}

export function proposalIdOf(result: ApiResult): string {
  expect(result.status, `proposal sent: ${result.text.slice(0, 200)}`).toBe(201);
  return String(asRecord(result.body).id);
}

export function errorCodeOf(result: ApiResult): string {
  return String(asRecord(result.body).code ?? "");
}

/** Leaves no mixed-case surprises: the API error body in one line (for assertion messages). */
export function brief(result: ApiResult): string {
  return `${result.status} ${result.text.replace(/\s+/gu, " ").slice(0, 240)}`;
}

// ---------------------------------------------------------------------------------------------
// Broker screen: the "Répondre au visiteur" card of /leads/<id> (Starter)
// ---------------------------------------------------------------------------------------------

export interface ProposalFormFields {
  message?: string;
  min?: string;
  max?: string;
  currency?: string;
  valid?: string;
  guarantees?: string;
  file?: UploadFile;
}

export function proposalCard(page: Page): Locator {
  return card(page, "Répondre au visiteur");
}

/** Fills the proposal composer of the open lead page (browser validation switched off to reach the server checks). */
export async function fillProposalForm(page: Page, fields: ProposalFormFields): Promise<Locator> {
  const panel = proposalCard(page);
  const form = panel.locator("form[aria-label='Nouvelle proposition au visiteur']");
  await form.evaluate((element) => {
    (element as HTMLFormElement).noValidate = true;
  });
  await panel.locator("#starter-proposal-message").fill(fields.message ?? "");
  await panel.locator("#starter-proposal-min").fill(fields.min ?? "");
  await panel.locator("#starter-proposal-max").fill(fields.max ?? "");
  if (fields.currency) await panel.locator("#starter-proposal-currency").selectOption(fields.currency);
  await panel.locator("#starter-proposal-valid").fill(fields.valid ?? "");
  await panel.locator("#starter-proposal-guarantees").fill(fields.guarantees ?? "");
  if (fields.file) await panel.locator("#starter-proposal-file").setInputFiles(fields.file);
  return panel;
}

/** Opens the lead, submits the composer and returns the text of the result notice of the card. */
export async function submitProposalOnScreen(page: Page, owner: BackOfficeAccount, assignmentId: string, fields: ProposalFormFields): Promise<string> {
  await openAs(page, owner, `/leads/${assignmentId}`);
  const panel = await fillProposalForm(page, fields);
  await Promise.all([page.waitForURL(/[?&]proposal=/u), panel.getByRole("button", { name: "Envoyer la proposition au visiteur" }).click()]);
  return proposalNotice(page);
}

/** The result notice (`?proposal=`) at the top of the "Répondre au visiteur" card. */
export async function proposalNotice(page: Page): Promise<string> {
  const notice = proposalCard(page).locator(".bo-notice").first();
  await expect(notice).toBeVisible();
  return (await notice.innerText()).replace(/\s+/gu, " ").trim();
}

/**
 * Submits the composer although the preventive block disabled it (limit reached, lead not accepted or closed):
 * the disabled fieldset is lifted in the page so the server-side refusal can be read on screen.
 * Returns the text of the result notice.
 */
export async function forceSubmitProposal(page: Page, fields: ProposalFormFields): Promise<string> {
  const panel = proposalCard(page);
  await panel.locator("fieldset[data-tenant-read-only]").evaluate((fieldset) => {
    (fieldset as HTMLFieldSetElement).disabled = false;
  });
  await fillProposalForm(page, fields);
  await Promise.all([page.waitForURL(/[?&]proposal=/u), panel.getByRole("button", { name: "Envoyer la proposition au visiteur" }).click()]);
  return (await proposalCard(page).locator(".bo-notice").first().innerText()).replace(/\s+/gu, " ").trim();
}

export async function withdrawOnScreen(page: Page, proposalMessageStart: string): Promise<void> {
  const item = proposalCard(page).locator("article").filter({ hasText: proposalMessageStart }).first();
  await item.getByRole("button", { name: "Retirer cette proposition" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await Promise.all([page.waitForURL(/[?&]proposal=/u), dialog.getByRole("button", { name: "Retirer", exact: true }).click()]);
}

// ---------------------------------------------------------------------------------------------
// Visitor: a quote with free-text answers of our choosing (XSS / SQL / formula), and the tracking space
// ---------------------------------------------------------------------------------------------

/** Same journey as `requestQuote` (real screens, named consent) with free-text answers chosen by the caller. */
export async function requestQuoteWithAnswers(browser: Browser, offerTitle: string, partnerName: string, label: string, answers: { brand: string; city: string }): Promise<VisitorQuote> {
  await quoteSlot();
  const email = `visiteur.${label}.${uniqueSuffix()}@visitor.e2e.test`;
  const phone = `+22501${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/CI/produits/auto/offres");
  const offer = visitor.getByRole("article", { name: offerTitle, exact: true });
  await expect(offer).toContainText(partnerName);
  await offer.getByRole("link", { name: "Demander un devis" }).click();
  await visitor.waitForURL(/\/devis\?offerId=/u);
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill(answers.brand);
  await visitor.locator("#am-answer-city").fill(answers.city);
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await visitor.locator("#am-quote-first-name").fill("Mariam");
  await visitor.locator("#am-quote-last-name").fill("Traoré");
  await visitor.locator("#am-quote-email").fill(email);
  await visitor.locator("#am-quote-phone").fill(phone);
  await reviewQuote(visitor);
  await visitor.locator("#am-quote-consent").check();
  await visitor.getByRole("button", { name: "Envoyer ma demande" }).click();
  const reference = visitor.getByText(/QR-[A-Z0-9-]+/u).first();
  await expect(reference).toBeVisible();
  const quoteReference = (await reference.innerText()).match(/QR-[A-Z0-9-]+/u)?.[0] as string;
  await visitor.context().close();
  const mail = await waitForMail({ to: email, body: new RegExp(quoteReference, "u") });
  const trackingLink = extractLink(mail, new RegExp(`/demandes-de-devis/${quoteReference}\\?token=`, "u"));
  return { reference: quoteReference, email, name: "Mariam Traoré", phone, trackingLink };
}

export interface VisitorProposalView {
  id: string;
  status: string;
  canRespond: boolean;
  message: string;
}

/** The proposals the visitor sees (public API; counts as one tracking-page consultation). */
export function visitorProposalsFrom(result: ApiResult): VisitorProposalView[] {
  const list = asRecord(result.body).proposals;
  return (Array.isArray(list) ? list : []) as VisitorProposalView[];
}

/** The card of one proposal on the tracking space. */
export function visitorProposalCard(page: Page, proposalId: string): Locator {
  return page.locator(`article[data-proposal-id='${proposalId}']`);
}

/** No script ran and no markup was injected from `text` on this page. */
export async function expectInert(page: Page, what: string): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `${what}: script executed`).toBeUndefined();
  await expect(page.locator("img[onerror], [data-xss]"), `${what}: injected element`).toHaveCount(0);
}
