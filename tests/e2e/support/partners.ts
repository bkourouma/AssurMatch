import { expect, type Page } from "@playwright/test";
import { card, confirmInDialog, expectActionSuccess, fillReason } from "./ui";

// Admin partner (broker) record screens: documents, scopes, status transitions (spec 051).

const REASON = "Onboarding courtier E2E spec 059";

export async function uploadPartnerDocument(
  page: Page,
  documentType: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  licenseNumber?: string
): Promise<void> {
  const upload = card(page, "Téléverser un document");
  await upload.getByLabel("Fichier").setInputFiles(file);
  await upload.getByLabel("Type de document").selectOption(documentType);
  if (licenseNumber) {
    const select = upload.getByLabel("Licence rattachée");
    const value = await select.locator("option", { hasText: licenseNumber }).first().getAttribute("value");
    await select.selectOption(value ?? "");
  }
  await fillReason(upload, REASON);
  await upload.getByRole("button", { name: "Téléverser" }).click();
  await expectActionSuccess(upload, `upload ${documentType}`);
  // The upload form refreshes the page data (router.refresh) once the file is stored.
  await expect(documentRow(page, file.name)).toBeVisible();
}

export function documentRow(page: Page, fileName: string) {
  return card(page, "Documents d'agrément").getByRole("row").filter({ hasText: fileName }).first();
}

/** Accepts (or refuses) the document uploaded under `fileName`. */
export async function reviewDocument(page: Page, fileName: string, decision: "Accepter" | "Refuser"): Promise<void> {
  await confirmInDialog(page, documentRow(page, fileName), decision, (dialog) => fillReason(dialog, REASON));
  await expect(documentRow(page, fileName)).toContainText(decision === "Accepter" ? /Accepté/u : /Refusé/u);
}

/** Authorises a country or a product ("Pays autorisés" / "Produits autorisés" cards). */
export async function authorizeScope(page: Page, cardTitle: "Pays autorisés" | "Produits autorisés", optionLabel: string | RegExp): Promise<void> {
  const scopeCard = card(page, cardTitle);
  const select = scopeCard.locator("select[name='scopeId']");
  const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: (node as HTMLOptionElement).value, label: node.textContent ?? "" })));
  const match = options.find((option) => (typeof optionLabel === "string" ? option.label.includes(optionLabel) : optionLabel.test(option.label)));
  if (!match) {
    // Already authorised: the option is no longer offered.
    await expect(scopeCard).toContainText(typeof optionLabel === "string" ? optionLabel : optionLabel);
    return;
  }
  await select.selectOption(match.value);
  await fillReason(scopeCard, REASON);
  await scopeCard.getByRole("button", { name: /^Autoriser ce/u }).click();
  await expectActionSuccess(scopeCard, `authorize ${match.label}`);
}

/**
 * One status transition of the "Statut" card (dialog for suspension / termination). On success the
 * card is re-rendered with the transitions of the new status, so the outcome is read from the
 * "Statut actuel" line; a refusal leaves a danger notice whose text fails the step.
 */
export async function submitStatusTransition(page: Page, label: string, expectedStatus: string, sensitive = false): Promise<void> {
  const statusCard = card(page, "Statut");
  if (sensitive) {
    await confirmInDialog(page, statusCard, label, (dialog) => fillReason(dialog, REASON));
  } else {
    const form = statusCard.locator("form").filter({ has: page.getByRole("button", { name: label }) }).first();
    await fillReason(form, REASON);
    await form.getByRole("button", { name: label }).click();
  }
  await expect
    .poll(async () => {
      const danger = statusCard.locator(".bo-notice[data-tone='danger']");
      if (await danger.count()) return `refused: ${(await danger.first().innerText()).replace(/\s+/gu, " ")}`;
      return (await statusCard.innerText()).includes(`Statut actuel : ${expectedStatus}`) ? "done" : "pending";
    }, { timeout: 30_000, message: `partner status: ${label}` })
    .toBe("done");
}
