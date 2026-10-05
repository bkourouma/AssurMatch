import { expect, type Locator, type Page } from "@playwright/test";
import { card, confirmInDialog, expectActionSuccess, fillReason, idFromUrl, rowWith } from "./ui";

// Admin back-office screens used by the journeys (catalogue, consent texts, quote forms, flags).

/**
 * Toggles one catalogue flag form (`data-catalog-flag-form`), inside `scope` (a page, or the card
 * of one country x product link), and checks the server accepted it.
 */
export async function setCatalogFlag(scope: Page | Locator, key: string, enable: boolean, reason: string): Promise<void> {
  const form = scope.locator(`form[data-catalog-flag-form="${key}"]`).first();
  const button = form.getByRole("button", { name: new RegExp(`^(Activer|Désactiver) :`, "u") });
  const label = (await button.innerText()).trim();
  if (label.startsWith(enable ? "Désactiver" : "Activer")) return; // already in the wanted state
  await fillReason(form, reason);
  await button.click();
  await expectActionSuccess(form, `${enable ? "enable" : "disable"} ${key}`);
}

/** Global (non sensitive) feature flag on /feature-flags. */
export async function setGlobalFlag(page: Page, key: string, enable: boolean, reason: string): Promise<void> {
  await page.goto("/feature-flags");
  const row = rowWith(page, key);
  const button = row.getByRole("button", { name: enable ? "Activer" : "Desactiver", exact: true });
  if (!(await button.isVisible())) return;
  await fillReason(row, reason);
  await button.click();
  await expect(rowWith(page, key).getByRole("button", { name: enable ? "Desactiver" : "Activer", exact: true })).toBeVisible();
}

export async function openCountry(page: Page, isoCode: string): Promise<string> {
  await page.goto("/catalog/countries");
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: isoCode, exact: true }) }).getByRole("link").first().click();
  await page.waitForURL(/\/catalog\/countries\/[^/]+$/u);
  return idFromUrl(page);
}

export async function openProduct(page: Page, key: string): Promise<string> {
  await page.goto("/catalog/products");
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: key, exact: true }) }).getByRole("link").first().click();
  await page.waitForURL(/\/catalog\/products\/[^/]+$/u);
  return idFromUrl(page);
}

/** Status form of a country or product card ("Statut du pays" / "Statut du produit"). */
export async function changeStatus(page: Page, cardTitle: string, status: string, reason: string): Promise<void> {
  const statusCard = card(page, cardTitle);
  const select = statusCard.getByLabel("Nouveau statut");
  const offered = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  if (!offered.includes(status)) {
    // The current status is never offered: re-running a step finds it already applied.
    await expect(card(page, "Synthese")).toContainText(status);
    return;
  }
  await select.selectOption(status);
  await fillReason(statusCard, reason);
  await statusCard.getByRole("button", { name: "Changer le statut" }).click();
  await expectActionSuccess(statusCard, `${cardTitle} -> ${status}`);
}

/** Publishes the draft lead_transmission consent text of a country/language (seeded template). */
export async function publishConsentText(page: Page, isoCode: string, language: string, reason: string): Promise<string> {
  await page.goto("/consent-texts?purpose=lead_transmission");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: isoCode, exact: true }) })
    .filter({ has: page.getByRole("cell", { name: language, exact: true }) })
    .filter({ hasText: /draft|published/u })
    .first();
  await row.getByRole("link").first().click();
  await page.waitForURL(/\/consent-texts\/[^/?]+/u);
  const consentTextId = idFromUrl(page);
  if (await page.getByText("Texte publié : il est immuable").isVisible()) return consentTextId;
  await confirmInDialog(page, card(page, "Publier ce texte"), "Publier", (d) => fillReason(d, reason));
  await expect(page.getByText("Texte publié : il est immuable")).toBeVisible();
  return consentTextId;
}

export interface QuoteFormInput {
  countryId: string;
  productId: string;
  language: "fr" | "en";
  version: string;
  consentTextId: string;
  fields: string[];
}

/** Creates a quote form draft on /quote-form-definitions and publishes it (skipped when published). */
export async function createAndPublishQuoteForm(page: Page, input: QuoteFormInput, reason: string): Promise<void> {
  await page.goto("/quote-form-definitions");
  if (await rowWith(page, input.version, "published").isVisible()) return;
  const create = page.locator("form[data-quote-form='create']");
  await create.getByLabel("Pays (UUID)").fill(input.countryId);
  await create.getByLabel("Produit (UUID)").fill(input.productId);
  await create.getByLabel("Langue").fill(input.language);
  await create.getByLabel("Version").fill(input.version);
  await create.getByLabel("Texte de consentement publie (UUID)").fill(input.consentTextId);
  await create.getByLabel(/^Champs/).fill(input.fields.join("\n"));
  await fillReason(create, reason);
  await create.getByRole("button", { name: "Creer le brouillon" }).click();
  await expectActionSuccess(create, `create quote form ${input.version}`);
  // "Brouillon cree: <id>. ..." - the publish form lists drafts by id only.
  const created = (await create.locator(".bo-notice").first().innerText()).match(/Brouillon cree: ([0-9a-f-]{36})/)?.[1];
  if (!created) throw new Error("quote form id missing from the creation notice");

  await page.goto("/quote-form-definitions");
  const publish = page.locator("form[data-quote-form='publish']");
  await publish.getByLabel("Formulaire").selectOption(created);
  await fillReason(publish, reason);
  await publish.getByRole("button", { name: "Publier", exact: true }).click();
  await expectActionSuccess(publish, `publish quote form ${input.version}`);
}
