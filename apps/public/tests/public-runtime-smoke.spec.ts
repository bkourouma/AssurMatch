import { expect, test } from "@playwright/test";
import { publicAppSourceFiles, readSources } from "./helpers/public-sources";

test.describe("public runtime browser smoke", () => {
  const baseUrl = process.env.ASSURMATCH_E2E_PUBLIC_URL ?? process.env.ASSURMATCH_E2E_BASE_URL;
  test.skip(!baseUrl, "Set ASSURMATCH_E2E_PUBLIC_URL to run real public runtime smoke");

  test("public runtime smoke navigates the French countries directory when server is provided", async ({ page }) => {
    await page.goto(`${baseUrl}/pays`);
    await expect(page.getByRole("heading", { name: "Pays couverts par AssurMatch" })).toBeVisible();
    await expect(page.getByText(/Aucun pays public actif|Pays ouverts|Liste des pays indisponible/)).toBeVisible();
  });
});

test("public app does not import back-office auth session or protected clients", async () => {
  const joinedSource = readSources(publicAppSourceFiles());

  expect(joinedSource).not.toContain("backoffice-auth");
  expect(joinedSource).not.toContain("backoffice-session-actions");
  expect(joinedSource).not.toContain("broker-api");
  expect(joinedSource).not.toContain("admin-api");
  expect(joinedSource).not.toContain("/broker/");
  expect(joinedSource).not.toContain("/admin/");
  expect(joinedSource).not.toContain("/auth/me");
});
