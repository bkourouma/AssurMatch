import { expect, type Locator, type Page } from "@playwright/test";
import { card } from "./ui";

// UI helpers of the onboarding edge spec: attempts whose OUTCOME is a refusal (the shared helpers of ui.ts throw
// on a refusal, which is what these cases want to read instead).

export function clean(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Text of the first result notice (success or danger) of a scope, once one is displayed. */
export async function resultNotice(scope: Locator, timeout = 30_000): Promise<{ tone: string; text: string }> {
  const notice = scope.locator(".bo-notice[data-tone='success'], .bo-notice[data-tone='danger']").first();
  await expect(notice, "a result notice is displayed").toBeVisible({ timeout });
  return { tone: (await notice.getAttribute("data-tone")) ?? "", text: clean(await notice.innerText()) };
}

/** Opens a ConfirmDialog from `scope`, fills it, confirms and returns what the dialog says (refusal text) or "closed". */
export async function dialogAttempt(
  page: Page,
  scope: Locator,
  triggerLabel: string | RegExp,
  fill: (dialog: Locator) => Promise<void>,
  confirmLabel?: string | RegExp
): Promise<string> {
  await scope.getByRole("button", { name: triggerLabel }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await fill(dialog);
  await dialog.getByRole("button", { name: confirmLabel ?? triggerLabel }).last().click();
  let outcome = "pending";
  await expect
    .poll(async () => {
      if ((await dialog.count()) === 0) return (outcome = "closed");
      const danger = dialog.locator(".bo-notice[data-tone='danger']");
      if (await danger.count()) return (outcome = clean(await danger.first().innerText()));
      if (await dialog.locator(".bo-notice[data-tone='success']").count()) return (outcome = "closed");
      return (outcome = "pending");
    }, { timeout: 30_000, message: "dialog outcome" })
    .not.toBe("pending");
  if ((await page.locator("dialog[open]").count()) > 0 && outcome !== "closed") {
    await page.locator("dialog[open]").getByRole("button", { name: /Annuler|Fermer/u }).first().click().catch(() => undefined);
  }
  return outcome;
}

/** Fills the "Motif" field of a form or dialog. */
export async function reasonIn(scope: Locator, reason: string): Promise<void> {
  await scope.getByLabel(/Motif \(audit/u).filter({ visible: true }).first().fill(reason);
}

/** Submits a plain (non dialog) status transition and returns the refusal text, or "done". */
export async function statusAttempt(page: Page, label: string, reason: string): Promise<{ outcome: string; list: string[]; links: number }> {
  const statusCard = card(page, "Statut");
  const form = statusCard.locator("form").filter({ has: page.getByRole("button", { name: label }) }).first();
  await reasonIn(form, reason);
  await form.getByRole("button", { name: label }).click();
  const notice = form.locator(".bo-notice[data-tone='success'], .bo-notice[data-tone='danger']").first();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  const tone = await notice.getAttribute("data-tone");
  const items = await notice.locator("li").allInnerTexts();
  return { outcome: tone === "success" ? "done" : clean(await notice.locator("p").first().innerText()), list: items.map(clean), links: await notice.locator("li a", { hasText: "Corriger" }).count() };
}
