import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, request, test } from "@playwright/test";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadJourneyState, requireState, requireWorld } from "./support/journey-state";
import { publicCall, adminBearerToken } from "./support/recos-062b";
import { VG_REASON, publishOfferWith, readQuoteOptions } from "./support/visitor-gaps";
import { appPage, superAdminAccount } from "./support/world";

// Lot 11a, part 3 (spec 070, lot 4 "catalogue et offres"), seen from the visitor and the catalogue admin:
//   VGC-01  the 14 PRD categories are seeded and active; a public product carries its category
//   VGC-02  product conditions: required documents and FR/EN legal notice served by the public
//           "requirements" read; the offer page shows the offer's disclaimers and documents
//   VGC-03  a private offer (broker X) is validated by compliance yet never public: not listed, not
//           reachable by id, not compared, not selectable in a quote request
// Needs the offers published by visitor-gaps-01-quote.spec.ts.

test.describe.configure({ mode: "serial" });

const SEEDED_CATEGORY_KEYS: string[] = (JSON.parse(readFileSync(path.resolve("scripts", "preprod", "seeds", "reference", "product-categories.json"), "utf8")) as Array<{ key: string }>).map((category) => category.key);

async function adminApi(token: string, method: "GET" | "PATCH", url: string, data?: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const response = await context.fetch(url, { method, ...(data ? { data } : {}) });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: response.status(), body };
  } finally {
    await context.dispose();
  }
}

function itemsOf(body: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(body) ? body : (body as { items?: unknown } | null)?.items;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}

test("VGC-01 les 14 catégories du PRD sont présentes et actives ; un produit public porte sa catégorie", async ({ browser }) => {
  expect(SEEDED_CATEGORY_KEYS).toHaveLength(14);
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/catalog/categories");
  const token = await adminBearerToken(admin);

  const listed = await adminApi(token, "GET", "/admin/product-categories");
  expect(listed.status).toBe(200);
  const categories = itemsOf(listed.body);
  for (const key of SEEDED_CATEGORY_KEYS) {
    const category = categories.find((entry) => entry.key === key);
    expect(category, `category ${key}`).toBeDefined();
    expect(category?.status, `category ${key} active`).toBe("active");
  }
  // The catalogue screen lists the same keys.
  for (const key of SEEDED_CATEGORY_KEYS) {
    await expect(admin.getByRole("cell", { name: key, exact: true }), `row ${key}`).toBeVisible();
  }
  await admin.context().close();

  // Public side: the conditions of an open product name its category.
  for (const productKey of ["auto", "voyage"]) {
    const requirements = await publicCall("GET", `/countries/CI/products/${productKey}/requirements`);
    expect(requirements.status, `requirements ${productKey}`).toBe(200);
    const category = (requirements.body as { category: { key: string; name: string } | null }).category;
    expect(category, `${productKey} is classified`).not.toBeNull();
    expect(SEEDED_CATEGORY_KEYS).toContain(category?.key);
    expect(category?.name.trim().length).toBeGreaterThan(0);
  }
});

test("VGC-02 conditions du produit (documents, texte légal FR/EN) et mentions de l'offre côté visiteur", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const productId = requireState(loadJourneyState(), "productIds").auto as string;
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/catalog/products");
  const token = await adminBearerToken(admin);

  // The admin sets the documents the product asks for (PROD-006); the reason is audited and a version is kept (PROD-009).
  const patched = await adminApi(token, "PATCH", `/admin/products/${productId}`, { requiredDocumentKinds: ["identity", "vehicle_registration"], reason: VG_REASON });
  expect(patched.status, JSON.stringify(patched.body)).toBeLessThan(300);
  const versions = await adminApi(token, "GET", `/admin/products/${productId}/versions`);
  expect(versions.status).toBe(200);
  expect(itemsOf(versions.body).length, "at least one product version").toBeGreaterThan(0);
  await admin.context().close();

  // Public read: documents and the FR + EN legal notice (the activation gate required both).
  const requirements = await publicCall("GET", "/countries/CI/products/auto/requirements");
  expect(requirements.status).toBe(200);
  const body = requirements.body as { requiredDocumentKinds: string[]; legalNotice: { fr?: { disclaimer?: string }; en?: { disclaimer?: string } } };
  expect([...body.requiredDocumentKinds].sort()).toEqual(["identity", "vehicle_registration"]);
  expect(body.legalNotice.fr?.disclaimer?.trim(), "FR disclaimer").toBeTruthy();
  expect(body.legalNotice.en?.disclaimer?.trim(), "EN disclaimer").toBeTruthy();

  // Offer page of broker Y (published with required documents): disclaimers and documents are shown.
  const y = requireWorld("vg-y");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(`/offres/${y.offerId}?country=CI&product=auto`);
  await expect(visitor.getByRole("heading", { name: y.offerTitle as string }).first()).toBeVisible();
  const documents = visitor.locator("section[aria-labelledby='am-offer-documents']");
  await expect(documents.getByRole("heading", { name: "Documents requis" })).toBeVisible();
  await expect(documents).toContainText("Carte grise");
  await expect(documents).toContainText("Pièce d'identité");
  const disclaimers = visitor.locator("section[aria-labelledby='am-offer-disclaimers']");
  await expect(disclaimers.getByRole("heading", { name: "Mentions de l'offre" })).toBeVisible();
  await expect(disclaimers).toContainText(/offre indicative/iu);

  // An offer without documents has no "Documents requis" block, but keeps its disclaimers.
  const x = requireState(loadJourneyState(), "offerId");
  await visitor.goto(`/offres/${x}?country=CI&product=auto`);
  await expect(visitor.locator("section[aria-labelledby='am-offer-disclaimers']")).toContainText(/offre indicative/iu);
  await visitor.context().close();
});

test("VGC-03 une offre privée validée par la conformité n'est visible ni publiquement, ni dans la comparaison, ni dans un devis", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const state = loadJourneyState();
  const owner = requireState(state, "brokerOwner");
  const publicOfferId = requireState(state, "offerId");
  const { offerId: privateId, offerTitle: privateTitle } = await publishOfferWith(browser, owner, "Privee", { offerType: "private" });

  // The owner still sees it in its own back-office, flagged as private.
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, owner, "/offers");
  const row = broker.getByRole("row").filter({ hasText: privateTitle });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/priv/iu);
  await broker.context().close();

  // Public API: not listed, not readable by id.
  const list = await publicCall("GET", "/countries/CI/products/auto/offers");
  expect(list.status).toBe(200);
  expect(list.text).not.toContain(privateId);
  expect(list.text).not.toContain(privateTitle);
  const detail = await publicCall("GET", `/offers/${privateId}`);
  expect(detail.status, "private offer by id").toBe(404);
  const compare = await publicCall("GET", `/offers/compare?ids=${publicOfferId},${privateId}`);
  expect(compare.text, "private offer in a comparison").not.toContain(privateTitle);
  expect(compare.status === 200 && compare.text.includes(privateId), "private offer compared").toBe(false);
  // A quote request cannot target it: the public options do not verify it.
  const options = await readQuoteOptions([privateId, publicOfferId]);
  expect(options.offers.map((offer) => offer.offerId)).not.toContain(privateId);

  // Public pages: list, product page, direct link, comparison.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  for (const url of ["/pays/CI/produits/auto/offres", "/pays/CI/produits/auto"]) {
    await visitor.goto(url);
    await expect(visitor.locator("main")).toBeVisible();
    await expect(visitor.getByText(privateTitle), `private offer on ${url}`).toHaveCount(0);
  }
  await visitor.goto(`/offres/${privateId}?country=CI&product=auto`);
  await expect(visitor.getByText(privateTitle)).toHaveCount(0);
  await expect(visitor.locator("section[aria-labelledby='am-offer-disclaimers']")).toHaveCount(0);
  await visitor.goto(`/comparer?ids=${publicOfferId},${privateId}&country=CI&product=auto`);
  await expect(visitor.getByText(privateTitle)).toHaveCount(0);
  await visitor.goto(`/pays/CI/produits/auto/devis?offerId=${privateId}`);
  await expect(visitor.getByText(privateTitle)).toHaveCount(0);
  await visitor.context().close();
});
