import { expect, type Page } from "@playwright/test";
import { verifyTotp } from "./backoffice";

/**
 * Same steps as `activateWithMfa` (backoffice.ts) but also returns the backup codes printed once on the
 * enrolment screen (the existing helper throws them away). Works on the admin and the broker app.
 */
export async function activateAccountWithCodes(page: Page, activationLink: string, password: string): Promise<{ totpSecret: string; backupCodes: string[] }> {
  await page.goto(activationLink);
  await expect(page.locator("#activate-token")).not.toHaveValue("");
  await page.locator("#activate-password").fill(password);
  await page.getByRole("button", { name: /Activer/u }).click();
  await page.waitForURL(/\/mfa/u);
  await page.getByRole("button", { name: /G[ée]n[ée]rer secret/u }).click();
  const secretLine = page.getByText(/Secret TOTP/u);
  await expect(secretLine).toBeVisible();
  const totpSecret = (await secretLine.locator("code").textContent())?.trim() ?? "";
  expect(totpSecret, "TOTP secret shown at enrolment").toMatch(/^[A-Z2-7]{16,}$/u);
  const backupCodes = (await page.locator(".bo-notice ul.bo-list li code").allTextContents()).map((code) => code.trim()).filter(Boolean);
  expect(backupCodes.length, "8 backup codes shown at enrolment").toBe(8);
  await verifyTotp(page, totpSecret);
  return { totpSecret, backupCodes };
}
