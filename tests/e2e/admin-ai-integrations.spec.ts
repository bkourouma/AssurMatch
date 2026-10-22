import { expect, test } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { adminToken, api, ensureAllowlisted, expectStatus, itemsOfBody, openPage, PARTNER_HTTPS_ORIGIN, rec } from "./support/admin-lot11";
import { loadJourneyState, requireState } from "./support/journey-state";
import { closeSessions } from "./support/pro-roles";
import { fillReason, uniqueSuffix } from "./support/ui";
import { superAdminAccount } from "./support/world";

// Lot 11c, journey "IA admin et intégrations partenaires" (lot 7, spec 074). No AI flag is ever
// opened here:
//   AI-01 /ai-assistance/flags offers no activation (no button, no value=true form); a forged
//         POST value:true is refused with ACTIVATION_VIA_OPS_ONLY and nothing changes
//   AI-02 an API key is created from /partner-integrations: the secret is shown once and is gone
//         after a reload, and the API list never carries it
//   AI-03 a webhook endpoint is created (disabled, signing secret shown once) and the test send is
//         refused while partner_webhooks_enabled is closed

test.describe.configure({ mode: "serial" });

const suffix = uniqueSuffix();
const REASON = "Parcours E2E lot 11c - integrations";

let superAdmin: BackOfficeAccount;
let partnerId: string;
let countryId: string;
let productIds: string[];

test.beforeAll(() => {
  const state = loadJourneyState();
  superAdmin = superAdminAccount();
  partnerId = requireState(state, "partnerId");
  countryId = requireState(state, "countryId");
  productIds = Object.values(requireState(state, "productIds"));
});

test.afterAll(async () => {
  await closeSessions();
});

test("AI-01 l'écran des flags IA n'offre aucune activation et l'API refuse value:true (ACTIVATION_VIA_OPS_ONLY)", async ({ browser }) => {
  const page = await openPage(browser, superAdmin, "/ai-assistance/flags");
  await expect(page.getByRole("heading", { name: "Flags IA par pays et produit" })).toBeVisible();

  // No way to switch anything on: no Activer button, no form posting value=true, only the ops procedure.
  await expect(page.getByRole("button", { name: /^Activer/u })).toHaveCount(0);
  await expect(page.locator("form input[name='value'][value='true']")).toHaveCount(0);
  await expect(page.getByText("Activation par la commande d'exploitation uniquement").first()).toBeVisible();
  await expect(page.getByText("npm run ops:apply-flag-policy").first()).toBeVisible();

  const token = await adminToken(browser, superAdmin);
  const before = await api(token, "GET", "/admin/ai/scope-flags");
  expectStatus(before, 200, "GET scope flags");
  const countriesBefore = itemsOfBody({ items: rec(before.body).countries });
  const country = countriesBefore.find((entry) => entry.id === countryId);
  expect(country, "the opened country is listed").toBeTruthy();
  expect(rec(rec(country).flags).country_ai_enabled).toBe(false);

  const countryActivation = await api(token, "POST", "/admin/ai/scope-flags", { scopeType: "country", scopeId: countryId, key: "country_ai_enabled", value: true, reason: REASON });
  expectStatus(countryActivation, 403, "country AI activation over HTTP");
  expect(countryActivation.text).toContain("ACTIVATION_VIA_OPS_ONLY");

  const productActivation = await api(token, "POST", "/admin/ai/scope-flags", { scopeType: "product", scopeId: productIds[0], key: "product_ai_scoring_enabled", value: true, reason: REASON });
  expectStatus(productActivation, 403, "product AI activation over HTTP");
  expect(productActivation.text).toContain("ACTIVATION_VIA_OPS_ONLY");

  // Nothing moved: every AI flag of the overview is still closed.
  const after = await api(token, "GET", "/admin/ai/scope-flags");
  expectStatus(after, 200, "GET scope flags after");
  const overview = rec(after.body);
  for (const entry of itemsOfBody({ items: overview.countries })) expect(rec(entry.flags).country_ai_enabled, `country ${String(entry.code)}`).toBe(false);
  for (const entry of itemsOfBody({ items: overview.products })) {
    expect(rec(entry.flags).product_ai_scoring_enabled, `scoring ${String(entry.key)}`).toBe(false);
    expect(rec(entry.flags).product_ai_form_assistant_enabled, `assistant ${String(entry.key)}`).toBe(false);
  }
  for (const flag of itemsOfBody({ items: overview.globalFlags })) expect(flag.value, `global AI flag ${String(flag.key)}`).toBe(false);
});

test("AI-02 une clé API partenaire est créée : le secret n'est affiché qu'une fois, absent après rechargement", async ({ browser }) => {
  const page = await openPage(browser, superAdmin, "/partner-integrations");
  const form = page.locator("form[data-integration-form='api-key-create']");
  await form.locator("select[name='partnerTenantId']").selectOption(partnerId);
  await form.locator("input[name='name']").fill(`Cle E2E ${suffix}`);
  await form.locator("input[name='scopes'][value='leads:read_assigned']").check();
  await fillReason(form, REASON);
  await form.getByRole("button", { name: "Creer la cle API" }).click();

  await expect(form.getByText("n'est affiche qu'une seule fois")).toBeVisible();
  const rawKey = ((await form.locator("code[data-secret-value='true']").textContent()) ?? "").trim();
  expect(rawKey).toMatch(/^am_pk_/u);

  // After a reload the secret is gone from the page; only the non-secret prefix is listed.
  await page.reload();
  await expect(page.getByText("n'est affiche qu'une seule fois")).toHaveCount(0);
  await expect(page.locator("[data-secret-value]")).toHaveCount(0);
  expect(await page.content()).not.toContain(rawKey);
  const row = page.getByRole("table", { name: "Cles API partenaires" }).getByRole("row").filter({ hasText: `Cle E2E ${suffix}` });
  await expect(row).toContainText(rawKey.slice(0, 16));
  await expect(row).toContainText("leads:read_assigned");

  // The admin API list carries the prefix and status only, never the key, its secret part or its hash.
  const token = await adminToken(browser, superAdmin);
  const list = await api(token, "GET", "/admin/partner-integrations/api-keys");
  expectStatus(list, 200, "list API keys");
  const secretPart = rawKey.split("_").pop() ?? rawKey;
  expect(list.text).not.toContain(rawKey);
  expect(list.text).not.toContain(secretPart);
  expect(list.text).not.toMatch(/keyHash|rawKey|argon2/iu);
  const created = itemsOfBody(list.body).find((entry) => entry.name === `Cle E2E ${suffix}`);
  expect(created?.status).toBe("active");
  expect(created?.keyPrefix).toBe(rawKey.slice(0, 16));
});

test("AI-03 un endpoint webhook est créé (désactivé, secret une seule fois) et l'envoi de test est refusé tant que partner_webhooks_enabled est fermé", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const token = await adminToken(browser, superAdmin);
  const url = `${PARTNER_HTTPS_ORIGIN}/hooks/assurmatch-e2e-${suffix}`;
  await ensureAllowlisted(token, partnerId, PARTNER_HTTPS_ORIGIN, REASON);

  const page = await openPage(browser, superAdmin, "/partner-integrations");
  const form = page.locator("form[data-integration-form='webhook-endpoint-create']");
  await form.locator("select[name='partnerTenantId']").selectOption(partnerId);
  await form.locator("input[name='url']").fill(url);
  await form.locator("input[name='eventTypes'][value='lead.assigned']").check();
  await fillReason(form, REASON);
  await form.getByRole("button", { name: "Creer l'endpoint" }).click();

  await expect(form.getByText("n'est affiche qu'une seule fois")).toBeVisible();
  const signingSecret = ((await form.locator("code[data-secret-value='true']").textContent()) ?? "").trim();
  expect(signingSecret).toMatch(/^whsec_/u);

  await page.reload();
  await expect(page.locator("[data-secret-value]")).toHaveCount(0);
  expect(await page.content()).not.toContain(signingSecret);
  const row = page.getByRole("table", { name: "Endpoints webhook" }).getByRole("row").filter({ hasText: url });
  await expect(row).toBeVisible();
  // Created disabled: nothing is sent until an operator activates it, and the flag is closed anyway.
  await expect(row).toContainText(/disabled|desactive|inactif/iu);

  // The test send from the screen is refused, with the flag named in the notice.
  const testForm = row.locator("form[data-integration-form='webhook-endpoint-test']");
  await testForm.getByRole("button", { name: "Envoyer un evenement de test" }).click();
  await expect(testForm.locator(".bo-notice[data-tone='danger']").first()).toContainText("partner_webhooks_enabled");

  // Same answer from the API, and no delivery row is created.
  const endpoints = await api(token, "GET", "/admin/partner-integrations/webhook-endpoints");
  expectStatus(endpoints, 200, "list endpoints");
  expect(endpoints.text).not.toContain(signingSecret);
  const endpoint = itemsOfBody(endpoints.body).find((entry) => entry.url === url);
  expect(endpoint?.status).toBe("disabled");
  expect(endpoint?.secretConfigured).toBe(true);
  const deliveriesBefore = itemsOfBody((await api(token, "GET", "/admin/partner-integrations/webhook-deliveries")).body).length;
  const sendTest = await api(token, "POST", `/admin/partner-integrations/webhook-endpoints/${String(endpoint?.id)}/test`, { reason: REASON });
  expectStatus(sendTest, 200, "webhook test send");
  expect(rec(sendTest.body).outcome).toBe("refused");
  expect(rec(sendTest.body).responseClass).toBe("feature_disabled");
  expect(rec(sendTest.body).eventType).toBe("webhook.test");
  const deliveriesAfter = itemsOfBody((await api(token, "GET", "/admin/partner-integrations/webhook-deliveries")).body).length;
  expect(deliveriesAfter, "a refused test creates no delivery").toBe(deliveriesBefore);
});
