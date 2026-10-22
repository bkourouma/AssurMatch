import { expect, test } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { adminToken, adminWithRole, api, expectStatus, openPage, rec } from "./support/admin-lot11";
import { closeSessions } from "./support/pro-roles";
import { uniqueSuffix } from "./support/ui";
import { superAdminAccount } from "./support/world";

// Lot 11c, journey "CMS Content Admin" (lot 9, spec 072). A content_admin writes a FAQ entry as a
// draft and submits it; the same actor cannot approve it (four eyes); a second actor (the Super Admin)
// approves it; only then does the French public site show it. A draft or a pending entry is never
// public, markup ("<") is refused, and a role without content rights (support_admin) gets a 403.
//
// The content_admin works through the real /content screens; the API probes only cover the refusals
// the screens never offer (self-approval, role, markup) and the public projection.

test.describe.configure({ mode: "serial" });

const suffix = uniqueSuffix();
const ENTRY_KEY = `e2e-cms-${suffix}`;
const QUESTION = `Comment lire une offre de test E2E ${suffix} ?`;
const ANSWER = `Cette reponse de test explique comment lire une offre proposee par un courtier partenaire, sans engagement. Reference ${suffix}.`;

let superAdmin: BackOfficeAccount;
let contentAdmin: BackOfficeAccount;
let support: BackOfficeAccount;
let entryId = "";

test.afterAll(async () => {
  await closeSessions();
});

async function publicContent(locale: "fr" | "en") {
  const response = await api(undefined, "GET", `/public-content?locale=${locale}`);
  expectStatus(response, 200, `GET /public-content ${locale}`);
  return response;
}

function faqQuestions(body: unknown): string[] {
  const faq = rec(body).faq;
  return Array.isArray(faq) ? faq.map((item) => String(rec(item).question)) : [];
}

test("CMS-00 les comptes content_admin et support_admin sont invités et activés par le Super Admin", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  superAdmin = superAdminAccount();
  contentAdmin = await adminWithRole(browser, superAdmin, "content_admin", "content");
  support = await adminWithRole(browser, superAdmin, "support_admin", "support");
  expect(contentAdmin.email).not.toBe(support.email);
});

test("CMS-01 le content_admin crée un brouillon de FAQ et le soumet à validation", async ({ browser }) => {
  const page = await openPage(browser, contentAdmin, "/content/new");
  const form = page.locator("form[data-content-form='create']");
  await form.locator("select[name='locale']").selectOption("fr");
  await form.locator("input[name='entryKey']").fill(ENTRY_KEY);
  await form.locator("input[name='faq_question']").fill(QUESTION);
  await form.locator("textarea[name='faq_answer']").fill(ANSWER);
  await form.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(/\/content\/[0-9a-f-]{36}/u);
  entryId = new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
  expect(entryId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(page.getByText("Brouillon créé.")).toBeVisible();

  // A draft is invisible to visitors, in the API projection and on the French FAQ page.
  expect(faqQuestions((await publicContent("fr")).body)).not.toContain(QUESTION);

  const workflow = page.locator("form[data-content-workflow='submit']");
  await workflow.getByRole("button", { name: "Soumettre" }).click();
  await expect(workflow.getByText("Contenu soumis à validation")).toBeVisible();

  const token = await adminToken(browser, contentAdmin);
  const detail = await api(token, "GET", `/admin/content/entries/${entryId}`);
  expectStatus(detail, 200, "GET entry");
  expect(rec(detail.body).status).toBe("pending_review");
  expect(rec(detail.body).submittedById, "submitter recorded").toBeTruthy();
});

test("CMS-02 un contenu en attente n'est pas public et le même acteur ne peut pas l'approuver (4 yeux)", async ({ browser }) => {
  expect(faqQuestions((await publicContent("fr")).body), "pending entry must not be public").not.toContain(QUESTION);

  // The screen does not even offer the approval to the submitter.
  const page = await openPage(browser, contentAdmin, `/content/${entryId}`);
  await expect(page.locator("form[data-content-workflow='approve']")).toHaveCount(0);
  await expect(page.getByText(/second acteur|autre acteur|ne peut pas/iu).first()).toBeVisible();

  // A forged request is refused by the API.
  const token = await adminToken(browser, contentAdmin);
  const selfApproval = await api(token, "POST", `/admin/content/entries/${entryId}/approve`, {});
  expectStatus(selfApproval, 403, "self approval");
  const after = await api(token, "GET", `/admin/content/entries/${entryId}`);
  expect(rec(after.body).status, "still pending after the refused self approval").toBe("pending_review");
  expect(faqQuestions((await publicContent("fr")).body)).not.toContain(QUESTION);
});

test("CMS-03 un second acteur approuve : le contenu est publié et apparaît sur le site public en français", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const page = await openPage(browser, superAdmin, `/content/${entryId}`);
  const approve = page.locator("form[data-content-workflow='approve']");
  await expect(approve).toBeVisible();
  await approve.locator("textarea[name='note']").fill("Relu par un second acteur, parcours E2E");
  await approve.getByRole("button", { name: "Approuver" }).click();
  await expect(approve.getByText("Contenu approuvé et publié")).toBeVisible();

  const token = await adminToken(browser, superAdmin);
  const detail = await api(token, "GET", `/admin/content/entries/${entryId}`);
  expect(rec(detail.body).status).toBe("published");
  expect(rec(detail.body).decidedById, "approver differs from submitter").not.toBe(rec(detail.body).submittedById);

  // API projection: French only, no cross-language fallback, no person identifier.
  const fr = await publicContent("fr");
  expect(faqQuestions(fr.body)).toContain(QUESTION);
  expect(fr.text).not.toContain(String(rec(detail.body).submittedById));
  expect(faqQuestions((await publicContent("en")).body), "French entry must not appear in English").not.toContain(QUESTION);

  // The public site revalidates every 60 s: poll the French FAQ page until the new question shows.
  await expect
    .poll(async () => {
      const response = await fetch(`${e2eEnv.publicUrl}/fr/faq`, { headers: { "Cache-Control": "no-cache" } });
      return response.ok ? (await response.text()).includes(suffix) : `HTTP ${response.status}`;
    }, { timeout: 5 * 60_000, intervals: [5_000, 10_000], message: "published FAQ entry on /fr/faq" })
    .toBe(true);
  const publicPage = await (await browser.newContext({ baseURL: e2eEnv.publicUrl })).newPage();
  await publicPage.goto("/fr/faq");
  await expect(publicPage.getByText(QUESTION)).toBeVisible();
  await publicPage.context().close();
});

test("CMS-04 une entrée contenant « < » est refusée", async ({ browser }) => {
  const token = await adminToken(browser, contentAdmin);
  const refused = await api(token, "POST", "/admin/content/entries", {
    kind: "faq",
    entryKey: `e2e-markup-${suffix}`,
    locale: "fr",
    payload: { question: "Question avec <b>balise</b> ?", answer: "Reponse de test." }
  });
  expectStatus(refused, 400, "markup in a FAQ question");
  expect(refused.text).toContain("markup_not_allowed");

  // Same refusal through the screen: the form stays on /content/new and shows a danger notice.
  const page = await openPage(browser, contentAdmin, "/content/new");
  const form = page.locator("form[data-content-form='create']");
  await form.locator("input[name='entryKey']").fill(`e2e-markup-ui-${suffix}`);
  await form.locator("input[name='faq_question']").fill("Que signifie a < b dans une offre ?");
  await form.locator("textarea[name='faq_answer']").fill("Reponse de test.");
  await form.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(form.locator(".bo-notice[data-tone='danger']").first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/content/new");

  const list = await api(token, "GET", `/admin/content/entries?entryKey=e2e-markup-${suffix}`);
  expectStatus(list, 200, "list markup entries");
  expect(rec(list.body).items, "no entry stored for refused markup").toEqual([]);
});

test("CMS-05 un rôle sans droit sur le contenu (support_admin) reçoit 403 et ne voit rien", async ({ browser }) => {
  const token = await adminToken(browser, support);
  for (const [method, route, data] of [
    ["GET", "/admin/content/capabilities", undefined],
    ["GET", "/admin/content/entries", undefined],
    ["GET", `/admin/content/entries/${entryId}`, undefined],
    ["POST", "/admin/content/entries", { kind: "faq", entryKey: `e2e-support-${suffix}`, locale: "fr", payload: { question: "Question ?", answer: "Reponse." } }],
    ["POST", `/admin/content/entries/${entryId}/approve`, {}],
    ["POST", `/admin/content/entries/${entryId}/archive`, { note: "Test de refus" }]
  ] as const) {
    const result = await api(token, method, route, data);
    expectStatus(result, 403, `${method} ${route} as support_admin`);
    expect(result.text, "refusal leaks no editorial text").not.toContain(QUESTION);
  }
  // Without any token: 401.
  expectStatus(await api(undefined, "GET", "/admin/content/entries"), 401, "no session");

  // The published entry is still published.
  const superToken = await adminToken(browser, superAdmin);
  const detail = await api(superToken, "GET", `/admin/content/entries/${entryId}`);
  expect(rec(detail.body).status).toBe("published");

  const page = await openPage(browser, support, "/content");
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nouveau contenu" })).toHaveCount(0);
});
