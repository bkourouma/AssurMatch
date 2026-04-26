import { expect, test } from "@playwright/test";

test.skip(!process.env.ASSURMATCH_E2E_BASE_URL, "Set ASSURMATCH_E2E_BASE_URL to run real public runtime smoke");

test("public runtime smoke navigates public catalog when server is provided", async ({ page }) => {
  await page.goto(`${process.env.ASSURMATCH_E2E_BASE_URL}/catalog`);
  await expect(page.getByRole("heading", { name: "Catalogue indicatif" })).toBeVisible();
  await expect(page.getByText(/Aucun pays public actif|pays public actif|Catalogue public temporairement indisponible/)).toBeVisible();
});
