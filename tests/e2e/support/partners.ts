import { expect, type Page } from "@playwright/test";
import { pdfFile } from "./files";
import { card, confirmInDialog, expectActionSuccess, fillReason } from "./ui";

// Admin partner (broker) record screens: documents, scopes, status transitions (spec 051).

const REASON = "Onboarding courtier E2E spec 059";

export async function uploadPartnerDocument(
  page: Page,
  documentType: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  licenseNumber?: string,
  options: { infected?: boolean } = {}
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
  if (options.infected) {
    // An infected file is stored in quarantine; the upload may report it as a refusal.
    await expect(upload.locator(".bo-notice[data-tone='success'], .bo-notice[data-tone='danger']").first()).toBeVisible();
    await page.reload();
  } else {
    await expectActionSuccess(upload, `upload ${documentType}`);
  }
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

export interface DirectBrokerInput {
  legalName: string;
  ownerEmail: string;
  licenseNumber: string;
}

/**
 * SC-02 alternative path: the admin creates a broker without an application and takes it to
 * "Actif public" (licence + accepted proof, CI x Auto coverage, contract, owner invitation).
 * Starts on /partners; returns the new partner id.
 */
export async function onboardBrokerDirect(page: Page, input: DirectBrokerInput): Promise<string> {
  const create = card(page, "Créer un courtier");
  await create.locator("input[name='legalName']").fill(input.legalName);
  const country = create.locator("select[name='countryId']");
  const ci = await country.locator("option", { hasText: "(CI)" }).first().getAttribute("value");
  await country.selectOption(ci ?? "");
  await create.locator("input[name='primaryEmail']").fill(input.ownerEmail);
  await create.locator("input[name='primaryWhatsApp']").fill("+2250709080706");
  await fillReason(create, REASON);
  await create.getByRole("button", { name: "Créer le courtier" }).click();
  await page.waitForURL(/\/partners\/[0-9a-f-]{36}/u);
  const partnerId = new URL(page.url()).pathname.split("/").pop() as string;

  const license = card(page, "Enregistrer une licence");
  await license.locator("input[name='licenseNumber']").fill(input.licenseNumber);
  await license.locator("input[name='issuingAuthority']").fill("Direction des Assurances CI");
  await license.locator("select[name='countryId']").selectOption(ci ?? "");
  const today = new Date();
  await license.locator("input[name='effectiveDate']").fill(today.toISOString().slice(0, 10));
  await license.locator("input[name='expirationDate']").fill(new Date(today.getTime() + 365 * 86_400_000).toISOString().slice(0, 10));
  await fillReason(license, REASON);
  await license.getByRole("button", { name: "Enregistrer la licence" }).click();
  await expectActionSuccess(license, "create licence");
  await page.reload();

  await uploadPartnerDocument(page, "license", pdfFile("agrement-y.pdf", `Agrement ${input.licenseNumber}`), input.licenseNumber);
  await reviewDocument(page, "agrement-y.pdf", "Accepter");
  await confirmInDialog(page, card(page, `Licence ${input.licenseNumber}`), "Valider", (dialog) => fillReason(dialog, REASON));
  await expect(card(page, `Licence ${input.licenseNumber}`)).toContainText("Valide");
  await authorizeScope(page, "Pays autorisés", "Côte d'Ivoire (CI)");
  await authorizeScope(page, "Produits autorisés", /Assurance auto/u);

  await uploadPartnerDocument(page, "partnership_contract", pdfFile("contrat-y.pdf", "Contrat Y"));
  await reviewDocument(page, "contrat-y.pdf", "Accepter");
  const contract = card(page, "Contrat de partenariat");
  await contract.getByLabel("Version").fill("v1");
  await contract.getByLabel("Date de signature").fill(today.toISOString().slice(0, 10));
  await contract.getByLabel("Signataire pour le courtier").fill("Henri Bédié");
  await contract.getByLabel("Document du contrat signé").selectOption({ index: 1 });
  await fillReason(contract, REASON);
  await contract.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expectActionSuccess(contract, "record contract");

  const users = card(page, "Utilisateurs du courtier");
  await users.getByLabel("E-mail").fill(input.ownerEmail);
  await users.getByLabel("Nom affiché").fill("Henri Bédié");
  await fillReason(users, REASON);
  await users.getByRole("button", { name: /Inviter et émettre/u }).click();
  await expectActionSuccess(users, "invite owner");

  await page.goto(`/partners/${partnerId}`);
  await submitStatusTransition(page, "Envoyer en vérification", "En vérification");
  await submitStatusTransition(page, "Passer en Actif public", "Actif public");
  return partnerId;
}
