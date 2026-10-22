import { expect, test, type Page } from "@playwright/test";
import { setCatalogFlag, setGlobalFlag } from "./support/admin";
import { openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { pdfFile } from "./support/files";
import { loadJourneyState, requireState, requireWorld, type BrokerWorld } from "./support/journey-state";
import { extractLink, searchMessages, waitForMail } from "./support/mailpit";
import { reviewQuote } from "./support/quote-form";
import { publicCall } from "./support/recos-062b";
import { card, uniqueSuffix } from "./support/ui";
import {
  consentAndSend,
  expectBrokerHasLead,
  expectBrokerLacksLead,
  fillNeedAndContact,
  globalFlagIsOn,
  newVisitor,
  publishOfferWith,
  readQuoteOptions,
  setMultiBrokerPolicy,
  VG_REASON,
  waitForFreshQuoteRateWindow,
  waitForQuoteOptions,
  workerHeartbeatAgeSeconds,
  type VisitorIdentity
} from "./support/visitor-gaps";
import { appPage, persistWorld, provisionBroker, superAdminAccount } from "./support/world";

// Lot 11a, part 1 (spec 067, lot 1 "parcours de devis visiteur"): the PRD gaps of the quote request,
// on top of the Côte d'Ivoire opened by scenario-core.
//
//   VG-00  two more broker firms (Y with an offer that asks for documents, Z) join broker X of the scenario
//   VG-01  first name + last name, composed into the name the broker sees
//   VG-02  optional "Documents" step: absent while product_document_upload_enabled is closed, present and
//          honoured once open (files go up AFTER the request is saved)
//   VG-03  H2, direct choice of a broker: routed first when still eligible
//   VG-04  H1 refused: multi_broker_routing_enabled closed -> only the first offer is retained (UI + API)
//   VG-05  H1 honoured: flag opened by the audited policy command + a consent naming each broker
//   VG-06  documents reminder: read-only state (the single reminder only leaves 3 days after the request)
//   VG-99  flags put back to their initial state
//
// Constitution: the multi-broker flag is a regulated routing flag opened with the audited command only;
// no AI flag is touched here.

test.describe.configure({ mode: "serial" });

const ROOT_WORLD_Y = "vg-y";
const ROOT_WORLD_Z = "vg-z";
const DOCUMENT_LINES = ["Carte grise", "Pièce d'identité"];

let initialMessagingFlag: boolean | undefined;
let initialDocumentFlag: boolean | undefined;
let multiBrokerOpened = false;

function brokerX(): { owner: BackOfficeAccount; partnerName: string; offerId: string; offerTitle: string } {
  const state = loadJourneyState();
  return {
    owner: requireState(state, "brokerOwner"),
    partnerName: requireState(state, "partnerName"),
    offerId: requireState(state, "offerId"),
    offerTitle: requireState(state, "offerTitle")
  };
}

function offerOf(world: BrokerWorld): string {
  return world.offerId as string;
}

function quoteUrl(...offerIds: string[]): string {
  const query = offerIds.map((id) => `offerId=${id}`).join("&");
  return `/pays/CI/produits/auto/devis${query ? `?${query}` : ""}`;
}

/** Opens the quote page, fills the two first steps and reaches the review/consent step. */
async function reachConsent(visitor: Page, url: string, identity: VisitorIdentity): Promise<void> {
  await visitor.goto(url);
  await fillNeedAndContact(visitor, identity);
  await reviewQuote(visitor);
}

async function adminSession(browser: Parameters<typeof appPage>[0]): Promise<Page> {
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  return admin;
}

/** Sends a request straight to the public API (what a forged client could send). */
async function directSubmit(extra: { additionalOfferIds?: string[]; selectedOfferId?: string; multiBrokerAccepted?: boolean }): Promise<{ status: number; body: Record<string, unknown> }> {
  const formResult = await publicCall("GET", `/countries/CI/products/auto/quote-form?language=fr${extra.selectedOfferId ? `&offerId=${extra.selectedOfferId}` : ""}`);
  expect(formResult.status, "published quote form").toBe(200);
  const form = formResult.body as { formDefinitionId: string; consent: { consentTextId: string; version: string; contentHash: string } };
  const identity = newVisitor("direct");
  const result = await publicCall("POST", "/quote-requests", {
    json: {
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: form.formDefinitionId,
      language: "fr",
      ...(extra.selectedOfferId ? { selectedOfferId: extra.selectedOfferId } : {}),
      ...(extra.additionalOfferIds ? { additionalOfferIds: extra.additionalOfferIds } : {}),
      contact: { firstName: identity.firstName, lastName: identity.lastName, email: identity.email, phone: identity.phone },
      answers: { vehicle_use: "prive", vehicle_brand: "Toyota", city: "Abidjan", contact_preference: "email" },
      consent: { accepted: true, consentTextId: form.consent.consentTextId, version: form.consent.version, contentHash: form.consent.contentHash, multiBrokerAccepted: extra.multiBrokerAccepted ?? false }
    }
  });
  return { status: result.status, body: (result.body && typeof result.body === "object" ? result.body : {}) as Record<string, unknown> };
}

test("VG-00 deux cabinets supplémentaires (Y avec documents requis, Z) rejoignent le courtier X du scénario", async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  const { owner } = brokerX();
  expect(owner.email).toBeTruthy();

  for (const [key, label, documents] of [[ROOT_WORLD_Y, "vgy", DOCUMENT_LINES], [ROOT_WORLD_Z, "vgz", undefined]] as const) {
    const world = await provisionBroker(browser, { plan: "starter", label });
    const offer = await publishOfferWith(browser, world.owner, `${label.toUpperCase()}`, documents ? { requiredDocuments: [...documents] } : {});
    persistWorld(key, { ...world, offerId: offer.offerId, offerTitle: offer.offerTitle });
  }

  // The public options now list the three firms as eligible brokers (H2) and verify their offers.
  const y = requireWorld(ROOT_WORLD_Y);
  const z = requireWorld(ROOT_WORLD_Z);
  const x = brokerX();
  await expect
    .poll(async () => (await readQuoteOptions([x.offerId, offerOf(y), offerOf(z)])).brokers.map((broker) => broker.displayName).sort(), { timeout: 60_000 })
    .toEqual([x.partnerName, y.partnerName, z.partnerName].sort());
  const options = await readQuoteOptions([x.offerId, offerOf(y), offerOf(z)]);
  expect(options.maxOffers).toBe(3);
  expect(options.offers.map((offer) => offer.partnerName)).toEqual([x.partnerName, y.partnerName, z.partnerName]);
});

test("VG-01 prénom et nom séparés : l'étape de vérification et le courtier voient le nom complet", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const x = brokerX();
  const identity = newVisitor("nom", { firstName: "Awa", lastName: "Koné-Diallo" });
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await reachConsent(visitor, quoteUrl(x.offerId), identity);

  // Two separate, optional fields; the review composes them.
  const review = visitor.locator(".am-quote-review");
  await expect(review).toContainText("Nom complet");
  await expect(review).toContainText("Awa Koné-Diallo");
  const reference = await consentAndSend(visitor);
  await visitor.context().close();

  const mail = await waitForMail({ to: identity.email, body: new RegExp(reference, "u") });
  expect(`${mail.Text}\n${mail.HTML}`).toContain("Awa");

  // The broker keeps receiving a single composed name (no change on its side).
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await expectBrokerHasLead(broker, x.owner, reference, "broker X");
  await broker.getByRole("row").filter({ hasText: reference }).getByRole("link").first().click();
  await broker.waitForURL(/\/leads\/[0-9a-f-]{36}/u);
  const contact = card(broker, "Contact consenti");
  await expect(contact).toContainText(identity.email);
  await expect(contact).toContainText("Awa Koné-Diallo");
  await broker.context().close();
});

test("VG-02 étape « Documents » : absente flag fermé, présente et honorée une fois ouverte", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const state = loadJourneyState();
  const productId = requireState(state, "productIds").auto as string;
  const countryId = requireState(state, "countryId");
  const x = brokerX();

  // Closed by default: the options say so and the form has no Documents step.
  expect((await readQuoteOptions()).documentUploadEnabled, "documents closed by default").toBe(false);
  const closedVisitor = await appPage(browser, e2eEnv.publicUrl);
  await closedVisitor.goto(quoteUrl(x.offerId));
  await fillNeedAndContact(closedVisitor, newVisitor("docclosed"));
  await closedVisitor.getByRole("button", { name: "Vérifier ma demande" }).click();
  await expect(closedVisitor.locator("#am-quote-consent")).toBeVisible();
  await expect(closedVisitor.getByRole("heading", { name: "Documents (facultatif)" })).toHaveCount(0);
  await closedVisitor.context().close();

  // The admin opens the product flag (and its CI link) through the catalogue screens.
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), `/catalog/products/${productId}`);
  initialDocumentFlag = false;
  await setCatalogFlag(admin, "product_document_upload_enabled", true, VG_REASON);
  await admin.goto(`/catalog/countries/${countryId}`);
  await setCatalogFlag(card(admin, "Liaison CI × Assurance auto"), "product_document_upload_enabled", true, VG_REASON);
  await admin.context().close();
  await waitForQuoteOptions((options) => options.documentUploadEnabled, "document upload opens for CI x Auto");

  const identity = newVisitor("docopen");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(quoteUrl(x.offerId));
  await fillNeedAndContact(visitor, identity);
  await visitor.getByRole("button", { name: "Vérifier ma demande" }).click();
  // The Documents step comes between the contact and the consent steps.
  await expect(visitor.getByRole("heading", { name: "Documents (facultatif)", level: 2 })).toBeVisible();
  await expect(visitor.locator("#am-quote-consent")).toBeHidden();
  await visitor.locator("#am-quote-documents-file").setInputFiles(pdfFile("carte-grise-e2e.pdf", "Carte grise E2E"));
  await expect(visitor.getByRole("button", { name: "Retirer carte-grise-e2e.pdf" })).toBeVisible();
  await visitor.getByRole("button", { name: "Vérifier ma demande" }).click();
  await expect(visitor.locator(".am-quote-review")).toContainText("1 document joint");
  const reference = await consentAndSend(visitor);

  // Files go up after the request is saved: the confirmation says so, and the request is not blocked.
  await expect(visitor.getByText("1 document envoyé")).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Suivre ma demande et ajouter des documents (optionnel)" })).toBeVisible();
  await visitor.context().close();
  expect(reference).toMatch(/^QR-/u);
});

test("VG-03 choix direct d'un courtier (H2) : le courtier choisi reçoit la demande en priorité", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const x = brokerX();
  const y = requireWorld(ROOT_WORLD_Y);
  const references: Record<string, string> = {};

  for (const [key, chosenName] of [["y", y.partnerName], ["x", x.partnerName]] as const) {
    const identity = newVisitor(`choix${key}`);
    const visitor = await appPage(browser, e2eEnv.publicUrl);
    await visitor.goto(quoteUrl());
    const preferred = visitor.locator("select[name='preferredPartnerId']");
    // Optional field, every eligible broker of the country and product is listed, none is preselected.
    await expect(preferred).toHaveValue("");
    await expect(preferred.locator("option", { hasText: x.partnerName })).toHaveCount(1);
    await expect(preferred.locator("option", { hasText: y.partnerName })).toHaveCount(1);
    await preferred.selectOption({ label: chosenName });
    await fillNeedAndContact(visitor, identity);
    await reviewQuote(visitor);
    await expect(visitor.locator(".am-quote-broker")).toContainText(`Vous avez souhaité être orienté vers ${chosenName}`);
    references[key] = await consentAndSend(visitor);
    await expect(visitor.getByText("Le courtier que vous avez choisi n'a pas pu être retenu")).toHaveCount(0);
    await visitor.context().close();
  }

  // Y chosen -> Y holds the lead and X does not; X chosen -> the other way round.
  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  await expectBrokerHasLead(brokerPage, y.owner, references.y as string, "broker Y");
  await expectBrokerLacksLead(brokerPage, x.owner, references.y as string, "broker X");
  await expectBrokerHasLead(brokerPage, x.owner, references.x as string, "broker X");
  await expectBrokerLacksLead(brokerPage, y.owner, references.x as string, "broker Y");
  await brokerPage.context().close();

  // Kept for the documents-reminder read (VG-06): the visitor of the lead Y holds.
  persistWorld(ROOT_WORLD_Y, { ...y, data: { ...y.data, chosenRef: references.y as string } });
});

test("VG-04 plusieurs offres, flag multi-courtiers fermé : seule la première offre est retenue", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const x = brokerX();
  const y = requireWorld(ROOT_WORLD_Y);
  const z = requireWorld(ROOT_WORLD_Z);

  await waitForFreshQuoteRateWindow();
  expect((await readQuoteOptions([x.offerId, offerOf(y)])).multiBrokerAvailable, "multi-broker closed by default").toBe(false);

  // UI: three offers selected, no multi-broker authorisation is even offered; the form says one offer only.
  const identity = newVisitor("multiclosed");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await reachConsent(visitor, quoteUrl(x.offerId, offerOf(y), offerOf(z)), identity);
  await expect(visitor.locator("#am-quote-multi-offers")).toHaveCount(0);
  await expect(visitor.getByText("Une seule offre peut être retenue par demande")).toBeVisible();
  const reference = await consentAndSend(visitor);
  await visitor.context().close();

  // API: even a forged request with the authorisation set is refused for the extra offers, with a trace in the answer.
  const forged = await directSubmit({ selectedOfferId: x.offerId, additionalOfferIds: [offerOf(y), offerOf(z)], multiBrokerAccepted: true });
  expect(forged.status, JSON.stringify(forged.body)).toBeLessThan(300);
  expect(forged.body.additionalOffersIgnored).toBe(true);
  expect(forged.body.retainedPartnerCount ?? 1).toBe(1);

  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  await expectBrokerHasLead(brokerPage, x.owner, reference, "broker X");
  await expectBrokerLacksLead(brokerPage, y.owner, reference, "broker Y");
  await expectBrokerLacksLead(brokerPage, z.owner, reference, "broker Z");
  await brokerPage.context().close();
});

test("VG-05 flag multi-courtiers ouvert par la politique conformité : jusqu'à 3 offres, avec consentement nommant chaque courtier", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const x = brokerX();
  const y = requireWorld(ROOT_WORLD_Y);
  const z = requireWorld(ROOT_WORLD_Z);
  const offerIds = [x.offerId, offerOf(y), offerOf(z)];
  await waitForFreshQuoteRateWindow();
  await setMultiBrokerPolicy(true, `E2E-POL-067-${uniqueSuffix()}`);
  multiBrokerOpened = true;
  await waitForQuoteOptions((options) => options.multiBrokerAvailable, "multi-broker opens after the policy", offerIds);

  // (a) the authorisation is offered but not ticked: it names every broker; without it, one offer only.
  const withoutConsent = newVisitor("multinoconsent");
  const first = await appPage(browser, e2eEnv.publicUrl);
  await reachConsent(first, quoteUrl(...offerIds), withoutConsent);
  const authorisation = first.locator("#am-quote-multi-offers");
  await expect(authorisation).not.toBeChecked();
  const authorisationText = first.locator("label[for='am-quote-multi-offers']");
  for (const name of [x.partnerName, y.partnerName, z.partnerName]) await expect(authorisationText).toContainText(name);
  await expect(authorisationText).toContainText("Sans cette autorisation, seule la première offre");
  const singleReference = await consentAndSend(first);
  await first.context().close();

  // (b) ticked: the three brokers receive the request, the confirmation counts them.
  const withConsent = newVisitor("multiconsent");
  const second = await appPage(browser, e2eEnv.publicUrl);
  await reachConsent(second, quoteUrl(...offerIds), withConsent);
  await second.locator("#am-quote-multi-offers").check();
  const multiReference = await consentAndSend(second);
  await expect(second.getByText(/transmise à 3 courtiers sur 3 demandés/u)).toBeVisible();
  await second.context().close();

  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  await expectBrokerHasLead(brokerPage, x.owner, singleReference, "broker X (single)");
  await expectBrokerLacksLead(brokerPage, y.owner, singleReference, "broker Y (single)");
  await expectBrokerLacksLead(brokerPage, z.owner, singleReference, "broker Z (single)");
  for (const [label, account] of [["X", x.owner], ["Y", y.owner], ["Z", z.owner]] as const) {
    await expectBrokerHasLead(brokerPage, account, multiReference, `broker ${label} (multi)`);
  }
  await brokerPage.context().close();

  // (c) the cap: a request names at most three offers (primary + 2 additional), whatever the client sends.
  const tooMany = await directSubmit({ selectedOfferId: x.offerId, additionalOfferIds: [offerOf(y), offerOf(z), x.offerId], multiBrokerAccepted: true });
  expect(tooMany.status, "more than 2 additional offers is a validation error").toBe(400);
});

test("VG-06 relance « documents manquants » (lecture seule) : demande ouverte, aucune relance avant le délai, worker vivant", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const y = requireWorld(ROOT_WORLD_Y);
  const reference = y.data.chosenRef as string;
  expect(reference, "lead of VG-03 held by Y").toMatch(/^QR-/u);

  // The messaging flag opens the document requests; remember its state to put it back.
  const admin = await adminSession(browser);
  initialMessagingFlag = await globalFlagIsOn(admin, "broker_visitor_messaging_enabled");
  await setGlobalFlag(admin, "broker_visitor_messaging_enabled", true, VG_REASON);
  await admin.context().close();

  // Y accepts the lead and asks the visitor for a document (a real "open" request, the reminder's input).
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, y.owner, "/leads");
  await broker.getByRole("row").filter({ hasText: reference }).getByRole("link").first().click();
  await broker.waitForURL(/\/leads\/[0-9a-f-]{36}/u);
  const actions = card(broker, "Actions Starter");
  const accept = actions.getByRole("button", { name: "Accepter", exact: true });
  if ((await accept.count()) > 0) {
    await accept.click();
    await expect(broker.getByText("Lead accepte.")).toBeVisible();
  }
  // The visitor e-mail of the lead is read on the lead page ("Contact consenti").
  const contact = card(broker, "Contact consenti");
  const visitorEmail = (await contact.innerText()).match(/[\w.+-]+@visitor\.e2e\.test/u)?.[0] as string;
  expect(visitorEmail, "visitor e-mail on the lead").toBeTruthy();
  const form = broker.locator("form[aria-label='Nouvelle demande de document']");
  await form.locator("input[name='label']").fill("Carte grise");
  await form.locator("input[name='dueAt']").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Demander le document au visiteur" }).click();
  await expect(form.getByText(/Demande de document créée/u)).toBeVisible();
  await broker.context().close();

  const requested = await waitForMail({ to: visitorEmail, subject: /documents vous sont demandés/u });
  const trackingLink = extractLink(requested, new RegExp(`/demandes-de-devis/${reference}\\?token=`, "u"));
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(trackingLink);
  const open = visitor.locator("#documents-demandes article[data-request-id]").filter({ hasText: "Carte grise" });
  await expect(open).toHaveAttribute("data-request-status", "open");

  // Read-only state: the single reminder only leaves 3 days after the request opened (the delay is
  // 1 to 30 days, never shorter), so nothing may have been sent to the visitor yet.
  const reminders = (await searchMessages(`to:"${visitorEmail}"`)).filter((mail) => /toujours attendus|still awaited/iu.test(mail.Subject));
  expect(reminders, "no reminder before the delay").toEqual([]);
  // Wait one worker cycle (5 s on this stack) and read again: still nothing.
  await visitor.waitForTimeout(12_000);
  const later = (await searchMessages(`to:"${visitorEmail}"`)).filter((mail) => /toujours attendus|still awaited/iu.test(mail.Subject));
  expect(later, "still no reminder one worker cycle later").toEqual([]);
  await visitor.context().close();

  // The worker is part of the stack: when its heartbeat is readable from this host, it is fresh.
  const age = workerHeartbeatAgeSeconds();
  if (age !== undefined) expect(age, "worker heartbeat age (s)").toBeLessThan(120);
});

test("VG-99 les flags ouverts par ce parcours sont remis dans leur état initial", async ({ browser }) => {
  if (multiBrokerOpened) {
    await setMultiBrokerPolicy(false, `E2E-POL-067-CLOSE-${uniqueSuffix()}`);
    await waitForQuoteOptions((options) => !options.multiBrokerAvailable, "multi-broker closes again");
  }

  const admin = await appPage(browser, e2eEnv.adminUrl);
  if (initialMessagingFlag === false) {
    await openAs(admin, superAdminAccount(), "/feature-flags");
    await setGlobalFlag(admin, "broker_visitor_messaging_enabled", false, VG_REASON);
  }
  if (initialDocumentFlag === false) {
    const state = loadJourneyState();
    await openAs(admin, superAdminAccount(), `/catalog/products/${requireState(state, "productIds").auto}`);
    await setCatalogFlag(admin, "product_document_upload_enabled", false, VG_REASON);
    await admin.goto(`/catalog/countries/${requireState(state, "countryId")}`);
    await setCatalogFlag(card(admin, "Liaison CI × Assurance auto"), "product_document_upload_enabled", false, VG_REASON);
  }
  await admin.context().close();
  expect((await readQuoteOptions()).multiBrokerAvailable).toBe(false);
});
