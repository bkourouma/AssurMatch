import { expect, test } from "@playwright/test";

test.skip(!process.env.ASSURMATCH_BROKER_E2E_BASE_URL, "Set ASSURMATCH_BROKER_E2E_BASE_URL to run real broker runtime smoke");

test("broker runtime smoke navigates Starter and CRM pages when server is provided", async ({ page }) => {
  await page.goto(`${process.env.ASSURMATCH_BROKER_E2E_BASE_URL}/leads`);
  await expect(page.getByRole("heading", { name: "Leads assignes" })).toBeVisible();
  await page.goto(`${process.env.ASSURMATCH_BROKER_E2E_BASE_URL}/crm/leads`);
  await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
});
