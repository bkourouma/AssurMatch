import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  changeStatus,
  createAndPublishQuoteForm,
  openCountry,
  openProduct,
  publishConsentText,
  setCatalogFlag,
  setGlobalFlag
} from "./support/admin";
import { activateWithMfa, e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadJourneyState, requireState, saveJourneyState } from "./support/journey-state";
import { extractLink, messageIdsTo, waitForMail } from "./support/mailpit";
import { card, confirmInDialog, escapeRegExp, expectActionSuccess, fillReason, idFromUrl, uniqueSuffix } from "./support/ui";
import { pdfFile } from "./support/files";
import { authorizeScope, reviewDocument, submitStatusTransition, uploadPartnerDocument } from "./support/partners";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Spec 059 / PRD v0.3 section 4: the launch acceptance scenario SC-01 -> SC-07, in sequence, on a
// blank stack (reference seed + first Super Admin only), through the three real applications.
// Each step is its own test so a failure names the scenario step; the steps share state through
// .local/e2e/journey-state.json and must run in order (serial mode).

test.describe.configure({ mode: "serial" });

const REASON = "Scenario E2E spec 059 - ouverture CI";

/** One page per app, each in its own browser context (constitution, principle III). */
async function adminPage(browser: Browser): Promise<Page> {
  const context = await newAppContext(browser, e2eEnv.adminUrl);
  return context.newPage();
}

function superAdmin(): BackOfficeAccount {
  return requireState(loadJourneyState(), "superAdmin");
}

test("SC-01a premier Super Admin : activation par e-mail et MFA TOTP", async ({ browser }) => {
  const page = await adminPage(browser);
  const mail = await waitForMail({ to: e2eEnv.superAdminEmail, subject: /Activation/iu });
  const link = extractLink(mail, /\/activate\?token=/u);
  expect(new URL(link).origin, "activation link points to the admin back-office").toBe(e2eEnv.adminUrl);

  const password = e2ePassword("super");
  const totpSecret = await activateWithMfa(page, link, password);
  saveJourneyState({ superAdmin: { app: "admin", email: e2eEnv.superAdminEmail, password, totpSecret } });
  await expect(page.getByRole("heading", { name: "Dashboard admin" })).toBeVisible();
  await page.context().close();
});

test("SC-01b ouvrir la Côte d'Ivoire, Auto et Voyage : consentements, formulaires, flags", async ({ browser }) => {
  const page = await adminPage(browser);
  const admin = superAdmin();
  await openAs(page, admin, "/");

  // Global journeys (the reference seed leaves them closed).
  await setGlobalFlag(page, "public_comparator_enabled", true, REASON);
  await setGlobalFlag(page, "quote_request_enabled", true, REASON);
  await setGlobalFlag(page, "starter_portal_enabled", true, REASON);
  await setGlobalFlag(page, "broker_dashboard_enabled", true, REASON);

  // Consent texts: the seed prepared FR and EN lead_transmission drafts for CI; publishing them is
  // a compliance act.
  const consentFr = await publishConsentText(page, "CI", "fr", REASON);
  const consentEn = await publishConsentText(page, "CI", "en", REASON);

  const countryId = await openCountry(page, "CI");
  const productIds: Record<string, string> = {};
  for (const key of ["auto", "voyage"]) productIds[key] = await openProduct(page, key);
  saveJourneyState({ countryId, productIds });

  // One published quote form per product and language, each bound to the consent of its language.
  const fields: Record<string, Record<"fr" | "en", string[]>> = {
    auto: {
      fr: ["vehicle_use|Usage du vehicule|select|true|public|prive,professionnel", "vehicle_brand|Marque du vehicule|text|false|public|"],
      en: ["vehicle_use|Vehicle use|select|true|public|private,business", "vehicle_brand|Vehicle make|text|false|public|"]
    },
    voyage: {
      fr: ["destination|Destination|text|true|public|"],
      en: ["destination|Destination|text|true|public|"]
    }
  };
  for (const key of ["auto", "voyage"] as const) {
    for (const language of ["fr", "en"] as const) {
      await createAndPublishQuoteForm(page, {
        countryId,
        productId: productIds[key] as string,
        language,
        version: `e2e-${key}-${language}-v1`,
        consentTextId: language === "fr" ? consentFr : consentEn,
        fields: fields[key][language]
      }, REASON);
    }
  }

  // Products: global flags, no forced manual review (routing must happen), then public status.
  for (const key of ["auto", "voyage"]) {
    await page.goto(`/catalog/products/${productIds[key]}`);
    for (const flag of ["product_public_enabled", "product_comparison_enabled", "product_quote_enabled"]) {
      await setCatalogFlag(page, flag, true, REASON);
    }
    await setCatalogFlag(page, "product_manual_review_required", false, REASON);
    await changeStatus(page, "Statut du produit", "public", REASON);
  }

  // Country: pilot first. "public" is refused until a licensed broker and an offer exist, and a
  // country in draft/internal is not offered by the broker application form (directory = public or
  // pilot countries), so pilot is the only status that lets the first broker apply.
  await page.goto(`/catalog/countries/${countryId}`);
  await changeStatus(page, "Statut du pays", "internal", REASON);
  await changeStatus(page, "Statut du pays", "pilot", REASON);
  for (const flag of ["country_comparison_enabled", "country_quote_enabled", "country_broker_onboarding_enabled"]) {
    await setCatalogFlag(page, flag, true, REASON);
  }
  for (const productName of ["Assurance auto", "Assurance voyage"]) {
    const link = card(page, `Liaison CI × ${productName}`);
    for (const flag of ["product_public_enabled", "product_comparison_enabled", "product_quote_enabled"]) {
      await setCatalogFlag(link, flag, true, REASON);
    }
    await setCatalogFlag(link, "product_manual_review_required", false, REASON);
  }

  // The country checklist now only lists what brokers and offers will bring (SC-01 "Then").
  await page.goto(`/catalog/countries/${countryId}`);
  const checklist = card(page, "Checklist d'activation du pays");
  await expect(checklist).toContainText("Au moins un courtier actif public");
  await expect(checklist).not.toContainText("Formulaire publie : manquant");
  await expect(checklist).not.toContainText("Consentement publie : manquant");
  await expect(checklist).not.toContainText("Flag devis pays : manquant");
  await page.context().close();
});

test("SC-02a candidature courtier sur le site public, examen et conversion par l'admin", async ({ browser }) => {
  const suffix = uniqueSuffix();
  const partnerName = `Cabinet Kouassi Courtage E2E ${suffix}`;
  const ownerEmail = `owner.${suffix}@broker-one.e2e.test`;

  // Public site (visitor context): /courtiers/candidature.
  const visitor = await (await newAppContext(browser, e2eEnv.publicUrl)).newPage();
  await visitor.goto("/courtiers/candidature");
  await visitor.locator("#am-apply-legalname").fill(partnerName);
  await visitor.locator("#am-apply-country").selectOption("CI");
  await visitor.locator("#am-apply-contactname").fill("Awa Kouassi");
  await visitor.locator("#am-apply-contactemail").fill(ownerEmail);
  await visitor.locator("#am-apply-contactphone").fill("+2250701020304");
  await visitor.locator("#am-apply-licensenumber").fill(`CI-AGR-${suffix}`);
  await visitor.locator("#am-apply-licenseexpires").fill(isoDate(addDays(new Date(), 400)));
  await visitor.locator("#am-apply-issuingauthority").fill("Direction des Assurances CI");
  await visitor.locator("#am-apply-capacity").fill("50");
  await visitor.locator("#am-apply-product-auto").check();
  await visitor.locator("#am-apply-product-voyage").check();
  await visitor.locator("input[name='desiredPlan'][value='starter']").check({ force: true });
  await visitor.locator("#am-apply-consent").check();
  await visitor.getByRole("button", { name: "Envoyer la candidature" }).click();
  const confirmation = visitor.getByRole("status").filter({ hasText: /PA-/u });
  await expect(confirmation).toBeVisible();
  const applicationReference = (await confirmation.innerText()).match(/PA-[A-Z0-9-]+/u)?.[0];
  expect(applicationReference, "application reference PA-...").toBeTruthy();
  await visitor.context().close();
  saveJourneyState({ applicationReference: applicationReference as string, partnerName, brokerOwner: { app: "broker", email: ownerEmail, password: "", totpSecret: "" } });

  // Admin: review, then convert (compliance decision) into a Prospect broker.
  const page = await adminPage(browser);
  await openAs(page, superAdmin(), "/partners/applications");
  await page.getByRole("row").filter({ hasText: partnerName }).getByRole("link").first().click();
  await expect(page.getByText(applicationReference as string).first()).toBeVisible();
  const decision = card(page, "Décision");
  await fillReason(decision, REASON);
  await decision.getByRole("button", { name: "Passer en examen" }).click();
  await expect(decision.getByRole("button", { name: "Convertir en courtier" })).toBeVisible();
  await expect(decision.getByRole("button", { name: "Passer en examen" })).toHaveCount(0);
  await decision.getByRole("button", { name: "Convertir en courtier" }).click();
  const dialog = page.locator("dialog[open]");
  await fillReason(dialog, REASON);
  await dialog.getByRole("button", { name: "Convertir", exact: true }).click();
  await page.waitForURL(/\/partners\/[0-9a-f-]{36}/u);
  const partnerId = idFromUrl(page);
  saveJourneyState({ partnerId });

  // The application is now "Convertie" (SC-02 "And") and the candidate got the decision e-mail.
  await page.goto("/partners/applications");
  await expect(page.getByRole("row").filter({ hasText: partnerName })).toContainText(/Convertie/u);
  await waitForMail({ to: ownerEmail, body: new RegExp(applicationReference as string, "u") });
  await page.context().close();
});

test("SC-02b licence, preuve d'agrément, couverture, contrat, invitation du propriétaire, activation", async ({ browser }) => {
  const state = loadJourneyState();
  const partnerId = requireState(state, "partnerId");
  const owner = requireState(state, "brokerOwner");
  const page = await adminPage(browser);
  await openAs(page, superAdmin(), `/partners/${partnerId}`);

  // SC-02 "Interdit": without a validated licence the activation is refused with explicit reasons.
  const conditions = card(page, "Conditions d'activation");
  await expect(conditions).toContainText("Licence valide avec preuve d'agrement acceptee");

  // Accreditation proof attached to the draft licence declared in the application.
  const license = card(page, /^Licence CI-AGR-/u);
  const licenseNumber = (await license.locator("h2").first().innerText()).replace(/^Licence\s+/u, "").trim();
  await uploadPartnerDocument(page, "license", pdfFile("agrement.pdf", `Agrement ${licenseNumber}`), licenseNumber);
  await reviewDocument(page, "agrement.pdf", "Accepter");

  // Compliance validates the licence (super_admin holds the compliance rights).
  await confirmInDialog(page, card(page, `Licence ${licenseNumber}`), "Valider", (dialog) => fillReason(dialog, REASON));
  await expect(card(page, `Licence ${licenseNumber}`)).toContainText("Valide");

  // Coverage: CI x Auto and Voyage.
  await authorizeScope(page, "Pays autorisés", "Côte d'Ivoire (CI)");
  await authorizeScope(page, "Produits autorisés", /Assurance auto/u);
  await authorizeScope(page, "Produits autorisés", /Assurance voyage/u);

  // Signed partnership contract: upload the document, then record the contract.
  await uploadPartnerDocument(page, "partnership_contract", pdfFile("contrat.pdf", "Contrat de partenariat E2E"));
  await reviewDocument(page, "contrat.pdf", "Accepter");
  const contract = card(page, "Contrat de partenariat");
  await contract.getByLabel("Version").fill("v1");
  await contract.getByLabel("Date de signature").fill(isoDate(new Date()));
  await contract.getByLabel("Signataire pour le courtier").fill("Awa Kouassi");
  await contract.getByLabel("Document du contrat signé").selectOption({ index: 1 });
  await fillReason(contract, REASON);
  await contract.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expectActionSuccess(contract, "record contract");

  // Owner invitation: the activation e-mail goes to the owner (broker app link).
  const users = card(page, "Utilisateurs du courtier");
  await users.getByLabel("E-mail").fill(owner.email);
  await users.getByLabel("Nom affiché").fill("Awa Kouassi");
  await fillReason(users, REASON);
  await users.getByRole("button", { name: /Inviter et émettre/u }).click();
  await expectActionSuccess(users, "invite owner");

  // Compliance review, then "Actif public".
  await page.goto(`/partners/${partnerId}`);
  await submitStatusTransition(page, "Envoyer en vérification", "En vérification");
  await submitStatusTransition(page, "Passer en Actif public", "Actif public");
  await expect(card(page, "Conditions d'activation")).not.toContainText("non remplie");

  const invitation = await waitForMail({ to: owner.email, subject: /Activation|activation|invitation/iu });
  const link = extractLink(invitation, /\/activate\?token=/u);
  expect(new URL(link).origin, "owner activation link opens the broker app").toBe(e2eEnv.brokerUrl);
  saveJourneyState({ brokerOwner: { ...owner, activationLink: link } });
  await page.context().close();
});

test("SC-03 le propriétaire active son compte courtier (MFA), complète sa société, voit sa licence, invite un agent", async ({ browser }) => {
  const state = loadJourneyState();
  const owner = requireState(state, "brokerOwner");
  const link = owner.activationLink;
  if (!link) throw new Error("owner activation link missing");
  const broker = await (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
  const password = e2ePassword("owner");
  const totpSecret = await activateWithMfa(broker, link, password);
  const account: BackOfficeAccount = { app: "broker", email: owner.email, password, totpSecret };
  saveJourneyState({ brokerOwner: account });
  await expect(broker.getByRole("heading", { name: "Portail courtier" })).toBeVisible();

  // Company profile (contacts and insurers are self-service; identity needs a reviewed request).
  await openAs(broker, account, "/company");
  const profile = card(broker, "Contacts et présentation");
  await profile.locator("input[name='commercialContactName']").fill("Koffi Yao");
  await profile.locator("input[name='commercialContactEmail']").fill("commercial@broker-one.e2e.test");
  await profile.locator("input[name='commercialContactPhone']").fill("+2250705060708");
  await profile.locator("textarea[name='partnerInsurers']").fill("Assureur Atlantique CI\nSunu Assurances CI");
  await profile.getByRole("button", { name: "Enregistrer" }).click();
  await expectActionSuccess(profile, "broker company profile");
  await broker.reload();
  await expect(broker.getByText("Koffi Yao").first()).toBeVisible();

  // The owner sees the licence state and its expiry date (SC-03 "And").
  await openAs(broker, account, "/licenses");
  const licence = card(broker, /^Licence CI-AGR-/u);
  await expect(licence).toContainText("Valide");
  await expect(licence).toContainText("Expiration");

  // Team: invite an agent; the invitation e-mail opens the broker app.
  const agentEmail = `agent.${uniqueSuffix()}@broker-one.e2e.test`;
  await openAs(broker, account, "/team");
  const invite = card(broker, "Inviter un collaborateur");
  await invite.getByLabel(/Nom affiché/u).fill("Jean Agent");
  await invite.getByLabel(/E-mail professionnel/u).fill(agentEmail);
  await invite.getByLabel(/Rôle/u).selectOption("broker_agent");
  await invite.getByRole("button", { name: "Inviter", exact: true }).click();
  await expectActionSuccess(invite, "invite agent");
  const agentMail = await waitForMail({ to: agentEmail });
  expect(new URL(extractLink(agentMail, /\/activate\?token=/u)).origin).toBe(e2eEnv.brokerUrl);
  await broker.context().close();
});

test("SC-04a le courtier crée une offre CI x Auto et la soumet à validation", async ({ browser }) => {
  const owner = requireState(loadJourneyState(), "brokerOwner");
  const broker = await (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
  const offerTitle = `Auto Tiers Plus E2E ${uniqueSuffix()}`;
  await openAs(broker, owner, "/offers/new");
  const form = broker.locator("form").filter({ has: broker.locator("select[name='scope']") });
  const scope = form.locator("select[name='scope']");
  const autoValue = await scope.locator("option", { hasText: "Côte d'Ivoire (CI) — Assurance auto" }).getAttribute("value");
  await scope.selectOption(autoValue ?? "");
  await form.locator("input[name='name']").fill(offerTitle);
  await form.locator("input[name='insurerName']").fill("Assureur Atlantique CI");
  await form.locator("textarea[name='shortDescription']").fill("Responsabilité civile, défense recours et assistance 24h/24.");
  await form.locator("textarea[name='guaranteeSummary']").fill("RC obligatoire, défense recours, assistance");
  await form.locator("select[name='guaranteeLevel']").selectOption("3");
  await form.getByRole("button", { name: "Ajouter une garantie" }).click();
  await form.locator("input[name='guaranteeLabel']").first().fill("Responsabilité civile");
  await form.getByRole("button", { name: "Ajouter une garantie" }).click();
  await form.locator("input[name='guaranteeLabel']").nth(1).fill("Assistance 24h/24");
  await form.locator("textarea[name='exclusionsSummary']").fill("Conduite sans permis, usage course.");
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
  saveJourneyState({ offerId, offerTitle });

  // Submission: the minimum completeness is reached, the version goes to the compliance queue.
  const actions = card(broker, "Actions");
  await actions.getByRole("button", { name: "Soumettre à validation" }).click();
  await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();
  await broker.context().close();
});

test("SC-04b un Compliance Admin invité active son compte et valide l'offre, qui devient publique", async ({ browser }) => {
  const state = loadJourneyState();
  const offerId = requireState(state, "offerId");
  const offerTitle = requireState(state, "offerTitle");

  // The Super Admin invites a Compliance Admin (four-eyes: the decision is not taken by the account
  // that opened the country).
  const admin = await adminPage(browser);
  const complianceEmail = `compliance.${uniqueSuffix()}@e2e.assurmatch.test`;
  await openAs(admin, superAdmin(), "/users");
  const create = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Creer et emettre activation" }) });
  await create.locator("input[name='email']").fill(complianceEmail);
  await create.locator("input[name='displayName']").fill("Conformite E2E");
  await create.locator("input[name='roles'][value='compliance_admin']").check();
  await create.locator("textarea[name='reason']").fill(REASON);
  await create.getByRole("button", { name: "Creer et emettre activation" }).click();
  const mail = await waitForMail({ to: complianceEmail });
  const link = extractLink(mail, /\/activate\?token=/u);
  await admin.context().close();

  const compliancePage = await adminPage(browser);
  const password = e2ePassword("compliance");
  const totpSecret = await activateWithMfa(compliancePage, link, password);
  const compliance: BackOfficeAccount = { app: "admin", email: complianceEmail, password, totpSecret };
  saveJourneyState({ complianceAdmin: compliance });

  // The submitted offer is in the admin queue; compliance validates and publishes it.
  await openAs(compliancePage, compliance, "/offers");
  await expect(compliancePage.getByRole("row").filter({ hasText: offerTitle })).toBeVisible();
  await openAs(compliancePage, compliance, `/offers/${offerId}`);
  await confirmInDialog(compliancePage, compliancePage.locator("[data-offer-decision='validate']"), "Valider et publier", (dialog) => fillReason(dialog, REASON));
  await expect(compliancePage.locator("[data-offer-decision='suspend']")).toBeVisible();
  await compliancePage.context().close();
});

test("SC-01c la conformité ouvre la Côte d'Ivoire au public : checklist verte, pages publiques visibles", async ({ browser }) => {
  const state = loadJourneyState();
  const compliance = requireState(state, "complianceAdmin");
  const countryId = requireState(state, "countryId");
  const page = await adminPage(browser);
  await openAs(page, compliance, `/catalog/countries/${countryId}`);
  await setCatalogFlag(page, "country_public_enabled", true, REASON);
  await changeStatus(page, "Statut du pays", "public", REASON);
  await page.goto(`/catalog/countries/${countryId}`);
  await expect(card(page, "Checklist d'activation du pays")).toContainText("Aucun contrôle bloquant");

  // Every catalogue action of the opening is in the audit log (SC-01 "And").
  await page.goto("/compliance/audit-logs");
  await expect(page.getByText(/country\.status_changed|catalog/u).first()).toBeVisible();
  await page.context().close();

  const visitor = await (await newAppContext(browser, e2eEnv.publicUrl)).newPage();
  await visitor.goto("/pays/CI");
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("Côte d'Ivoire");
  await visitor.screenshot({ path: "test-results/e2e/sc01c-ci.png", fullPage: true });
  await visitor.context().close();
});

test("SC-05 le visiteur compare, choisit l'offre du courtier, consent nommément et reçoit son lien de suivi", async ({ browser }) => {
  const state = loadJourneyState();
  const offerTitle = requireState(state, "offerTitle");
  const partnerName = requireState(state, "partnerName");
  const visitorEmail = `visiteur.${uniqueSuffix()}@visitor.e2e.test`;
  const visitor = await (await newAppContext(browser, e2eEnv.publicUrl)).newPage();

  await visitor.goto("/pays/CI");
  await visitor.getByRole("link", { name: "Comparer les offres" }).nth(1).click();
  await visitor.waitForURL(/\/pays\/CI\/produits\/auto\/offres/u);
  // The validated offer is public, marked indicative, with its responsible broker.
  const offer = visitor.locator("article, li, section").filter({ hasText: offerTitle }).filter({ hasText: "Courtier partenaire responsable" }).first();
  await expect(offer).toContainText(partnerName);
  await expect(visitor.getByText(/offre indicative/iu).first()).toBeVisible();
  await offer.getByRole("link", { name: "Demander un devis" }).click();
  await visitor.waitForURL(/\/devis\?offerId=/u);

  // The consent names the recipient broker (constitution II, decision D-4).
  const consent = visitor.locator("label[for='am-quote-consent'], #am-quote-consent >> xpath=..").first();
  await expect(consent).toContainText(partnerName);
  await visitor.locator("#am-quote-name").fill("Mariam Traoré");
  await visitor.locator("#am-quote-email").fill(visitorEmail);
  await visitor.locator("#am-quote-phone").fill("+2250102030405");
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill("Toyota");
  await visitor.locator("#am-answer-city").fill("Abidjan");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.locator("#am-quote-consent").check();
  await visitor.getByRole("button", { name: "Demander un devis" }).click();

  const reference = visitor.getByText(/QR-[A-Z0-9-]+/u).first();
  await expect(reference).toBeVisible();
  const quoteReference = (await reference.innerText()).match(/QR-[A-Z0-9-]+/u)?.[0] as string;
  await expect(visitor.getByText(partnerName).first()).toBeVisible();
  await visitor.screenshot({ path: "test-results/e2e/sc05-confirmation.png", fullPage: true });

  // The confirmation e-mail carries a WORKING tracking link (magic link, spec 054).
  const mail = await waitForMail({ to: visitorEmail, body: new RegExp(quoteReference, "u") });
  const trackingLink = extractLink(mail, new RegExp(`^${escapeRegExp(e2eEnv.publicUrl)}/demandes-de-devis/${quoteReference}\\?token=`, "u"));
  saveJourneyState({ quoteReference, visitorEmail, trackingLink });
  await visitor.goto(trackingLink);
  await expect(visitor.getByText(quoteReference).first()).toBeVisible();
  await expect(visitor.getByText(partnerName).first()).toBeVisible();
  await visitor.context().close();
});

test("SC-06 le courtier voit les coordonnées, accepte le lead et envoie une proposition non contractuelle", async ({ browser }) => {
  const state = loadJourneyState();
  const owner = requireState(state, "brokerOwner");
  const quoteReference = requireState(state, "quoteReference");
  const visitorEmail = requireState(state, "visitorEmail");
  const partnerName = requireState(state, "partnerName");
  const broker = await (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
  await openAs(broker, owner, "/leads");
  await broker.getByRole("row").filter({ hasText: quoteReference }).getByRole("link").first().click();
  await broker.waitForURL(/\/leads\/[0-9a-f-]{36}/u);
  saveJourneyState({ leadAssignmentId: idFromUrl(broker) });

  // D-2: full contact details as soon as the lead is assigned.
  const contact = card(broker, "Contact consenti");
  await expect(contact).toContainText(visitorEmail);
  await expect(contact).toContainText("+2250102030405");
  await expect(contact).not.toContainText("displayName");

  const seen = await messageIdsTo(visitorEmail);
  await card(broker, "Actions Starter").getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(broker.getByText("Acceptez d'abord le lead")).toHaveCount(0);
  await waitForMail({ to: visitorEmail, exclude: seen, body: new RegExp(escapeRegExp(partnerName), "u"), subject: /prise en charge|charge/iu });

  const seenBeforeProposal = await messageIdsTo(visitorEmail);
  const proposal = card(broker, "Répondre au visiteur");
  await proposal.locator("#starter-proposal-message").fill("Bonjour, suite à votre demande voici notre proposition indicative pour votre véhicule. Nous vous rappelons pour confirmer.");
  await proposal.locator("#starter-proposal-min").fill("90000");
  await proposal.locator("#starter-proposal-max").fill("110000");
  await proposal.locator("#starter-proposal-currency").selectOption("XOF");
  await proposal.locator("#starter-proposal-guarantees").fill("Responsabilité civile\nAssistance 24h/24");
  await proposal.locator("#starter-proposal-valid").fill(isoDate(addDays(new Date(), 30)));
  await proposal.locator("#starter-proposal-file").setInputFiles(pdfFile("proposition.pdf", `Proposition ${quoteReference}`));
  await proposal.getByRole("button", { name: "Envoyer la proposition au visiteur" }).click();
  await expect(proposal.getByText("Propositions actives : 1 / 10")).toBeVisible();

  // The visitor is told by e-mail that a proposal is available.
  await waitForMail({ to: visitorEmail, exclude: seenBeforeProposal, body: new RegExp(quoteReference, "u") });
  await broker.context().close();
});

test("SC-07 le visiteur répond « intéressé » depuis son espace de suivi ; le courtier est notifié, rien n'est appliqué d'office", async ({ browser }) => {
  const state = loadJourneyState();
  const trackingLink = requireState(state, "trackingLink");
  const partnerName = requireState(state, "partnerName");
  const owner = requireState(state, "brokerOwner");
  const leadAssignmentId = requireState(state, "leadAssignmentId");
  const quoteReference = requireState(state, "quoteReference");

  const visitor = await (await newAppContext(browser, e2eEnv.publicUrl)).newPage();
  await visitor.goto(trackingLink);
  await expect(visitor.getByText("Une proposition de courtier est disponible")).toBeVisible();
  const proposal = visitor.locator("article, section").filter({ hasText: `Proposition de ${partnerName}` }).last();
  await expect(proposal).toContainText("Proposition indicative non contractuelle, à confirmer par le courtier");
  await expect(proposal).toContainText("90 000");
  // Constitution I / SC-07: no subscription or purchase wording anywhere on the tracking space.
  const body = (await visitor.locator("main").innerText()).toLowerCase();
  for (const forbidden of ["souscrire", "souscrivez", "acheter", "achetez", "payer maintenant"]) expect(body, forbidden).not.toContain(forbidden);

  const seenByBroker = await messageIdsTo(owner.email);
  await visitor.getByLabel("Je suis intéressé, rappelez-moi").check({ force: true });
  await visitor.getByLabel(/Créneau de rappel/u).fill("demain entre 10 h et 12 h");
  await visitor.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(visitor.getByText(/réponse.*(transmise|envoyée)|Intéressé/iu).first()).toBeVisible();
  await visitor.context().close();

  // The broker is notified by e-mail and sees the answer in the lead history.
  await waitForMail({ to: owner.email, exclude: seenByBroker, body: new RegExp(quoteReference, "u") });
  const broker = await (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
  await openAs(broker, owner, `/leads/${leadAssignmentId}`);
  const answers = card(broker, "Répondre au visiteur");
  await expect(answers).toContainText(/Interess[ée] : demande a etre rappele \(creneau : demain entre 10 h et 12 h\)/u);
  // The answer is historised and the status is only suggested, never applied automatically.
  await expect(answers).toContainText("La derniere reponse fait foi");
  await expect(card(broker, "Informations utiles")).not.toContainText(/Gagn|Clotur|Perdu/u);
  await broker.context().close();
});
