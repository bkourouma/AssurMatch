import { expect, type Browser, type Page } from "@playwright/test";
import { activateWithMfa, e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { loadJourneyState, requireState, saveWorld, type BrokerWorld } from "./journey-state";
import { extractLink, waitForMail } from "./mailpit";
import { onboardBrokerDirect } from "./partners";
import { card, confirmInDialog, expectActionSuccess, fillReason, idFromUrl, uniqueSuffix } from "./ui";

// Spec 065: building blocks shared by the Pro / Enterprise / forbidden-case journeys. They reuse the
// state left by scenario-core (Côte d'Ivoire open to the public with Auto, published quote forms,
// the Super Admin and the Compliance Admin) and create their own broker firms so no journey depends
// on the data of another one. Everything goes through the real screens (constitution III).

export const WORLD_REASON = "Parcours E2E spec 065";

export type BrokerPlan = "starter" | "pro" | "enterprise";

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function superAdminAccount(): BackOfficeAccount {
  return requireState(loadJourneyState(), "superAdmin");
}

export function complianceAccount(): BackOfficeAccount {
  return requireState(loadJourneyState(), "complianceAdmin");
}

/** A page in its own browser context for one app (constitution III: contexts are never shared). */
export async function appPage(browser: Browser, baseURL: string): Promise<Page> {
  return (await newAppContext(browser, baseURL)).newPage();
}

export interface ProvisionOptions {
  plan: BrokerPlan;
  /** Short label used in names and e-mail addresses (a-z, 0-9, -). */
  label: string;
  /** Days before the licence expires (default 365). */
  licenseValidDays?: number;
}

/**
 * The admin creates a broker with the given plan without an application (SC-02 alternative path),
 * takes it to "Actif public" and the owner activates the account from the invitation e-mail.
 * The owner role depends on the plan (Propriétaire Pro for Pro and Enterprise).
 */
export async function provisionBroker(browser: Browser, options: ProvisionOptions): Promise<BrokerWorld> {
  const suffix = uniqueSuffix();
  const partnerName = `Courtage ${options.label} E2E ${suffix}`;
  const ownerEmail = `owner.${options.label}.${suffix}@broker-${options.label}.e2e.test`;
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/partners");
  const partnerId = await onboardBrokerDirect(admin, {
    legalName: partnerName,
    ownerEmail,
    licenseNumber: `CI-AGR-${options.label.toUpperCase()}-${suffix}`,
    plan: options.plan,
    ...(options.licenseValidDays === undefined ? {} : { licenseValidDays: options.licenseValidDays })
  });
  await admin.context().close();

  const invitation = await waitForMail({ to: ownerEmail, subject: /activation|invitation/iu });
  const owner = await activateAccount(browser, "broker", ownerEmail, extractLink(invitation, /\/activate\?token=/u), `owner-${options.label}`);
  const world: BrokerWorld = { partnerId, partnerName, plan: options.plan, owner, members: {}, data: {} };
  return world;
}

/** Consumes an activation link (password + MFA enrolment) and returns the usable account. */
export async function activateAccount(browser: Browser, app: "admin" | "broker", email: string, link: string, label: string): Promise<BackOfficeAccount> {
  const page = await appPage(browser, app === "admin" ? e2eEnv.adminUrl : e2eEnv.brokerUrl);
  const password = e2ePassword(label);
  const totpSecret = await activateWithMfa(page, link, password);
  await page.context().close();
  return { app, email, password, totpSecret };
}

export const TEAM_ROLES = {
  manager: "broker_manager",
  agent: "broker_agent",
  readOnly: "broker_read_only"
} as const;

/** The owner (or a manager) invites a collaborator from /team; the invitee activates the account. */
export async function inviteMember(
  browser: Browser,
  owner: BackOfficeAccount,
  member: { key: keyof typeof TEAM_ROLES; displayName: string; emailDomain: string }
): Promise<BackOfficeAccount> {
  const email = `${member.key.toLowerCase()}.${uniqueSuffix()}@${member.emailDomain}`;
  const page = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(page, owner, "/team");
  const invite = card(page, "Inviter un collaborateur");
  await invite.getByLabel(/Nom affiché/u).fill(member.displayName);
  await invite.getByLabel(/E-mail professionnel/u).fill(email);
  await invite.getByLabel(/Rôle/u).selectOption(TEAM_ROLES[member.key]);
  await invite.getByRole("button", { name: "Inviter", exact: true }).click();
  await expectActionSuccess(invite, `invite ${member.key}`);
  await page.context().close();
  const mail = await waitForMail({ to: email });
  return activateAccount(browser, "broker", email, extractLink(mail, /\/activate\?token=/u), `${member.key}`);
}

/** The owner drafts a CI x Auto offer and submits it; the Compliance Admin validates and publishes it. */
export async function publishOffer(browser: Browser, world: BrokerWorld, label: string): Promise<{ offerId: string; offerTitle: string }> {
  const offerTitle = `Auto ${label} E2E ${uniqueSuffix()}`;
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, world.owner, "/offers/new");
  const form = broker.locator("form").filter({ has: broker.locator("select[name='scope']") });
  const scope = form.locator("select[name='scope']");
  const autoValue = await scope.locator("option", { hasText: "Côte d'Ivoire (CI) — Assurance auto" }).getAttribute("value");
  await scope.selectOption(autoValue ?? "");
  await form.locator("input[name='name']").fill(offerTitle);
  await form.locator("input[name='insurerName']").fill("Assureur Atlantique CI");
  await form.locator("textarea[name='shortDescription']").fill("Responsabilité civile, défense recours et assistance 24h/24.");
  await form.locator("textarea[name='guaranteeSummary']").fill("RC obligatoire, défense recours, assistance");
  await form.locator("select[name='guaranteeLevel']").selectOption("3");
  await expect(form.locator("input[name='guaranteeLabel']")).toHaveCount(1);
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
  await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
  await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();
  await broker.context().close();

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, complianceAccount(), `/offers/${offerId}`);
  await confirmInDialog(admin, admin.locator("[data-offer-decision='validate']"), "Valider et publier", (dialog) => fillReason(dialog, WORLD_REASON));
  await expect(admin.locator("[data-offer-decision='suspend']")).toBeVisible();
  await admin.context().close();
  return { offerId, offerTitle };
}

export interface VisitorQuote {
  reference: string;
  email: string;
  name: string;
  phone: string;
  trackingLink: string;
}

/**
 * A visitor asks for a quote on a given public offer of CI x Auto (SC-05 path), with the named
 * consent. Returns the QR- reference, the visitor's e-mail and the tracking link from the e-mail.
 */
export async function requestQuote(browser: Browser, offerTitle: string, partnerName: string, label: string): Promise<VisitorQuote> {
  const email = `visiteur.${label}.${uniqueSuffix()}@visitor.e2e.test`;
  const name = "Mariam Traoré";
  const phone = "+2250102030405";
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto("/pays/CI/produits/auto/offres");
  const offer = visitor.locator("article, li, section").filter({ hasText: offerTitle }).filter({ hasText: "Courtier partenaire responsable" }).first();
  await expect(offer).toContainText(partnerName);
  await offer.getByRole("link", { name: "Demander un devis" }).click();
  await visitor.waitForURL(/\/devis\?offerId=/u);
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill("Toyota");
  await visitor.locator("#am-answer-city").fill("Abidjan");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await visitor.locator("#am-quote-name").fill(name);
  await visitor.locator("#am-quote-email").fill(email);
  await visitor.locator("#am-quote-phone").fill(phone);
  await visitor.getByRole("button", { name: "Vérifier ma demande" }).click();
  await expect(visitor.locator("label[for='am-quote-consent'], #am-quote-consent >> xpath=..").first()).toContainText(partnerName);
  await visitor.locator("#am-quote-consent").check();
  await visitor.getByRole("button", { name: "Envoyer ma demande" }).click();
  const reference = visitor.getByText(/QR-[A-Z0-9-]+/u).first();
  await expect(reference).toBeVisible();
  const quoteReference = (await reference.innerText()).match(/QR-[A-Z0-9-]+/u)?.[0] as string;
  await visitor.context().close();

  const mail = await waitForMail({ to: email, body: new RegExp(quoteReference, "u") });
  const trackingLink = extractLink(mail, new RegExp(`/demandes-de-devis/${quoteReference}\\?token=`, "u"));
  return { reference: quoteReference, email, name, phone, trackingLink };
}

/** Opens the broker's lead list, finds the lead by its QR- reference and returns its assignment id. */
export async function findAssignmentId(page: Page, account: BackOfficeAccount, reference: string, listPath = "/leads"): Promise<string> {
  await openAs(page, account, listPath);
  await page.getByRole("row").filter({ hasText: reference }).getByRole("link").first().click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}/u);
  return idFromUrl(page);
}

export function persistWorld(key: string, world: BrokerWorld): BrokerWorld {
  saveWorld(key, world);
  return world;
}
