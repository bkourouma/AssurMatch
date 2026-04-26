import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

test.describe("public runtime browser smoke", () => {
  test.skip(!process.env.ASSURMATCH_E2E_BASE_URL, "Set ASSURMATCH_E2E_BASE_URL to run real public runtime smoke");

  test("public runtime smoke navigates public catalog when server is provided", async ({ page }) => {
    await page.goto(`${process.env.ASSURMATCH_E2E_BASE_URL}/catalog`);
    await expect(page.getByRole("heading", { name: "Catalogue indicatif" })).toBeVisible();
    await expect(page.getByText(/Aucun pays public actif|pays public actif|Catalogue public temporairement indisponible/)).toBeVisible();
  });
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test("public app does not import back-office auth session or protected clients", async () => {
  const publicSources = filesUnder("apps/public/app").filter((path) => /\.(ts|tsx)$/.test(path));
  const joinedSource = publicSources.map((path) => readFileSync(path, "utf8")).join("\n");

  expect(joinedSource).not.toContain("backoffice-auth");
  expect(joinedSource).not.toContain("backoffice-session-actions");
  expect(joinedSource).not.toContain("broker-api");
  expect(joinedSource).not.toContain("admin-api");
  expect(joinedSource).not.toContain("/broker/");
  expect(joinedSource).not.toContain("/admin/");
  expect(joinedSource).not.toContain("/auth/me");
});
