import { expect, test } from "@playwright/test";

const enabled = process.env.ASSURMATCH_LOCAL_BROWSER_SMOKE === "true";
const apiUrl = process.env.ASSURMATCH_LOCAL_API_URL ?? "http://127.0.0.1:3600";
const publicUrl = process.env.ASSURMATCH_LOCAL_PUBLIC_URL ?? "http://127.0.0.1:3601";
const adminUrl = process.env.ASSURMATCH_LOCAL_ADMIN_URL ?? "http://127.0.0.1:3602";
const brokerUrl = process.env.ASSURMATCH_LOCAL_BROKER_URL ?? "http://127.0.0.1:3603";
const mailpitUrl = process.env.ASSURMATCH_LOCAL_MAILPIT_URL ?? "http://127.0.0.1:8025";

test.describe("local app launcher browser smoke", () => {
  test.skip(!enabled, "Run npm run test:web:local after launch-local.bat to validate live local URLs");

  test("public app and quote form render", async ({ page }) => {
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { name: "AssurMatch" })).toBeVisible();

    await page.goto(`${publicUrl}/countries/CI/products/auto/quote`);
    await expect(page.getByRole("heading", { name: "Demander un devis" })).toBeVisible();
  });

  test("back-office logins render and protected routes redirect", async ({ page }) => {
    await page.goto(adminUrl);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Connexion admin" })).toBeVisible();

    await page.goto(brokerUrl);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  });

  test("Mailpit and API are reachable", async ({ page, request }) => {
    const apiResponse = await request.get(`${apiUrl}/countries`);
    expect(apiResponse.status()).toBe(200);

    await page.goto(mailpitUrl);
    await expect(page.locator("body")).toContainText("Mailpit");
  });
});
