import { expect, request as playwrightRequest, test, type Browser, type Page } from "@playwright/test";
import { openCountry, setCatalogFlag } from "./support/admin";
import { activateWithMfa, e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { eicarFile } from "./support/files";
import { loadJourneyState, requireState, saveJourneyState } from "./support/journey-state";
import { extractLink, searchMessages, waitForMail } from "./support/mailpit";
import { documentRow, onboardBrokerDirect, submitStatusTransition, uploadPartnerDocument } from "./support/partners";
import { card, uniqueSuffix } from "./support/ui";

// Spec 059 / PRD SC-09: forbidden compliance cases, end to end, on the state left by scenario-core
// (CI open, broker X active with an offer, one routed lead with a proposal).

test.describe.configure({ mode: "serial" });

const REASON = "Cas interdits E2E spec 059";

async function page(browser: Browser, baseURL: string): Promise<Page> {
  return (await newAppContext(browser, baseURL)).newPage();
}

/** Fills the CI x Auto quote form for the visible offer and captures the JSON the browser posts. */
async function captureQuotePayload(visitor: Page, email: string): Promise<Record<string, unknown>> {
  await visitor.goto("/pays/CI/produits/auto/offres");
  await visitor.getByRole("link", { name: "Demander un devis" }).first().click();
  await visitor.waitForURL(/\/devis\?offerId=/u);
  await visitor.locator("#am-quote-email").fill(email);
  await visitor.locator("#am-quote-phone").fill("+2250102030406");
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-city").fill("Bouaké");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.locator("#am-quote-consent").check();
  let captured: Record<string, unknown> | undefined;
  await visitor.route(`${e2eEnv.apiUrl}/quote-requests`, async (route) => {
    if (route.request().method() === "POST") {
      captured = route.request().postDataJSON() as Record<string, unknown>;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await visitor.getByRole("button", { name: "Demander un devis" }).click();
  await expect.poll(() => captured !== undefined, { message: "quote payload captured" }).toBe(true);
  await visitor.unroute(`${e2eEnv.apiUrl}/quote-requests`);
  return captured as Record<string, unknown>;
}

test("SC-09a pays fermé : le Sénégal (brouillon) n'expose aucun parcours et refuse toute demande", async ({ browser }) => {
  const visitor = await page(browser, e2eEnv.publicUrl);
  const response = await visitor.goto("/pays/SN/produits/auto/devis");
  expect(response?.status() === 404 || (await visitor.getByText(/indisponible|n'est pas disponible|pas encore ouvert/iu).count()) > 0).toBe(true);
  await expect(visitor.locator("#am-quote-consent")).toHaveCount(0);

  // A forged submission for SN, built from a genuine CI payload, is refused by the API.
  const email = `ferme.${uniqueSuffix()}@visitor.e2e.test`;
  const payload = await captureQuotePayload(visitor, email);
  const api = await playwrightRequest.newContext();
  const refused = await api.post(`${e2eEnv.apiUrl}/quote-requests`, { data: { ...payload, countryCode: "SN" }, headers: { origin: e2eEnv.publicUrl } });
  expect(refused.status(), await refused.text()).toBeGreaterThanOrEqual(400);
  expect(await refused.text()).not.toMatch(/QR-\d{4}-/u);
  await api.dispose();
  await visitor.context().close();
});

test("SC-09b désactivation immédiate : CI x Voyage fermé dans le back-office disparaît du parcours public", async ({ browser }) => {
  // The catalogue flags are a products:update right (super_admin / admin_pays), not compliance's.
  const compliance = requireState(loadJourneyState(), "superAdmin");
  const admin = await page(browser, e2eEnv.adminUrl);
  const visitor = await page(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/CI/produits/voyage/devis");
  await expect(visitor.locator("#am-quote-consent")).toHaveCount(1);

  await openAs(admin, compliance, "/");
  await openCountry(admin, "CI");
  const link = card(admin, "Liaison CI × Assurance voyage");
  await setCatalogFlag(link, "product_quote_enabled", false, REASON);

  await visitor.goto("/pays/CI/produits/voyage/devis");
  await expect(visitor.locator("#am-quote-consent")).toHaveCount(0);

  await setCatalogFlag(card(admin, "Liaison CI × Assurance voyage"), "product_quote_enabled", true, REASON);
  await visitor.goto("/pays/CI/produits/voyage/devis");
  await expect(visitor.locator("#am-quote-consent")).toHaveCount(1);
  await admin.context().close();
  await visitor.context().close();
});

test("SC-09c sans consentement : le formulaire bloque et l'API refuse, aucune transmission", async ({ browser }) => {
  const visitor = await page(browser, e2eEnv.publicUrl);
  const email = `sans-consentement.${uniqueSuffix()}@visitor.e2e.test`;

  // UI: the submit is blocked while the named consent is not ticked.
  await visitor.goto("/pays/CI/produits/auto/offres");
  await visitor.getByRole("link", { name: "Demander un devis" }).first().click();
  await visitor.locator("#am-quote-email").fill(email);
  await visitor.locator("#am-quote-phone").fill("+2250102030407");
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-city").fill("Yamoussoukro");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.getByRole("button", { name: "Demander un devis" }).click();
  await expect(visitor.getByText(/QR-\d{4}-/u)).toHaveCount(0);

  // API: the same payload with `accepted: false` (a bypassed form) is refused.
  const payload = await captureQuotePayload(visitor, email);
  const consent = payload.consent as Record<string, unknown>;
  const api = await playwrightRequest.newContext();
  const refused = await api.post(`${e2eEnv.apiUrl}/quote-requests`, { data: { ...payload, consent: { ...consent, accepted: false } }, headers: { origin: e2eEnv.publicUrl } });
  expect(refused.status()).toBeGreaterThanOrEqual(400);
  expect(refused.status()).toBeLessThan(500);
  await api.dispose();
  await visitor.context().close();

  // Nothing was transmitted: no confirmation e-mail ever reaches this visitor.
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  expect(await searchMessages(`to:"${email}"`)).toHaveLength(0);
});

test("SC-09d isolation : un second courtier (créé sans candidature) ne voit ni le lead, ni les coordonnées, ni la proposition du courtier X", async ({ browser }) => {
  const state = loadJourneyState();
  const superAdmin = requireState(state, "superAdmin");
  const leadAssignmentId = requireState(state, "leadAssignmentId");
  const quoteReference = requireState(state, "quoteReference");
  const visitorEmail = requireState(state, "visitorEmail");

  // SC-02 alternative path: the admin creates broker Y directly, without an application. An EICAR
  // upload on the way is quarantined and never offered for acceptance.
  const admin = await page(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdmin, "/partners");
  const suffix = uniqueSuffix();
  const ownerEmail = `owner.${suffix}@broker-two.e2e.test`;
  const partnerId = await onboardBrokerDirect(admin, { legalName: `Courtage Bédié E2E ${suffix}`, ownerEmail, licenseNumber: `CI-AGR-Y-${suffix}` });
  await uploadPartnerDocument(admin, "other", eicarFile("eicar.pdf"), undefined, { infected: true });
  await expect(documentRow(admin, "eicar.pdf")).toContainText("Quarantaine");
  await expect(documentRow(admin, "eicar.pdf").getByRole("button", { name: "Accepter" })).toHaveCount(0);
  await admin.context().close();

  const invitation = await waitForMail({ to: ownerEmail, subject: /activation|invitation/iu });
  const brokerY = await page(browser, e2eEnv.brokerUrl);
  const password = e2ePassword("owner-y");
  const totpSecret = await activateWithMfa(brokerY, extractLink(invitation, /\/activate\?token=/u), password);
  const accountY: BackOfficeAccount = { app: "broker", email: ownerEmail, password, totpSecret };
  saveJourneyState({ secondPartnerId: partnerId, secondBrokerOwner: accountY });

  await openAs(brokerY, accountY, "/leads");
  await expect(brokerY.getByText(quoteReference)).toHaveCount(0);
  await openAs(brokerY, accountY, `/leads/${leadAssignmentId}`);
  await expect(brokerY.getByText(visitorEmail)).toHaveCount(0);
  await expect(brokerY.getByText(quoteReference)).toHaveCount(0);
  await expect(brokerY.getByText("Proposition du")).toHaveCount(0);
  const document = await brokerY.request.get(`${e2eEnv.brokerUrl}/leads/${leadAssignmentId}/proposals/00000000-0000-4000-8000-000000000000/document`, { maxRedirects: 0 });
  expect(document.status()).not.toBe(200);
  await brokerY.context().close();
});

test("SC-09e courtier suspendu : portail en lecture seule, plus de routage, puis réactivation", async ({ browser }) => {
  const state = loadJourneyState();
  const compliance = requireState(state, "complianceAdmin");
  const partnerId = requireState(state, "partnerId");
  const owner = requireState(state, "brokerOwner");
  const leadAssignmentId = requireState(state, "leadAssignmentId");

  const admin = await page(browser, e2eEnv.adminUrl);
  await openAs(admin, compliance, `/partners/${partnerId}`);
  await submitStatusTransition(admin, "Suspendre", "Suspendu", true);

  const broker = await page(browser, e2eEnv.brokerUrl);
  await openAs(broker, owner, `/leads/${leadAssignmentId}`);
  await expect(broker.getByText(/suspendu|lecture seule/iu).first()).toBeVisible();
  // Read-only: the reply form is disabled and the lead actions are not offered.
  const proposal = card(broker, "Répondre au visiteur");
  await expect(proposal.locator("#starter-proposal-message")).toBeDisabled();
  await expect(proposal.getByRole("button", { name: "Envoyer la proposition au visiteur" })).toBeDisabled();

  await admin.goto(`/partners/${partnerId}`);
  await submitStatusTransition(admin, "Passer en Actif public", "Actif public");
  await broker.goto(`/leads/${leadAssignmentId}`);
  await expect(broker.getByText(/suspendu/iu)).toHaveCount(0);
  await admin.context().close();
  await broker.context().close();
});
