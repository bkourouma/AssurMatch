import { expect, type Browser, type Page } from "@playwright/test";
import { api, expectStatus, itemsOfBody, rec } from "./admin-lot11";
import { createAdminAccount, EDGE_REASON, tokenOfPage, type EdgeAccount } from "./edge-p0p1-accounts";
import { openAs, type BackOfficeAccount } from "./backoffice";
import { sessionPage } from "./pro-roles";

// Lot 2 / platform edge cases: a sandbox that never touches CI nor SN.
//  - ZQ: "no consent, no form" country (internal) + one product linked: used for the activation refusals;
//        nothing valid is ever published on it.
//  - ZR: "forms" country (draft/internal): consent drafts, quote form drafts, attestations, stale status form.
//  - the product `e2e-l2-platform` (draft, never public) linked to both.
// Everything is found by its ISO code / key first, so the three passes of the spec reuse the same rows.

export interface PlatformSandbox {
  zqId: string;
  zrId: string;
  productId: string;
}

const ZQ = { isoCode: "ZQ", name: "Zonequalite E2E L2" };
const ZR = { isoCode: "ZR", name: "Zonetest E2E L2 formulaires" };
export const PRODUCT_KEY = "e2e-l2-platform";
export const PRODUCT_NAME = "Produit E2E L2 plateforme";

/** Valid lead_transmission text (names the recipient and the technical role of AssurMatch). */
export const VALID_CONSENT = "Je consens a la transmission de ma demande a {{brokerName}}. AssurMatch assure le role technique, ni courtier ni assureur.";

/** Fresh token of an account (logs in again when the 15 minutes session expired). */
export async function freshToken(browser: Browser, account: BackOfficeAccount): Promise<string> {
  const page = await sessionPage(browser, account);
  await openAs(page, account, "/");
  return tokenOfPage(page);
}

async function ensureCountry(token: string, def: { isoCode: string; name: string }): Promise<string> {
  const list = await api(token, "GET", "/admin/countries");
  expectStatus(list, 200, "list countries");
  const found = itemsOfBody(list.body).find((country) => country.isoCode === def.isoCode);
  if (found) return String(found.id);
  const created = await api(token, "POST", "/admin/countries", {
    ...def, currency: "XOF", languages: ["fr", "en"], timezone: "Africa/Abidjan", regulatoryFamily: "future", reason: EDGE_REASON
  });
  expectStatus(created, 201, `create country ${def.isoCode}`);
  return String(rec(created.body).id);
}

async function countryStatus(token: string, countryId: string): Promise<string> {
  const detail = await api(token, "GET", `/admin/countries/${countryId}`);
  expectStatus(detail, 200, "country detail");
  return String(rec(detail.body).status);
}

/** Moves a sandbox country to `internal` (from draft or suspended); a country already beyond is left alone. */
export async function ensureInternal(token: string, countryId: string): Promise<void> {
  const status = await countryStatus(token, countryId);
  if (status === "internal") return;
  const moved = await api(token, "POST", `/admin/countries/${countryId}/status`, { status: "internal", reason: EDGE_REASON });
  expectStatus(moved, 200, `country ${status} -> internal`);
}

/** Creates (or finds) the sandbox. Never touches CI or SN. */
export async function ensureSandbox(token: string): Promise<PlatformSandbox> {
  const zqId = await ensureCountry(token, ZQ);
  const zrId = await ensureCountry(token, ZR);
  await ensureInternal(token, zqId);
  await ensureInternal(token, zrId);
  const products = await api(token, "GET", "/admin/products");
  expectStatus(products, 200, "list products");
  let product = itemsOfBody(products.body).find((item) => item.key === PRODUCT_KEY);
  if (!product) {
    const created = await api(token, "POST", "/admin/products", { key: PRODUCT_KEY, name: PRODUCT_NAME, reason: EDGE_REASON });
    expectStatus(created, 201, "create product");
    product = rec(created.body);
  }
  const productId = String(product.id);
  for (const countryId of [zqId, zrId]) {
    const links = await api(token, "GET", `/admin/countries/${countryId}/products`);
    expectStatus(links, 200, "list links");
    if (!itemsOfBody(links.body).some((link) => link.productId === productId)) {
      const linked = await api(token, "POST", `/admin/countries/${countryId}/products`, { productId, reason: EDGE_REASON });
      expectStatus(linked, 201, "link product");
    }
  }
  return { zqId, zrId, productId };
}

export interface ConsentDraftInput {
  countryId: string;
  version: string;
  content: string;
  language?: "fr" | "en";
}

/** Creates a lead_transmission draft through the API (the screen creates the same row from its form). */
export async function createConsentDraft(token: string, input: ConsentDraftInput): Promise<string> {
  const created = await api(token, "POST", "/admin/consent-texts", {
    purpose: "lead_transmission",
    countryId: input.countryId,
    recipientCategory: "courtier_partenaire_agree",
    language: input.language ?? "fr",
    version: input.version,
    content: input.content,
    reason: EDGE_REASON
  });
  expectStatus(created, 201, `create consent draft ${input.version}`);
  return String(rec(created.body).id);
}

/** Retires every consent text and every quote form of the sandbox countries that is not retired yet. */
export async function cleanSandbox(token: string, countryIds: string[]): Promise<{ consentRetired: number; formsRetired: number }> {
  let consentRetired = 0;
  let formsRetired = 0;
  const texts = await api(token, "GET", "/admin/consent-texts");
  if (texts.status === 200) {
    for (const text of itemsOfBody(texts.body)) {
      if (!countryIds.includes(String(text.countryId)) || text.status === "retired") continue;
      const retired = await api(token, "POST", `/admin/consent-texts/${String(text.id)}/retire`, { reason: EDGE_REASON });
      if (retired.status === 200) consentRetired += 1;
    }
  }
  const forms = await api(token, "GET", "/admin/quote-form-definitions");
  if (forms.status === 200) {
    for (const form of itemsOfBody(forms.body)) {
      if (!countryIds.includes(String(form.countryId)) || form.status === "retired") continue;
      const retired = await api(token, "POST", `/admin/quote-form-definitions/${String(form.id)}/retire`, { reason: EDGE_REASON });
      if (retired.status === 200 || retired.status === 201) formsRetired += 1;
    }
  }
  return { consentRetired, formsRetired };
}

/** Disposable admin accounts of the spec (admin_pays scoped on the sandbox, support_admin). */
export async function createPlatformAccounts(browser: Browser, creator: BackOfficeAccount, sandbox: PlatformSandbox): Promise<{ adminPays: EdgeAccount; support: EdgeAccount }> {
  const creatorPage = await sessionPage(browser, creator);
  const adminPays = await createAdminAccount(browser, { roles: ["admin_pays"], label: "plat-ap", countryIds: [sandbox.zqId, sandbox.zrId], creatorPage });
  const support = await createAdminAccount(browser, { roles: ["support_admin"], label: "plat-su", creatorPage });
  return { adminPays, support };
}

/** Opens a consent text detail page. */
export async function openConsentText(page: Page, account: BackOfficeAccount, consentTextId: string): Promise<void> {
  await openAs(page, account, `/consent-texts/${consentTextId}`);
}

/** Clicks "Publier" on a consent detail page, fills the reason and confirms; returns the text of the open dialog. */
export async function publishFromDialog(page: Page): Promise<string> {
  const publishCard = page.locator("h2.bo-section-title").filter({ hasText: /^\s*Publier ce texte\s*$/u }).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bo-card ')][1]");
  await publishCard.getByRole("button", { name: "Publier" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Motif/u).fill(EDGE_REASON);
  await dialog.getByRole("button", { name: "Publier" }).last().click();
  // A refusal keeps the dialog open with a danger notice; an accepted publication unmounts it (or shows a success notice).
  let outcome = "";
  await expect.poll(async () => {
    if (await dialog.locator(".bo-notice[data-tone='danger']").count()) outcome = (await dialog.innerText()).replace(/\s+/gu, " ").trim();
    else if ((await dialog.count()) === 0 || (await dialog.locator(".bo-notice[data-tone='success']").count())) outcome = PUBLISHED_MARKER;
    return outcome === "" ? "pending" : "done";
  }, { timeout: 30_000, message: "publish dialog outcome" }).toBe("done");
  return outcome;
}

export const PUBLISHED_MARKER = "__published__";
