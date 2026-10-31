import { expect, test, type Browser, type Page } from "@playwright/test";
import { changeStatus, createAndPublishQuoteForm, openCountry, openProduct, publishConsentText, setCatalogFlag } from "./support/admin";
import { provisionActivationPrerequisites } from "./support/activation-prerequisites";
import { activateWithMfa, e2ePassword, openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadWorld, saveWorld } from "./support/journey-state";
import { extractLink, waitForMail } from "./support/mailpit";
import { onboardBrokerSenegal, publishOfferSenegal } from "./support/senegal";
import { card, fillReason, rowWith, uniqueSuffix } from "./support/ui";
import { reviewQuote } from "./support/quote-form";
import { appPage, complianceAccount, superAdminAccount } from "./support/world";

// Spec 065 / PRD v0.3 section 4, SC-01 "à dérouler pour CI puis pour SN": the Super Admin opens the
// Sénégal on the stack left by scenario-core (global flags already on, CI open), then a Senegal
// broker and offer prove the public pages. It runs after forbidden-cases (SC-09a asserts SN is closed).
//
// Covered: SN-01 waiting page of the closed country, lead_transmission consent texts FR and EN
// (the reference seed prepares both as drafts), SN-02 country identity (CIMA regime, XOF, +221),
// one published quote form per product and language (Auto, Voyage), SN-03 products, pilot status
// and flags, SN-04 country checklist listing only the broker and the offer, SN-05 the public opening
// is refused with explicit reasons (status and flag) and SN stays in pilot, SN-06 the public pages
// of the pilot country without broker nor offer, SN-07 Senegal broker (SN licence, SN x Auto
// coverage) and SN-08 its offer validated by compliance, SN-09 the public offer list, the quote
// forms in both languages and the green checklist.
// SN-09 finally switches SN to "public" (last journey of the suite). Not covered on purpose: a visitor
// quote request sent in SN, Mali and Guinea (out of scope).

test.describe.configure({ mode: "serial" });

const REASON = "Ouverture du Sénégal E2E spec 065";
const SN_QUOTE_FIELDS: Record<string, Record<"fr" | "en", string[]>> = {
  auto: {
    fr: ["vehicle_use|Usage du véhicule|select|true|public|prive,professionnel", "vehicle_brand|Marque du véhicule|text|false|public|"],
    en: ["vehicle_use|Vehicle use|select|true|public|private,business", "vehicle_brand|Vehicle make|text|false|public|"]
  },
  voyage: {
    fr: ["destination|Destination|text|true|public|"],
    en: ["destination|Destination|text|true|public|"]
  }
};
const PRODUCTS = ["auto", "voyage"] as const;
const LANGUAGES = ["fr", "en"] as const;

/** True while the country checklist still waits for a broker (false on a re-run of this journey). */
let freshOpening = true;
let snBroker: { partnerId: string; partnerName: string; owner: BackOfficeAccount } | undefined;
let snOffer: { offerId: string; offerTitle: string } | undefined;

async function adminPage(browser: Browser): Promise<Page> {
  return appPage(browser, e2eEnv.adminUrl);
}

test("SN-01 pays fermé : la page du Sénégal est une liste d'attente, puis la conformité publie les consentements FR et EN", async ({ browser }) => {
  // Draft country with the waiting list on (reference seed): no path to a quote at all.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/SN");
  if (await visitor.getByText("n'est pas encore ouvert").count()) {
    await expect(visitor.getByText("Aucun parcours de devis n'est proposé depuis cette page.")).toBeVisible();
    await expect(visitor.locator("#am-quote-consent")).toHaveCount(0);
    await expect(visitor.getByRole("link", { name: "Demander un devis" })).toHaveCount(0);
  } else {
    test.info().annotations.push({ type: "rerun", description: "SN already past the waiting list" });
  }
  await visitor.context().close();

  // The seed prepares one draft per language; publishing is a compliance act (immutable text).
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/");
  for (const language of LANGUAGES) {
    const consentTextId = await publishConsentText(admin, "SN", language, REASON);
    expect(consentTextId).toMatch(/^[0-9a-f-]{36}$/u);
  }
  await admin.goto("/consent-texts?purpose=lead_transmission");
  for (const language of LANGUAGES) {
    await expect(rowWith(admin, "SN", language, "published")).toBeVisible();
  }
  await admin.context().close();
});

test("SN-02 le Sénégal : régime CIMA, XOF, +221 ; un formulaire de devis publié par produit et par langue", async ({ browser }) => {
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/");
  const countryId = await openCountry(admin, "SN");

  // Reference data of the seed (spec 051): the regime comes from the regulatory family.
  const identity = card(admin, "Synthèse");
  await expect(identity).toContainText("CIMA");
  await expect(identity).toContainText("cima");
  await expect(identity).toContainText("fr, en");
  await expect(identity).toContainText("XOF");
  await expect(identity).toContainText("Africa/Dakar");
  await expect(identity).toContainText("+221, 9 chiffres");
  await expect(identity).not.toContainText("Non renseigné");

  const productIds: Record<string, string> = {};
  for (const key of PRODUCTS) productIds[key] = await openProduct(admin, key);
  const consentIds: Record<string, string> = {};
  for (const language of LANGUAGES) consentIds[language] = await publishConsentText(admin, "SN", language, REASON);

  for (const key of PRODUCTS) {
    for (const language of LANGUAGES) {
      await createAndPublishQuoteForm(admin, {
        countryId,
        productId: productIds[key] as string,
        language,
        version: `e2e-sn-${key}-${language}-v1`,
        consentTextId: consentIds[language] as string,
        fields: SN_QUOTE_FIELDS[key]?.[language] ?? []
      }, REASON);
      await expect(rowWith(admin, `e2e-sn-${key}-${language}-v1`, "published")).toBeVisible();
    }
  }
  await admin.context().close();
});

test("SN-03 produits Auto et Voyage, statut pilote du Sénégal et flags pays et liaisons", async ({ browser }) => {
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/");
  const countryId = await openCountry(admin, "SN");

  // Spec 070 (PRD 35/36): activation prerequisites of the checklist (product scoring rule, FR/EN disclaimers,
  // SN routing rule, product and country attestations by the super admin with MFA). Idempotent: the product
  // ones already exist after scenario-core; the SN routing rule and country attestations are new here.
  const productIds: string[] = [];
  for (const key of PRODUCTS) productIds.push(await openProduct(admin, key));
  await provisionActivationPrerequisites(admin, { countryId, productIds, reason: REASON });

  // Products are global: scenario-core already opened them for CI, so these steps are idempotent.
  for (const key of PRODUCTS) {
    await openProduct(admin, key);
    for (const flag of ["product_public_enabled", "product_comparison_enabled", "product_quote_enabled"]) {
      await setCatalogFlag(admin, flag, true, REASON);
    }
    await setCatalogFlag(admin, "product_manual_review_required", false, REASON);
    await changeStatus(admin, "Statut du produit", "public", REASON);
  }

  // Country: draft -> internal -> pilot, then the flags (quote needs the published forms above).
  await admin.goto(`/catalog/countries/${countryId}`);
  await changeStatus(admin, "Statut du pays", "internal", REASON);
  await changeStatus(admin, "Statut du pays", "pilot", REASON);
  for (const flag of ["country_comparison_enabled", "country_quote_enabled", "country_broker_onboarding_enabled"]) {
    await setCatalogFlag(admin, flag, true, REASON);
  }
  for (const productName of ["Assurance auto", "Assurance voyage"]) {
    const link = card(admin, `Liaison SN × ${productName}`);
    for (const flag of ["product_public_enabled", "product_comparison_enabled", "product_quote_enabled"]) {
      await setCatalogFlag(link, flag, true, REASON);
    }
    await setCatalogFlag(link, "product_manual_review_required", false, REASON);
  }

  await admin.goto(`/catalog/countries/${countryId}`);
  await expect(card(admin, "Synthèse")).toContainText("pilot");
  // The public exposure of the country stays closed: it is the compliance go/no-go of SN-05.
  await expect(admin.locator('form[data-catalog-flag-form="country_public_enabled"]').first().getByRole("button", { name: /^Activer :/u })).toBeVisible();
  await admin.context().close();
});

test("SN-04 la checklist du Sénégal ne liste plus que le courtier actif public et l'offre (ni formulaire, ni consentement, ni flag)", async ({ browser }) => {
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/");
  const countryId = await openCountry(admin, "SN");
  await admin.goto(`/catalog/countries/${countryId}`);
  const checklist = card(admin, "Checklist d'activation du pays");
  freshOpening = (await checklist.getByText("Au moins un courtier actif public").count()) > 0;
  test.skip(!freshOpening, "SN already has a broker and an offer (re-run): the pre-broker assertions do not apply");

  await expect(checklist).toContainText("Au moins un courtier actif public");
  await expect(checklist).toContainText("Au moins une offre publiable");
  // Count of ActivationChecklistService.countryActivationBlockers for a pilot SN: broker + offer. The spec 070
  // controls (routing rule, scoring rules, FR/EN disclaimers, 4 country and 4 product attestations per product)
  // were provisioned in SN-03, so they are green here; had they not been, 2 + 1 + 4 + 2 x 6 = 19 would show.
  await expect(checklist).toContainText("2 contrôle(s) bloquant(s)");
  for (const provisioned of ["Au moins une regle de routage active", "Au moins une regle de scoring active", "Avertissement legal FR et EN", "Notifications testees", "Routage teste pour ce produit"]) {
    await expect(checklist, `${provisioned} is provisioned`).not.toContainText(provisioned);
  }
  for (const done of ["Formulaire publie", "Consentement publie", "Flag devis pays", "Flag comparaison pays", "Statut produit public", "Flag produit public", "Flag devis produit", "Regime reglementaire renseigne"]) {
    await expect(checklist, `${done} is done`).not.toContainText(done);
  }

  // The technical checklist (spec 026) agrees: the quote journeys are ready, the country is not.
  await admin.goto("/activation-checklist?country=SN");
  await expect(rowWith(admin, "Pays SN")).toContainText("aucun courtier actif licencie");
  for (const key of PRODUCTS) {
    const journey = rowWith(admin, `Parcours devis SN/${key}`);
    await expect(journey).toContainText("Formulaire publie");
    await expect(journey).toContainText("Consentement publie");
    await expect(journey).not.toContainText("blocked");
  }
  await expect(rowWith(admin, "Offres publiques candidates")).toContainText("blocked");
  await admin.context().close();
});

test("SN-05 interdit : sans courtier ni offre, l'ouverture publique du Sénégal est refusée avec ses motifs et le pays reste pilote", async ({ browser }) => {
  test.skip(!freshOpening, "re-run: SN already has a broker and an offer");
  const compliance = await adminPage(browser);
  await openAs(compliance, complianceAccount(), "/");
  const countryId = await openCountry(compliance, "SN");

  // 1. Status "public".
  const statusCard = card(compliance, "Statut du pays");
  await statusCard.getByLabel("Nouveau statut").selectOption("public");
  await fillReason(statusCard, REASON);
  await statusCard.getByRole("button", { name: "Changer le statut" }).click();
  const statusRefusal = statusCard.locator(".bo-notice[data-tone='danger']").first();
  await expect(statusRefusal).toBeVisible();
  await expect(statusRefusal).toContainText("Activation refusée");
  await expect(statusRefusal.locator("[data-catalog-blockers]")).toContainText("Au moins un courtier actif public");
  await expect(statusRefusal.locator("[data-catalog-blockers]")).toContainText("Au moins une offre publiable");

  // 2. Flag "Exposition publique du pays".
  await compliance.goto(`/catalog/countries/${countryId}`);
  const flagForm = compliance.locator('form[data-catalog-flag-form="country_public_enabled"]').first();
  await fillReason(flagForm, REASON);
  await flagForm.getByRole("button", { name: /^Activer :/u }).click();
  const flagRefusal = flagForm.locator(".bo-notice[data-tone='danger']").first();
  await expect(flagRefusal).toBeVisible();
  await expect(flagRefusal.locator("[data-catalog-blockers]")).toContainText("Au moins un courtier actif public");

  // Nothing changed: the country is still a pilot and the public exposure flag is still closed.
  await compliance.goto(`/catalog/countries/${countryId}`);
  await expect(card(compliance, "Synthèse")).toContainText("pilot");
  await expect(compliance.locator('form[data-catalog-flag-form="country_public_enabled"]').first().getByRole("button", { name: /^Activer :/u })).toBeVisible();
  await compliance.goto("/compliance/audit-logs");
  await expect(compliance.getByText(/country\.status_changed|catalog/u).first()).toBeVisible();
  await compliance.context().close();
});

test("SN-06 le visiteur voit le Sénégal pilote sans courtier ni offre : produits listés, état « aucune offre », aucun courtier", async ({ browser }) => {
  test.skip(!freshOpening, "re-run: SN already has a broker and an offer");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/SN");
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("Sénégal");
  // Spec 066 F5: the pilot notice no longer promises visible offers.
  await expect(visitor.getByText("Ce pays est en phase pilote : les offres comparables ne sont affichées qu'à l'ouverture publique du pays. En attendant, les courtiers partenaires et les produits activés sont présentés ci-dessous.")).toBeVisible();
  await expect(visitor.getByRole("link", { name: /Assurance auto/u }).first()).toBeVisible();
  await expect(visitor.getByRole("link", { name: /Assurance voyage/u }).first()).toBeVisible();
  await expect(visitor.getByText("Aucun courtier partenaire publié")).toBeVisible();

  await visitor.goto("/en/countries/SN");
  await expect(visitor.getByText("This country is in its pilot phase: comparable offers are only shown once the country opens publicly. In the meantime, the partner brokers and the products enabled are listed below.")).toBeVisible();

  for (const key of PRODUCTS) {
    await visitor.goto(`/pays/SN/produits/${key}`);
    await expect(visitor.getByRole("heading", { level: 1 })).toContainText("Sénégal");
    await visitor.goto(`/pays/SN/produits/${key}/offres`);
    await expect(visitor.getByText("Aucune offre indicative pour ces critères")).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Demander un devis" })).toHaveCount(0);
  }
  await visitor.context().close();
});

test("SN-07 un courtier sénégalais est créé (licence SN, couverture SN x Auto), activé, et son propriétaire active son compte", async ({ browser }) => {
  test.skip(!freshOpening, "re-run: SN already has a broker and an offer");
  test.setTimeout(15 * 60_000);
  const suffix = uniqueSuffix();
  const partnerName = `Courtage Teranga SN E2E ${suffix}`;
  const ownerEmail = `owner.sn.${suffix}@broker-sn.e2e.test`;

  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/partners");
  const partnerId = await onboardBrokerSenegal(admin, { legalName: partnerName, ownerEmail, licenseNumber: `SN-AGR-${suffix}` });
  await admin.context().close();

  const invitation = await waitForMail({ to: ownerEmail, subject: /activation|invitation/iu });
  const link = extractLink(invitation, /\/activate\?token=/u);
  expect(new URL(link).origin, "owner activation link opens the broker app").toBe(e2eEnv.brokerUrl);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  const password = e2ePassword("owner-sn");
  const totpSecret = await activateWithMfa(broker, link, password);
  await broker.context().close();
  const owner: BackOfficeAccount = { app: "broker", email: ownerEmail, password, totpSecret };
  snBroker = { partnerId, partnerName, owner };
  saveWorld("senegal", { partnerId, partnerName, plan: "starter", owner, members: {}, data: {} });
});

test("SN-08 le courtier sénégalais crée une offre SN x Auto, la conformité la valide et la publie", async ({ browser }) => {
  test.skip(!freshOpening || !snBroker, "re-run: SN already has a broker and an offer");
  test.setTimeout(10 * 60_000);
  snOffer = await publishOfferSenegal(browser, (snBroker as NonNullable<typeof snBroker>).owner, "Tiers");
  const world = { partnerId: (snBroker as NonNullable<typeof snBroker>).partnerId, partnerName: (snBroker as NonNullable<typeof snBroker>).partnerName, plan: "starter" as const, owner: (snBroker as NonNullable<typeof snBroker>).owner, members: {}, data: {}, ...snOffer };
  saveWorld("senegal", world);
});

test("SN-09 la conformité ouvre le Sénégal au public (checklist verte) : offre sénégalaise visible, formulaires de devis FR et EN avec consentement nommé", async ({ browser }) => {
  // Re-runnable: on a kept stack the broker and the offer come from the saved world (steps are idempotent).
  const saved = loadWorld("senegal");
  const partnerName = snBroker?.partnerName ?? saved?.partnerName;
  const offerTitle = snOffer?.offerTitle ?? saved?.offerTitle;
  test.skip(!partnerName || !offerTitle, "no Senegal broker and offer yet");
  if (!partnerName || !offerTitle) return;

  // With a public broker and a validated offer the compliance go/no-go is accepted (SC-01c for SN).
  // Offers are only public once the country is (country_public_enabled), so this precedes the visitor.
  const admin = await adminPage(browser);
  await openAs(admin, complianceAccount(), "/catalog/countries");
  const countryId = await openCountry(admin, "SN");
  await setCatalogFlag(admin, "country_public_enabled", true, REASON);
  await changeStatus(admin, "Statut du pays", "public", REASON);
  await admin.goto(`/catalog/countries/${countryId}`);
  await expect(card(admin, "Checklist d'activation du pays")).toContainText("Aucun contrôle bloquant");
  await expect(card(admin, "Synthèse")).toContainText("public");
  await admin.context().close();

  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/SN");
  // The country page lists products, not brokers: the responsible broker shows on the offers page.
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("Sénégal");
  await visitor.goto("/pays/SN/produits/auto/offres");
  const offer = visitor.getByRole("article", { name: offerTitle, exact: true });
  await expect(offer).toContainText("Courtier partenaire responsable");
  await expect(offer).toContainText(partnerName);
  await expect(offer).toContainText("F CFA");
  // Voyage has no SN offer: the explicit empty state stays.
  await visitor.goto("/pays/SN/produits/voyage/offres");
  await expect(visitor.getByText("Aucune offre indicative pour ces critères")).toBeVisible();

  // The quote form of the offer exists in French and in English, with the consent naming the broker.
  await visitor.goto("/pays/SN/produits/auto/offres");
  const quoteLink = visitor.locator("article, li, section").filter({ hasText: offerTitle }).getByRole("link", { name: "Demander un devis" }).first();
  const href = (await quoteLink.getAttribute("href")) ?? "";
  const offerId = new URL(href, e2eEnv.publicUrl).searchParams.get("offerId");
  expect(offerId, "the quote link carries the offer").toBeTruthy();
  const expectations = {
    fr: { path: `/pays/SN/produits/auto/devis?offerId=${offerId}`, label: "Usage du véhicule", consent: "En cochant cette case" },
    en: { path: `/en/countries/SN/products/auto/quote?offerId=${offerId}`, label: "Vehicle use", consent: "By checking this box" }
  } as const;
  for (const language of LANGUAGES) {
    const expected = expectations[language];
    await visitor.goto(expected.path);
    await expect(visitor.locator("label[for='am-answer-vehicle_use']")).toContainText(expected.label);
    await visitor.locator("#am-answer-vehicle_use").selectOption(language === "fr" ? "prive" : "private");
    await visitor.locator("#am-answer-city").fill("Dakar");
    await visitor.locator("#am-answer-contact_preference").selectOption("email");
    await visitor.getByRole("button", { name: language === "fr" ? "Continuer" : "Continue" }).click();
    await visitor.locator("#am-quote-first-name").fill("Awa");
    await visitor.locator("#am-quote-last-name").fill("Diallo");
    await visitor.locator("#am-quote-email").fill(`visiteur.sn.${uniqueSuffix()}@visitor.e2e.test`);
    await visitor.locator("#am-quote-phone").fill("+221771234567");
    await reviewQuote(visitor, language === "fr" ? "Vérifier ma demande" : "Review my request");
    // Nothing is sent: the journey stops on the review step, where the named consent is shown.
    await expect(visitor.locator("label[for='am-quote-consent'], #am-quote-consent >> xpath=..").first()).toContainText(partnerName);
    await expect(visitor.locator("label[for='am-quote-consent'], #am-quote-consent >> xpath=..").first()).toContainText(expected.consent);
  }
  await visitor.context().close();
});
