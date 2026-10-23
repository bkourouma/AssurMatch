import { expect, type Browser, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { pdfFile } from "./files";
import { authorizeScope, reviewDocument, submitStatusTransition, uploadPartnerDocument } from "./partners";
import { card, confirmInDialog, expectActionSuccess, fillReason, idFromUrl, uniqueSuffix } from "./ui";
import { WORLD_REASON, addDays, appPage, complianceAccount, isoDate } from "./world";

// Spec 065, Senegal opening: the Senegal variants of the Cote d'Ivoire building blocks that are
// hardcoded to CI in partners.ts and world.ts (country option, licence authority, offer scope).

const SN_REASON = "Ouverture du Sénégal E2E spec 065";

export interface SenegalBrokerInput {
  legalName: string;
  ownerEmail: string;
  licenseNumber: string;
}

/**
 * The admin creates a Senegal broker without an application and takes it to "Actif public"
 * (licence + accepted proof, SN x Auto coverage, contract, owner invitation). Starts on /partners
 * and returns the new partner id.
 */
export async function onboardBrokerSenegal(page: Page, input: SenegalBrokerInput): Promise<string> {
  const create = card(page, "Créer un courtier");
  await create.locator("input[name='legalName']").fill(input.legalName);
  const country = create.locator("select[name='countryId']");
  const sn = await country.locator("option", { hasText: "(SN)" }).first().getAttribute("value");
  expect(sn, "Senegal is offered by the broker creation form").toBeTruthy();
  await country.selectOption(sn ?? "");
  await create.locator("input[name='primaryEmail']").fill(input.ownerEmail);
  await create.locator("input[name='primaryWhatsApp']").fill("+221771234567");
  await fillReason(create, SN_REASON);
  await create.getByRole("button", { name: "Créer le courtier" }).click();
  await page.waitForURL(/\/partners\/[0-9a-f-]{36}/u);
  const partnerId = new URL(page.url()).pathname.split("/").pop() as string;

  const license = card(page, "Enregistrer une licence");
  await license.locator("input[name='licenseNumber']").fill(input.licenseNumber);
  await license.locator("input[name='issuingAuthority']").fill("Direction des Assurances SN");
  await license.locator("select[name='countryId']").selectOption(sn ?? "");
  const today = new Date();
  await license.locator("input[name='effectiveDate']").fill(isoDate(today));
  await license.locator("input[name='expirationDate']").fill(isoDate(addDays(today, 365)));
  await fillReason(license, SN_REASON);
  await license.getByRole("button", { name: "Enregistrer la licence" }).click();
  await expectActionSuccess(license, "create SN licence");
  await page.reload();

  await uploadPartnerDocument(page, "license", pdfFile("agrement-sn.pdf", `Agrement ${input.licenseNumber}`), input.licenseNumber);
  await reviewDocument(page, "agrement-sn.pdf", "Accepter");
  await confirmInDialog(page, card(page, `Licence ${input.licenseNumber}`), "Valider", (dialog) => fillReason(dialog, SN_REASON));
  await expect(card(page, `Licence ${input.licenseNumber}`)).toContainText("Valide");
  await authorizeScope(page, "Pays autorisés", "Sénégal (SN)");
  await authorizeScope(page, "Produits autorisés", /Assurance auto/u);

  await uploadPartnerDocument(page, "partnership_contract", pdfFile("contrat-sn.pdf", "Contrat SN"));
  await reviewDocument(page, "contrat-sn.pdf", "Accepter");
  const contract = card(page, "Contrat de partenariat");
  await contract.getByLabel("Version").fill("v1");
  await contract.getByLabel("Date de signature").fill(isoDate(today));
  await contract.getByLabel("Signataire pour le courtier").fill("Moussa Diop");
  await contract.getByLabel("Document du contrat signé").selectOption({ index: 1 });
  await fillReason(contract, SN_REASON);
  await contract.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expectActionSuccess(contract, "record SN contract");

  const users = card(page, "Utilisateurs du courtier");
  await users.getByLabel("E-mail").fill(input.ownerEmail);
  await users.getByLabel("Nom affiché").fill("Moussa Diop");
  await fillReason(users, SN_REASON);
  await users.getByRole("button", { name: /Inviter et émettre/u }).click();
  await expectActionSuccess(users, "invite SN owner");

  await page.goto(`/partners/${partnerId}`);
  await submitStatusTransition(page, "Envoyer en vérification", "En vérification");
  await submitStatusTransition(page, "Passer en Actif public", "Actif public");
  return partnerId;
}

/**
 * The Senegal broker drafts an SN x Auto offer and submits it; the Compliance Admin validates and
 * publishes it. `owner` is the activated broker owner account.
 */
export async function publishOfferSenegal(
  browser: Browser,
  owner: BackOfficeAccount,
  label: string
): Promise<{ offerId: string; offerTitle: string }> {
  const offerTitle = `Auto ${label} SN E2E ${uniqueSuffix()}`;
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openAs(broker, owner, "/offers/new");
  const form = broker.locator("form").filter({ has: broker.locator("select[name='scope']") });
  const scope = form.locator("select[name='scope']");
  const autoValue = await scope.locator("option", { hasText: "Sénégal (SN) — Assurance auto" }).getAttribute("value");
  expect(autoValue, "the broker is offered the SN x Auto scope").toBeTruthy();
  await scope.selectOption(autoValue ?? "");
  await form.locator("input[name='name']").fill(offerTitle);
  await form.locator("input[name='insurerName']").fill("Assureur Teranga SN");
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
