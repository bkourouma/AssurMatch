import { expect, type Locator, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./backoffice";
import { reviewQuote } from "./quote-form";

// Spec 065: helpers of the forbidden-cases-pro journeys (licence expiry, consent withdrawal).

/**
 * Opens the admin alerts centre (all statuses) and counts the licence alerts that name `expiresOn`.
 * The scheduled job writes `expiresOn: YYYY-MM-DD` in the details of every `license_expiring` alert.
 */
export async function licenceAlertCount(page: Page, account: BackOfficeAccount, expiresOn: string): Promise<number> {
  await openAs(page, account, "/dashboard/compliance-alerts?alertStatus=all");
  await expect(page.locator("[data-alerts-center]")).toBeVisible();
  return page.getByRole("row").filter({ hasText: `expiresOn: ${expiresOn}` }).count();
}

/**
 * Compliance consent-proof search by request reference (/compliance/consent-records); returns the
 * row of the lead transmission consent, the one the visitor withdraws.
 */
export async function leadConsentProofRow(page: Page, account: BackOfficeAccount, reference: string): Promise<Locator> {
  await openAs(page, account, "/compliance/consent-records");
  await page.locator("#cr-reference").fill(reference);
  await page.getByRole("button", { name: "Rechercher les preuves" }).click();
  const row = page.getByRole("row").filter({ hasText: "Transmission au courtier" }).first();
  await expect(row).toBeVisible();
  return row;
}

/**
 * Fills the quote form of an offer up to the review step (where the consent box is) without
 * sending it: used to read the consent wording, never to create a lead.
 */
export async function openQuoteReview(visitor: Page, offerId: string): Promise<Locator> {
  await visitor.goto(`/pays/CI/produits/auto/devis?offerId=${offerId}`);
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill("Toyota");
  await visitor.locator("#am-answer-city").fill("Abidjan");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await visitor.locator("#am-quote-first-name").fill("Mariam");
  await visitor.locator("#am-quote-last-name").fill("Traoré");
  await visitor.locator("#am-quote-email").fill(`relecture.${Date.now().toString(36)}@visitor.e2e.test`);
  await visitor.locator("#am-quote-phone").fill("+2250102030405");
  await reviewQuote(visitor);
  const consent = visitor.locator("label[for='am-quote-consent'], #am-quote-consent >> xpath=..").first();
  await expect(consent).toBeVisible();
  return consent;
}
