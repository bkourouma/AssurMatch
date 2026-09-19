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
    await expect(page.getByRole("heading", { name: "Comparez les offres d'assurance de votre pays" })).toBeVisible();

    // The public site moved every page under `[locale]` and localised its routes: French is
    // unprefixed and uses the French route words (spec 045).
    await page.goto(`${publicUrl}/pays/CI/produits/auto/devis`);
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

  test("home page shows the country and product selector", async ({ page }) => {
    await page.goto(publicUrl);
    await expect(page.locator("#am-entry-country")).toBeVisible();
    await expect(page.locator("#am-entry-product")).toBeVisible();
  });

  test("/pays lists the open country and the waiting-list country", async ({ page }) => {
    await page.goto(`${publicUrl}/pays`);
    // The demo seed (scripts/local-app/seed-broker-demo.ts) opens Côte d'Ivoire and puts Sénégal on
    // the waiting list. Scoped to the main content: the header and footer also link to these
    // countries, which would otherwise make the locator ambiguous.
    const main = page.locator("#contenu");
    await expect(main.getByRole("link", { name: "Côte d'Ivoire" }).first()).toBeVisible();
    await expect(main.getByRole("link", { name: "Sénégal" }).first()).toBeVisible();
    await expect(main.getByText("Ouvert", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Bientôt", { exact: true }).first()).toBeVisible();
  });

  test("/comment-ca-marche renders", async ({ page }) => {
    await page.goto(`${publicUrl}/comment-ca-marche`);
    await expect(page.getByRole("heading", { name: "Comment ça marche" }).first()).toBeVisible();
  });

  test("a wrong URL renders the branded 404", async ({ page }) => {
    await page.goto(`${publicUrl}/cette-page-n-existe-pas`);
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  });

  test("/en renders in English with lang=\"en\"", async ({ page }) => {
    await page.goto(`${publicUrl}/en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Compare insurance offers in your country" })).toBeVisible();
  });

  test("at a 375 pixel viewport the header still shows the comparison call to action", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(publicUrl);
    await expect(page.locator(".am-header__cta")).toBeVisible();
  });
});
