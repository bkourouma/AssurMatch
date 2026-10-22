import { expect, request as playwrightRequest, test } from "@playwright/test";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { leadConsentProofRow, licenceAlertCount, openQuoteReview } from "./support/forbidden-pro";
import { loadWorld, requireWorld, saveWorld } from "./support/journey-state";
import { messageIdsTo, waitForMail } from "./support/mailpit";
import { card, confirmInDialog, escapeRegExp, fillReason } from "./support/ui";
import {
  WORLD_REASON,
  addDays,
  appPage,
  complianceAccount,
  findAssignmentId,
  isoDate,
  provisionBroker,
  publishOffer,
  requestQuote
} from "./support/world";

// Spec 065 / PRD 32.6: the forbidden cases that need a Starter broker firm of their own.
//   SC-10-LIC  a broker whose licence is no longer valid is excluded (offer hidden, consent no
//              longer names it) and compliance is alerted before and after;
//   SC-10-WD   the visitor withdraws the consent given for the transmission: the lead is closed at
//              the broker with the contact masked, the visitor is confirmed by e-mail and the
//              compliance proof shows the withdrawal.
// Each case builds its own firm (worlds "licence-expiry" and "withdrawal") on top of the CI x Auto
// opened by scenario-core, so it depends on no other journey.

test.describe.configure({ mode: "serial" });

const LICENCE_WORLD = "licence-expiry";
const WITHDRAWAL_WORLD = "withdrawal";
/** The licence of the SC-10-LIC firm expires in 6 days: inside the J-7 warning window. */
const LICENCE_VALID_DAYS = 6;

// ---------------------------------------------------------------------------------------------
// SC-10-LIC : licence expiry
// ---------------------------------------------------------------------------------------------

test("SC-10-LIC-1 un courtier Starter à licence courte reçoit le lead d'un visiteur tant que sa licence est valide", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  if (loadWorld(LICENCE_WORLD)?.data.leadRef) return; // already built by a previous run

  // Alerts already naming this expiry date (other runs of the day): the new ones are counted from here.
  const expiresOn = isoDate(addDays(new Date(), LICENCE_VALID_DAYS));
  const admin = await appPage(browser, e2eEnv.adminUrl);
  const alertsBefore = await licenceAlertCount(admin, complianceAccount(), expiresOn);
  await admin.context().close();

  const world = await provisionBroker(browser, { plan: "starter", label: "lic", licenseValidDays: LICENCE_VALID_DAYS });
  world.data.expiresOn = expiresOn;
  world.data.alertsBefore = String(alertsBefore);
  saveWorld(LICENCE_WORLD, world);
  const offer = await publishOffer(browser, world, "Licence");
  world.offerId = offer.offerId;
  world.offerTitle = offer.offerTitle;
  saveWorld(LICENCE_WORLD, world);

  // Licence valid: the visitor's request on the offer is routed to this broker (lead visible there).
  const quote = await requestQuote(browser, offer.offerTitle, world.partnerName, "lic");
  world.data.leadRef = quote.reference;
  world.data.leadEmail = quote.email;
  saveWorld(LICENCE_WORLD, world);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  world.data.assignmentId = await findAssignmentId(broker, world.owner, quote.reference);
  await expect(card(broker, "Contact consenti")).toContainText(quote.email);
  await broker.context().close();
  saveWorld(LICENCE_WORLD, world);

  // The routing decision names the broker as the recipient.
  const compliance = await appPage(browser, e2eEnv.adminUrl);
  await openAs(compliance, complianceAccount(), "/routing/history");
  await expect(compliance.getByRole("row").filter({ hasText: quote.reference }).first()).toContainText("assigned");
  await expect(compliance.getByRole("row").filter({ hasText: quote.reference }).first()).toContainText(world.partnerName);
  await compliance.context().close();
});

test("SC-10-LIC-2 la licence qui expire sous 30 jours est signalée au courtier et à la plateforme, sans encore exclure le courtier", async ({ browser }) => {
  const world = requireWorld(LICENCE_WORLD);
  const expiresOn = world.data.expiresOn as string;

  // Broker portal (Starter): the dashboard lists the licence as expiring, the licence stays valid.
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, world.owner, "/");
  const alerts = card(broker, "Alertes licence");
  await expect(alerts).toContainText("expirant prochainement");
  await expect(alerts).toContainText(expiresOn);
  await openAs(broker, world.owner, "/licenses");
  await expect(broker.getByRole("main")).toContainText("Valide");
  await broker.context().close();

  // Platform: the dashboard counts it, the partner page still reads "Valide" (nothing is blocked yet).
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, complianceAccount(), "/dashboard");
  await expect(admin.getByText(/Licences expirant dans 30 jours: [1-9]/u)).toBeVisible();
  await openAs(admin, complianceAccount(), `/partners/${world.partnerId}`);
  await expect(admin.locator("#licences")).toContainText("Valide");
  await expect(admin.getByText("Expiré", { exact: true })).toHaveCount(0);
  await admin.context().close();

  // Still public and still named in the consent while the licence is valid.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/CI/produits/auto/offres");
  await expect(visitor.getByText(world.offerTitle as string).first()).toBeVisible();
  await visitor.context().close();
});

test("SC-10-LIC-3 la tâche planifiée lève l'alerte conformité, notifie le courtier dans l'application et par e-mail", async ({ browser }) => {
  // The worker runs the licence alerts once per ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES (60 by
  // default): the e2e stack should set it to 1 so this test does not wait for the hourly run.
  test.setTimeout(12 * 60_000);
  const world = requireWorld(LICENCE_WORLD);
  const expiresOn = world.data.expiresOn as string;

  const mail = await waitForMail({ to: world.owner.email, subject: /Licence bientôt expirée/u, timeoutMs: 10 * 60_000 });
  expect(`${mail.Text}\n${mail.HTML}`).toMatch(/licence de votre cabinet/iu);

  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, world.owner, "/notifications");
  const inbox = card(broker, "Boite de reception");
  await expect(inbox).toContainText("Licence bientôt expirée");
  await expect(inbox).toContainText(`expire le ${expiresOn}`);
  await broker.context().close();

  const admin = await appPage(browser, e2eEnv.adminUrl);
  const before = Number(world.data.alertsBefore ?? "0");
  await expect
    .poll(() => licenceAlertCount(admin, complianceAccount(), expiresOn), { timeout: 2 * 60_000, message: "admin compliance alert for the expiring licence" })
    .toBeGreaterThan(before);
  const alert = admin.getByRole("row").filter({ hasText: `expiresOn: ${expiresOn}` }).first();
  await expect(alert).toContainText("Licence courtier bientot expiree");
  await expect(alert).toContainText("threshold: 7");
  await admin.context().close();
});

test("SC-10-LIC-4 licence suspendue par la conformité : le courtier n'est plus routable, son offre disparaît et le consentement ne le nomme plus", async ({ browser }) => {
  // An expired licence and a suspended one fail the same rule (`licenses.eligible`, reason
  // `license_not_valid_for_scope`); a licence cannot be back-dated through the screens, so the
  // exclusion is exercised with the compliance suspension.
  test.setTimeout(10 * 60_000);
  const world = requireWorld(LICENCE_WORLD);
  const offerId = world.offerId as string;
  const offerTitle = world.offerTitle as string;

  // Before: the consent of the quote form names the broker (decision D-4).
  const before = await appPage(browser, e2eEnv.publicUrl);
  await expect(await openQuoteReview(before, offerId)).toContainText(world.partnerName);
  await before.context().close();

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, complianceAccount(), `/partners/${world.partnerId}`);
  const licences = admin.locator("#licences");
  if ((await licences.getByRole("button", { name: "Suspendre" }).count()) > 0) {
    await confirmInDialog(admin, licences, "Suspendre", (dialog) => fillReason(dialog, WORLD_REASON));
  }
  await admin.reload();
  await expect(admin.locator("#licences")).toContainText("Suspendue");
  // The broker has no valid licence left: the partner reads "Expiré" for the platform.
  await expect(admin.getByText("Expiré", { exact: true }).first()).toBeVisible();
  await admin.context().close();

  // Broker portal: the licence is suspended and the broker is told it blocks the reception of requests.
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, world.owner, "/licenses");
  await expect(broker.getByRole("main")).toContainText("Suspendue");
  await expect(broker.getByRole("main")).toContainText(/bloque la réception de demandes/u);
  // The lead routed while the licence was valid stays in the broker's list.
  await openAs(broker, world.owner, "/leads");
  await expect(broker.getByRole("row").filter({ hasText: world.data.leadRef as string }).first()).toBeVisible();
  await broker.context().close();

  // Visitor: the offer is gone from the public catalogue, and the consent no longer names the broker.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await expect
    .poll(async () => {
      await visitor.goto("/pays/CI/produits/auto/offres");
      return (await visitor.getByText(offerTitle).count()) + (await visitor.getByText(world.partnerName).count());
    }, { timeout: 60_000, message: "offer of the excluded broker hidden from the public catalogue" })
    .toBe(0);
  await expect(await openQuoteReview(visitor, offerId)).not.toContainText(world.partnerName);
  await visitor.context().close();
});

// ---------------------------------------------------------------------------------------------
// SC-10-WD : consent withdrawal by the visitor
// ---------------------------------------------------------------------------------------------

test("SC-10-WD-1 un lead est transmis puis accepté par le courtier ; la preuve de consentement est « granted »", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  if (loadWorld(WITHDRAWAL_WORLD)?.data.leadRef) return; // already built by a previous run

  const world = await provisionBroker(browser, { plan: "starter", label: "wd" });
  saveWorld(WITHDRAWAL_WORLD, world);
  const offer = await publishOffer(browser, world, "Retrait");
  world.offerId = offer.offerId;
  world.offerTitle = offer.offerTitle;
  saveWorld(WITHDRAWAL_WORLD, world);
  const quote = await requestQuote(browser, offer.offerTitle, world.partnerName, "wd");
  world.data.leadRef = quote.reference;
  world.data.leadEmail = quote.email;
  world.data.leadPhone = quote.phone;
  world.data.trackingLink = quote.trackingLink;
  saveWorld(WITHDRAWAL_WORLD, world);

  // The broker sees the full contact and takes the lead in charge.
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  world.data.assignmentId = await findAssignmentId(broker, world.owner, quote.reference);
  await expect(card(broker, "Contact consenti")).toContainText(quote.email);
  await expect(card(broker, "Contact consenti")).toContainText(quote.phone);
  await card(broker, "Actions Starter").getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(card(broker, "Informations utiles")).toContainText("Accepte");
  await expect(card(broker, "Actions Starter").getByRole("button", { name: "Clôturer" }).first()).toBeVisible();
  await broker.context().close();
  saveWorld(WITHDRAWAL_WORLD, world);

  // Compliance proof of the consent given for the transmission, naming this broker.
  const admin = await appPage(browser, e2eEnv.adminUrl);
  const proof = await leadConsentProofRow(admin, complianceAccount(), quote.reference);
  await expect(proof).toContainText("granted");
  await expect(proof).toContainText(`partner:${world.partnerId}`);
  await admin.context().close();
});

test("SC-10-WD-2 le visiteur retire son consentement depuis son espace de suivi : confirmation en deux temps, puis e-mail de confirmation", async ({ browser }) => {
  const world = requireWorld(WITHDRAWAL_WORLD);
  const reference = world.data.leadRef as string;
  const visitorEmail = world.data.leadEmail as string;
  const trackingLink = world.data.trackingLink as string;
  const seenMails = await messageIdsTo(visitorEmail);

  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(trackingLink);
  await expect(visitor.getByText(reference).first()).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Retirer mon consentement" })).toBeVisible();

  // Two steps: asking, then confirming. Cancelling the confirmation withdraws nothing.
  await visitor.getByRole("button", { name: "Retirer mon consentement" }).click();
  await expect(visitor.getByText(`Confirmez-vous le retrait de votre consentement pour la demande ${reference} ?`)).toBeVisible();
  await visitor.getByRole("button", { name: "Annuler" }).click();
  await expect(visitor.getByRole("button", { name: "Confirmer le retrait" })).toHaveCount(0);
  await visitor.reload();
  await expect(visitor.getByText(/Vous avez retiré votre consentement/u)).toHaveCount(0);

  await visitor.getByRole("button", { name: "Retirer mon consentement" }).click();
  await visitor.getByRole("button", { name: "Confirmer le retrait" }).click();
  await expect(visitor.getByRole("status").filter({ hasText: "Consentement retiré" }).first()).toBeVisible();

  // The tracking space now reads the withdrawal and no longer offers it.
  await visitor.goto(trackingLink);
  await expect(visitor.getByText(/Vous avez retiré votre consentement.*annulée et n'est plus transmise/su)).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Retirer mon consentement" })).toHaveCount(0);
  await expect(visitor.getByRole("heading", { name: "Retirer mon consentement" })).toHaveCount(0);
  await visitor.context().close();

  // Confirmation e-mail to the visitor.
  const mail = await waitForMail({ to: visitorEmail, exclude: seenMails, subject: /Retrait de votre consentement/u, body: new RegExp(escapeRegExp(reference), "u") });
  const content = `${mail.Text}\n${mail.HTML}`;
  expect(content).toMatch(/retrait de votre consentement/iu);
  expect(content).toMatch(/clôturée/u);
  expect(content).toMatch(/ne doit plus la traiter/u);
});

test("SC-10-WD-3 le retrait est idempotent côté API et un jeton erroné ne révèle rien", async () => {
  const world = requireWorld(WITHDRAWAL_WORLD);
  const reference = world.data.leadRef as string;
  const token = new URL(world.data.trackingLink as string).searchParams.get("token") as string;
  const api = await playwrightRequest.newContext();
  const endpoint = `${e2eEnv.apiUrl}/quote-requests/${reference}/consent-withdrawal`;
  const headers = { origin: e2eEnv.publicUrl };

  const again = await api.post(`${endpoint}?token=${encodeURIComponent(token)}`, { headers });
  expect(again.status(), await again.text()).toBe(200);
  expect(await again.text()).toMatch(/"alreadyWithdrawn"\s*:\s*true/u);

  const wrong = await api.post(`${endpoint}?token=${encodeURIComponent(`${token.slice(0, -4)}AAAA`)}`, { headers });
  expect(wrong.status()).toBe(404);
  expect(await wrong.text()).not.toContain(world.partnerName);
  await api.dispose();
});

test("SC-10-WD-4 côté courtier : lead clôturé, coordonnées masquées, actions et propositions bloquées, notification reçue", async ({ browser }) => {
  const world = requireWorld(WITHDRAWAL_WORLD);
  const reference = world.data.leadRef as string;
  const visitorEmail = world.data.leadEmail as string;
  const [localPart = "", domain = ""] = visitorEmail.split("@");

  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, world.owner, `/leads/${world.data.assignmentId}`);
  await expect(card(broker, "Informations utiles")).toContainText("Cloture");

  // Product rule (spec 055 FR-001 / LeadContactPolicy): the contact is masked for the broker after a withdrawal.
  const contact = card(broker, "Contact consenti");
  await expect(contact).toContainText("a retire son consentement");
  await expect(contact).toContainText(`${localPart.slice(0, 2)}***@${domain}`);
  await expect(contact).not.toContainText(visitorEmail);
  await expect(contact).not.toContainText(world.data.leadPhone as string);

  // Closed lead: no broker action, no new proposal.
  const actions = card(broker, "Actions Starter");
  await expect(actions).toContainText("Ce lead est cloture");
  await expect(actions.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Clôturer" })).toHaveCount(0);
  const reply = card(broker, "Répondre au visiteur");
  await expect(reply).toContainText("a retire son consentement : aucune proposition ne peut etre envoyee");
  await expect(reply.getByRole("button", { name: "Envoyer la proposition au visiteur" })).toBeDisabled();

  // The lead list shows it closed, and the broker inbox carries the withdrawal notice.
  await openAs(broker, world.owner, "/leads");
  await expect(broker.getByRole("row").filter({ hasText: reference }).first()).toContainText("Cloture");
  await openAs(broker, world.owner, "/notifications");
  const inbox = card(broker, "Boite de reception");
  await expect(inbox).toContainText("Consentement retiré par le visiteur");
  await expect(inbox).toContainText(reference);
  await broker.context().close();
});

test("SC-10-WD-5 la preuve de consentement de la conformité passe à « withdrawn » avec sa date de retrait", async ({ browser }) => {
  const world = requireWorld(WITHDRAWAL_WORLD);
  const admin = await appPage(browser, e2eEnv.adminUrl);
  const proof = await leadConsentProofRow(admin, complianceAccount(), world.data.leadRef as string);
  await expect(proof).toContainText("withdrawn");
  await expect(proof).toContainText(`partner:${world.partnerId}`);
  // "Retire le" carries the withdrawal date (YYYY-MM-DD HH:MM), not the empty marker.
  await expect(proof).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/su);
  await admin.context().close();
});
