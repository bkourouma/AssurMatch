import { expect, test } from "@playwright/test";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadJourneyState, requireState } from "./support/journey-state";
import { searchMessages } from "./support/mailpit";
import { card, rowWith, uniqueSuffix } from "./support/ui";
import { appPage, requestQuote, superAdminAccount, type VisitorQuote } from "./support/world";

// Spec 065 phase B / spec 066 F1 (privacy): two visitors who enter the SAME phone number with DIFFERENT
// e-mail addresses each get their own confirmation e-mail and tracking link, the broker sees the right
// contact on each lead, and the second request is only flagged `possible_duplicate` in the admin console.
// Runs on the offer of the scenario (broker X); every other journey keeps one phone per visitor.

test.describe.configure({ mode: "serial" });

const sharedPhone = `+22507${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const quotes: VisitorQuote[] = [];

test("F1-01 deux visiteurs, même téléphone, e-mails différents : chacun reçoit sa confirmation et son lien de suivi", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const state = loadJourneyState();
  const offerTitle = requireState(state, "offerTitle");
  const partnerName = requireState(state, "partnerName");

  for (const label of ["tel1", "tel2"]) {
    quotes.push(await requestQuote(browser, offerTitle, partnerName, `${label}${uniqueSuffix()}`.slice(0, 20), { phone: sharedPhone }));
  }
  const [first, second] = quotes as [VisitorQuote, VisitorQuote];
  expect(first.email).not.toBe(second.email);
  expect(first.reference).not.toBe(second.reference);

  // requestQuote already waited for each visitor's own confirmation e-mail (to its own address, with its own reference).
  // Cross-check: nothing about one request went to the other visitor's address.
  const toFirst = await searchMessages(`to:"${first.email}"`);
  const toSecond = await searchMessages(`to:"${second.email}"`);
  expect(toFirst.some((mail) => mail.Subject.includes(second.reference)), "first visitor never receives the second request").toBe(false);
  expect(toSecond.some((mail) => mail.Subject.includes(first.reference)), "second visitor never receives the first request").toBe(false);
  expect(second.trackingLink).toContain(second.reference);

  // Each tracking link opens its own request.
  for (const quote of quotes) {
    const visitor = await appPage(browser, e2eEnv.publicUrl);
    await visitor.goto(quote.trackingLink);
    await expect(visitor.getByText(quote.reference).first()).toBeVisible();
    await visitor.context().close();
  }
});

test("F1-02 le courtier voit le contact saisi dans chaque demande, pas celui de l'autre visiteur", async ({ browser }) => {
  const owner = requireState(loadJourneyState(), "brokerOwner");
  const [first, second] = quotes as [VisitorQuote, VisitorQuote];
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  for (const [quote, other] of [[first, second], [second, first]] as const) {
    await openAs(broker, owner, "/leads");
    await broker.getByRole("row").filter({ hasText: quote.reference }).getByRole("link").first().click();
    await broker.waitForURL(/\/leads\/[0-9a-f-]{36}/u);
    const contact = card(broker, "Contact consenti");
    await expect(contact).toContainText(quote.email);
    await expect(contact).not.toContainText(other.email);
  }
  await broker.context().close();
});

test("F1-03 la console admin des demandes signale la seconde en possible_duplicate sans la bloquer", async ({ browser }) => {
  const [first, second] = quotes as [VisitorQuote, VisitorQuote];
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), `/quote-requests?reference=${encodeURIComponent(second.reference)}`);
  await rowWith(admin, second.reference).getByRole("link").first().click();
  await admin.waitForURL(/\/quote-requests\/[0-9a-f-]{36}/u);
  await expect(admin.getByText(second.reference).first()).toBeVisible();
  await expect(admin.getByText(/Doublon possible/u).first()).toBeVisible();
  // The request is not blocked as a duplicate: it was routed like any other.
  await expect(admin.getByText(/Doublon bloqué/u)).toHaveCount(0);

  await openAs(admin, superAdminAccount(), `/quote-requests?reference=${encodeURIComponent(first.reference)}`);
  await rowWith(admin, first.reference).getByRole("link").first().click();
  await admin.waitForURL(/\/quote-requests\/[0-9a-f-]{36}/u);
  await expect(admin.getByText(/Doublon possible/u)).toHaveCount(0);
  await admin.context().close();
});
