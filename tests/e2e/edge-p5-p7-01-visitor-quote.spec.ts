import { expect, test, type Page } from "@playwright/test";
import { openAs } from "./support/backoffice";
import {
  DEFAULT_NEED,
  directQuote,
  EN_QUOTE_PATH,
  filesContaining,
  FR_QUOTE_PATH,
  fillContactStep,
  fillNeedStep,
  forbiddenVocabulary,
  horizontalOverflow,
  openVisitor,
  readPublishedForm,
  SQL_DROP,
  SQL_OR,
  tamperQuotePost,
  visitorIdentity,
  waitForQuotePost,
  watchDialogs,
  XSS_IMG,
  XSS_SCRIPT,
  type NeedAnswers,
  type VisitorSession
} from "./support/edge-p5p7-quote";
import { acceptStarterLead, ensureL4Firm, note, quoteSlot, reserveTrackingViews, ensureRateBudget } from "./support/edge-p5p7-support";
import { e2eEnv } from "./support/env";
import type { BrokerWorld } from "./support/journey-state";
import { extractLink, readMessage, searchMessages, waitForMail, type MailMessage } from "./support/mailpit";
import { reviewQuote } from "./support/quote-form";
import { publicCall } from "./support/recos-062b";
import { rowWith } from "./support/ui";
import { readQuoteOptions, type VisitorIdentity } from "./support/visitor-gaps";
import { appPage, findAssignmentId, superAdminAccount } from "./support/world";

// Lot 4, spec 01: phase 5 on the visitor side (comparator filters, quote form validation, injection, duplicates,
// languages) and the visitor cross-cutting cases (T-04, T-05, T-08, A11Y-01/02, RSP-01, I18N-01..03).
//
// Rate budget (quote requests: 5 per minute per IP, country and product, shared with the other lots): every
// submission waits for a free slot (quoteSlot). Cases that stop at a client-side refusal consume nothing.
// Rate limits themselves are never tested (E-P5-03f: not executed, throwaway stack only).

test.describe.configure({ mode: "serial" });

let firm: BrokerWorld;
let offerId: string;

/** Evidence passed from the qualification tests to the dedicated anomaly tests. */
const evidence: {
  honeypot?: { status: number; text: string };
  unknownProduct?: { status: number; text: string };
  answers10k?: { status: number; text: string };
  answers90k?: { status: number; text: string };
  answers200k?: { status: number; text: string };
  missingRequired?: { status: number; text: string };
  xss?: { reference: string; email: string; trackingLink: string; firstName: string; brokerLeadRefs: string[] };
  sent?: { identity: VisitorIdentity; reference: string; message: string; leadRefsAfterSend: string[] };
  duplicate?: { reference: string; message: string; href: string };
  enMail?: { subject: string; link: string };
} = {};

/** Page texts gathered along the way for the vocabulary sweep (T-08). */
const captured = new Map<string, string>();

async function capture(name: string, page: Page): Promise<void> {
  captured.set(name, await page.locator("body").innerText());
}

function anomaly(id: string, description: string): void {
  test.info().annotations.push({ type: "anomalie", description: `${id} : ${description}` });
  note(`ANOMALIE ${id} : ${description}`);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  firm = await ensureL4Firm(browser, "l4q", "l4q");
  offerId = firm.offerId as string;
});

/** Opens a quote page and waits for hydration (the stepper buttons only exist once JavaScript runs). */
async function openQuote(page: Page, url: string, continueLabel = "Continuer"): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("button", { name: continueLabel })).toBeVisible();
}

async function reachContact(visitor: VisitorSession, need: NeedAnswers = DEFAULT_NEED, url = FR_QUOTE_PATH(offerId)): Promise<void> {
  await openQuote(visitor.page, url);
  await fillNeedStep(visitor.page, need);
  await visitor.page.getByRole("button", { name: "Continuer" }).click();
  await expect(visitor.page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
}

async function reachConsent(visitor: VisitorSession, identity: VisitorIdentity, need: NeedAnswers = DEFAULT_NEED, url = FR_QUOTE_PATH(offerId)): Promise<void> {
  await reachContact(visitor, need, url);
  await fillContactStep(visitor.page, identity);
  await reviewQuote(visitor.page);
  await expect(visitor.page.locator("#am-quote-consent")).toBeVisible();
}

/** Ticks the consent, waits for a free rate slot and sends; returns the API response of the browser's POST. */
async function sendFromConsent(page: Page, label = "Envoyer ma demande") {
  await page.locator("#am-quote-consent").check();
  await quoteSlot();
  const [response] = await Promise.all([waitForQuotePost(page), page.getByRole("button", { name: label }).click()]);
  return response;
}

async function confirmedReference(page: Page): Promise<string> {
  const value = page.locator(".am-j-reference__value");
  await expect(value).toBeVisible();
  return (await value.innerText()).trim();
}

/** Waits for the visitor's two e-mails of a routed request ("received", then "forwarded") and keeps their texts for T-08. */
async function captureVisitorMails(email: string, key: string): Promise<void> {
  await expect
    .poll(async () => (await searchMessages(`to:"${email}"`)).length, { timeout: 120_000, intervals: [2_000, 3_000], message: `two e-mails to ${email}` })
    .toBeGreaterThanOrEqual(2);
  for (const summary of await searchMessages(`to:"${email}"`)) {
    const message = await readMessage(summary.ID);
    captured.set(`${key} : ${summary.Subject.replace(/QR-[A-Z0-9-]+/u, "QR-…")}`, `${message.Subject}\n${message.Text}`);
    note(`${key} e-mail du visiteur : « ${summary.Subject} »`);
  }
}

async function offerIdsOfList(): Promise<string[]> {
  const result = await publicCall("GET", "/countries/CI/products/auto/offers");
  expect(result.status).toBe(200);
  return (result.body as Array<{ id: string }>).map((offer) => offer.id);
}

/** References listed on the first page of the firm's lead list (the list is paged: references, not a row count). */
async function leadReferences(page: Page): Promise<string[]> {
  await openAs(page, firm.owner, "/leads");
  await expect(page.getByRole("row").filter({ hasText: /QR-/u }).first()).toBeVisible();
  const rows = await page.getByRole("row").filter({ hasText: /QR-/u }).allInnerTexts();
  return rows.map((row) => row.match(/QR-\d{4}-[A-Z0-9]{8}/u)?.[0] ?? "");
}

/** The server sentence of the confirmation panel (first fine print of the panel). */
const FINEPRINT = "section.am-j-sent .am-j-fineprint";

// ---------------------------------------------------------------------------------------------
// Comparator (no rate slot)
// ---------------------------------------------------------------------------------------------

test("E-P5-01a filtres sans résultat : message vide et bouton « Effacer les filtres »", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await page.goto("/pays/CI/produits/auto/offres");
  await page.locator("#am-filter-max-price").fill("1");
  await page.getByRole("button", { name: "Appliquer les filtres" }).click();
  await expect(page).toHaveURL(/maxPrice=1/u);
  await expect(page.getByText("Aucune offre indicative pour ces critères")).toBeVisible();
  const reset = page.getByRole("link", { name: "Effacer les filtres" }).or(page.getByRole("button", { name: "Effacer les filtres" }));
  await expect(reset.first()).toBeVisible();
  await reset.first().click();
  await expect(page).not.toHaveURL(/maxPrice=/u);
  await expect(page.getByRole("article", { name: firm.offerTitle as string, exact: true })).toBeVisible();
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-01b /comparer avec 1 offre puis 5 offres : « Sélection incomplète »", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  const title = "Sélection incomplète";
  const description = "Sélectionnez entre 2 et 4 offres indicatives du même pays et du même produit pour les comparer.";

  await page.goto(`/comparer?ids=${offerId}`);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();

  const five = [offerId, ...Array.from({ length: 4 }, () => crypto.randomUUID())].join(",");
  await page.goto(`/comparer?ids=${five}`);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();

  // Two ids with one unknown offer: whatever the page says, it is a page (no server error) and no comparison table.
  await page.goto(`/comparer?ids=${offerId},${crypto.randomUUID()}`);
  await expect(page.locator("main")).toBeVisible();
  const unknownText = (await page.locator("main").innerText()).replace(/\s+/gu, " ").slice(0, 160);
  note(`E-P5-01b 2 ids dont 1 inconnu -> "${unknownText}"`);
  // Offers of two products: the voyage product has no published offer on this stack, so the mix cannot be built.
  const voyageOffers = await publicCall("GET", "/countries/CI/products/voyage/offers");
  note(`E-P5-01b offres voyage publiees : ${Array.isArray(voyageOffers.body) ? voyageOffers.body.length : "?"} (melange de deux produits : equivalent par id inconnu)`);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

// ---------------------------------------------------------------------------------------------
// Quote form validation (client side, no rate slot)
// ---------------------------------------------------------------------------------------------

test("E-P5-02a champs obligatoires vides : message et focus sur le premier champ invalide", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  const required = "Ce champ est obligatoire. Indiquez une valeur avant de continuer.";
  await openQuote(page, FR_QUOTE_PATH(offerId));

  await page.getByRole("button", { name: "Continuer" }).click();
  // Required product fields of the published form: Usage du véhicule, Ville, Moyen de contact préféré.
  await expect(page.locator(".am-field__error").filter({ hasText: required })).toHaveCount(3);
  await expect(page.locator("#am-answer-vehicle_use")).toBeFocused();
  await expect(page.locator("#am-answer-vehicle_use")).toHaveAttribute("aria-invalid", "true");
  // Still on the first step.
  await expect(page.getByRole("heading", { name: "Votre besoin" })).toBeVisible();

  // One field filled: focus moves to the next invalid one.
  await page.locator("#am-answer-vehicle_use").selectOption("prive");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator("#am-answer-city")).toBeFocused();

  await fillNeedStep(page);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
  await page.getByRole("button", { name: "Vérifier ma demande" }).click();
  await expect(page.locator(".am-field__error").filter({ hasText: required })).toHaveCount(2);
  await expect(page.locator("#am-quote-email")).toBeFocused();
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-02b e-mail et téléphone invalides par pays ; +2250102030405 et 0102030405 acceptés", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  const invalidEmail = "Adresse e-mail invalide. Vérifiez le format, par exemple nom@domaine.com.";
  const invalidPhone = "Numéro de téléphone invalide. Utilisez le format international, par exemple +225XXXXXXXXX.";
  const ruleHint = "Format attendu : +225 suivi de 10 chiffres, ou 10 chiffres sans indicatif.";
  await reachContact(visitor);
  await expect(page.getByText(ruleHint)).toBeVisible();

  const verify = page.getByRole("button", { name: "Vérifier ma demande" });
  await page.locator("#am-quote-email").fill("nom@domaine");
  await page.locator("#am-quote-phone").fill("0102030");
  await verify.click();
  await expect(page.getByText(invalidEmail)).toBeVisible();
  await expect(page.getByText(invalidPhone)).toBeVisible();
  await expect(page.locator("#am-quote-email")).toBeFocused();

  // Nine digits for CI (10 expected) and a foreign dial code are refused too.
  await page.locator("#am-quote-email").fill("nom@domaine.com");
  for (const phone of ["010203040", "+22501020304050", "+3360102030405"]) {
    await page.locator("#am-quote-phone").fill(phone);
    await verify.click();
    await expect(page.getByText(invalidPhone), `phone ${phone} refused`).toBeVisible();
    await expect(page.getByText(invalidEmail)).toHaveCount(0);
  }

  // Both documented formats pass the review step.
  for (const phone of ["+2250102030405", "0102030405"]) {
    await page.locator("#am-quote-phone").fill(phone);
    await verify.click();
    await expect(page.locator("#am-quote-consent"), `phone ${phone} accepted`).toBeVisible();
    await page.getByRole("button", { name: "Revenir à l'étape précédente" }).click();
    await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
  }
  note("E-P5-02b ecart de libelle : l'erreur affichee est « Numéro de téléphone invalide. Utilisez le format international... » ; « Format attendu : +225 suivi de 10 chiffres... » est l'aide permanente du champ, pas le message d'erreur");
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-02d budget : un texte ne peut pas être saisi dans le champ nombre", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await openQuote(page, FR_QUOTE_PATH(offerId));
  const budget = page.locator("#am-answer-budget");
  await expect(budget).toHaveAttribute("type", "number");
  await budget.click();
  await page.keyboard.type("abc");
  await expect(budget).toHaveValue("");
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-02d anomalie : un budget négatif n'est pas refusé côté client", async ({ browser }) => {
  test.fail(true, "ANOMALIE E-P5-02d : le budget négatif (-5) passe l'étape 1 sans message (aucun min sur le champ, validateNeed ne contrôle que l'obligation)");
  anomaly("E-P5-02d", "budget négatif accepté par le client (quote-form.tsx:151-153 sans min ; quote-form.tsx:372-384 ne valide que les champs obligatoires)");
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await openQuote(page, FR_QUOTE_PATH(offerId));
  await fillNeedStep(page, { ...DEFAULT_NEED, budget: "-5" });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.screenshot({ path: "test-results/edge-p5p7-01/evidence-E-P5-02d-budget-negatif.png" });
  // Expected by the scenario: a refusal message on the first step.
  await expect(page.locator(".am-field__error")).toHaveCount(1, { timeout: 3_000 });
  await visitor.close();
});

test("E-P5-02f recharger la page perd la saisie (aucun brouillon visiteur)", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await openQuote(page, FR_QUOTE_PATH(offerId));
  await fillNeedStep(page, { ...DEFAULT_NEED, brand: "Peugeot" });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#am-quote-email").fill("brouillon@visitor.e2e.test");
  await page.reload();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeVisible();
  await expect(page.locator("#am-answer-vehicle_brand")).toHaveValue("");
  await expect(page.locator("#am-answer-city")).toHaveValue("");
  await expect(page.locator("#am-answer-vehicle_use")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Votre besoin" })).toBeVisible();
  const stored = await page.evaluate(() => ({ local: window.localStorage.length, session: window.sessionStorage.length }));
  expect(stored).toEqual({ local: 0, session: 0 });
  expect(await page.context().cookies()).toEqual([]);
  await visitor.close();
});

test("E-P5-03f 6 envois en une minute : 429 « Trop de demandes. Réessayez plus tard. »", async () => {
  // Counters are per IP (127.0.0.1 for the whole stack and every lot): reaching the ceiling blocks everybody.
  test.fixme(true, "NON EXECUTE, pile jetable : le plafond de 5 devis par minute est partagé par toutes les suites de la pile (aucune limite de débit ne se teste ici)");
});

test("E-P5-02g étape Documents : 6 fichiers, format, taille, fichier vide", async () => {
  // Same decision as VG-02: the Documents step exists only while product_document_upload_enabled is open, and that
  // flag is global and shared by every lot of the stack. When it is closed the case is declared, not skipped silently.
  const options = await readQuoteOptions();
  note(`E-P5-02g documentUploadEnabled=${options.documentUploadEnabled}`);
  test.fixme(!options.documentUploadEnabled, "NON EXECUTE : product_document_upload_enabled est fermé sur la pile partagée (flag global, couvert en partie par visitor-gaps VG-02) ; le cas se joue sur une pile dédiée une fois le flag ouvert");
  // The flag is closed on this stack, so the line above stops here. If it ever opens, the case has to be written.
  throw new Error("E-P5-02g : flag documents ouvert, cas à écrire (6 fichiers, note.txt, 5 Mo + 1 octet, fichier vide)");
});

// ---------------------------------------------------------------------------------------------
// Accessibility, languages (no rate slot)
// ---------------------------------------------------------------------------------------------

interface FocusInfo {
  tag: string;
  text: string;
  href: string | null;
  inHeader: boolean;
  outlineStyle: string;
  outlineWidth: string;
  top: number;
}

async function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return { tag: "none", text: "", href: null, inHeader: false, outlineStyle: "none", outlineWidth: "0px", top: -1 };
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      text: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 60),
      href: element.getAttribute("href"),
      inHeader: element.closest("header") !== null,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      top: Math.round(element.getBoundingClientRect().top)
    };
  });
}

test("A11Y-01 premier Tab : « Aller au contenu principal » vers #contenu, focus visible, ordre logique", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await page.goto("/");
  await page.keyboard.press("Tab");
  const first = await focusInfo(page);
  expect(first.text).toBe("Aller au contenu principal");
  expect(first.href).toBe("#contenu");
  expect(first.top, "the skip link is on screen once focused").toBeGreaterThanOrEqual(0);
  expect(first.outlineStyle).toBe("solid");
  expect(first.outlineWidth).toBe("3px");

  // The next stops are the header (logical order) and every one of them shows a focus ring.
  const stops: FocusInfo[] = [first];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    stops.push(await focusInfo(page));
  }
  for (const stop of stops) {
    expect(stop.outlineStyle, `focus ring on ${stop.tag} "${stop.text}"`).not.toBe("none");
    expect(stop.outlineWidth, `focus ring width on ${stop.tag} "${stop.text}"`).not.toBe("0px");
  }
  expect(stops[1]?.inHeader, "the second stop is still in the header").toBe(true);
  note(`A11Y-01 premiers arrets : ${stops.map((stop) => `${stop.tag}:${stop.text}`).join(" | ")}`);

  // Activating the skip link puts the next Tab inside the main content.
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).hash).toBe("#contenu");
  await page.keyboard.press("Tab");
  const afterSkip = await page.evaluate(() => document.activeElement?.closest("#contenu") !== null);
  expect(afterSkip, "after the skip link, Tab lands inside #contenu").toBe(true);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

/** Presses Tab until `predicate` holds for the focused element (bounded: a keyboard trap would exhaust it). */
async function tabUntil(page: Page, description: string, predicate: (element: Element) => boolean, limit = 40): Promise<number> {
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((source) => {
      const check = new Function("element", `return (${source})(element);`) as (element: Element) => boolean;
      return document.activeElement ? check(document.activeElement) : false;
    }, predicate.toString());
    if (hit) return presses;
  }
  throw new Error(`keyboard: ${description} not reached in ${limit} Tab presses`);
}

test("A11Y-02 devis entier au clavier : focus sur le titre d'étape, alertes, libellés", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await openQuote(page, FR_QUOTE_PATH(offerId));
  const activeHeading = (): Promise<string> => page.evaluate(() => (document.activeElement?.tagName === "H2" ? document.activeElement.textContent ?? "" : `<${document.activeElement?.tagName}>`));
  const labelsMissing = (): Promise<string[]> =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("form input, form select, form textarea"))
        .filter((control) => control.type !== "hidden" && control.offsetParent !== null)
        .filter((control) => (control.labels?.length ?? 0) === 0 && !control.getAttribute("aria-label"))
        .map((control) => control.id || control.name)
    );

  // Step 1, empty, by keyboard: alerts, focus on the first invalid field.
  const toContinue = await tabUntil(page, "Continuer", (element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Continuer");
  note(`A11Y-02 Tab jusqu'a « Continuer » : ${toContinue} appuis`);
  expect(await labelsMissing(), "every visible control has a label (step 1)").toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page.locator("p.am-field__error[role='alert']")).toHaveCount(3);
  await expect(page.locator("#am-answer-vehicle_use")).toBeFocused();

  // Fill with the keyboard only (the focus is on the first select).
  await page.keyboard.type("Priv");
  await tabUntil(page, "ville", (element) => element.id === "am-answer-city");
  await page.keyboard.type("Abidjan");
  await tabUntil(page, "moyen de contact", (element) => element.id === "am-answer-contact_preference");
  await page.keyboard.type("E-m");
  await tabUntil(page, "Continuer", (element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Continuer");
  await page.keyboard.press("Enter");
  expect(await activeHeading(), "focus on the step title after Continuer").toContain("Vos coordonnées");

  // Step 2: empty submit by keyboard, then filled.
  expect(await labelsMissing(), "every visible control has a label (step 2)").toEqual([]);
  await tabUntil(page, "Vérifier ma demande", (element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Vérifier ma demande");
  await page.keyboard.press("Enter");
  await expect(page.locator("p.am-field__error[role='alert']")).toHaveCount(2);
  await expect(page.locator("#am-quote-email")).toBeFocused();
  await page.keyboard.type("clavier@visitor.e2e.test");
  await tabUntil(page, "téléphone", (element) => element.id === "am-quote-phone");
  await page.keyboard.type("0102030405");
  await tabUntil(page, "Vérifier ma demande", (element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Vérifier ma demande");
  await page.keyboard.press("Enter");
  expect(await activeHeading(), "focus on the step title after Vérifier ma demande").toContain("Vérification et consentement");

  // Step 3: the consent box with the space bar; the send button is reachable (it is not pressed: nothing is sent here).
  expect(await labelsMissing(), "every visible control has a label (step 3)").toEqual([]);
  await tabUntil(page, "case de consentement", (element) => element.id === "am-quote-consent");
  await page.keyboard.press("Space");
  await expect(page.locator("#am-quote-consent")).toBeChecked();
  const toSend = await tabUntil(page, "Envoyer ma demande", (element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Envoyer ma demande");
  note(`A11Y-02 Tab de la case de consentement a « Envoyer ma demande » : ${toSend} appuis`);
  // Back with Shift+Tab: no keyboard trap.
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("I18N-01 sélecteur de langue : page équivalente, html lang, détection navigateur coupée", async ({ browser }) => {
  const visitor = await openVisitor(browser, { locale: "en-US" });
  const { page } = visitor;
  const htmlLang = (): Promise<string | null> => page.locator("html").getAttribute("lang");

  // Browser language English, French URL: the URL decides.
  await page.goto("/pays/CI");
  expect(await htmlLang()).toBe("fr");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  // Header switcher, then footer switcher, from interior pages (query string kept).
  await page.goto("/en/countries/CI/products/auto/offers");
  expect(await htmlLang()).toBe("en");
  await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/pays\/CI\/produits\/auto\/offres$/u);
  expect(await htmlLang()).toBe("fr");

  await page.goto(FR_QUOTE_PATH(offerId));
  await page.getByRole("group", { name: "Langue" }).last().getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/countries/CI/products/auto/quote\\?offerId=${offerId}$`, "u"));
  expect(await htmlLang()).toBe("en");

  await page.goto("/en/compare");
  await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/comparer$/u);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

// ---------------------------------------------------------------------------------------------
// Static checks and product availability (no rate slot)
// ---------------------------------------------------------------------------------------------

test("T-04 aucun dangerouslySetInnerHTML dans les apps hors le JSON-LD échappé", async () => {
  const hits = filesContaining("dangerouslySetInnerHTML", ["apps/public/app", "apps/broker/app", "apps/admin/app", "packages/ui"]);
  note(`T-04 dangerouslySetInnerHTML : ${hits.join(", ") || "aucun"}`);
  expect(hits).toEqual(["apps/public/app/components/ui/json-ld.tsx"]);
  expect(filesContaining('.replace(/</g, "\\u003c")', ["apps/public/app/components/ui"])).toEqual(["apps/public/app/components/ui/json-ld.tsx"]);
});

test("E-P4-03c produit inconnu : « Demande de devis indisponible » et API 404/422 (équivalent, voyage est public ici)", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await page.goto("/pays/CI/produits/inexistant/devis");
  await expect(page.getByText("Demande de devis indisponible")).toBeVisible();
  await expect(page.getByText("La demande de devis n'est pas disponible pour ce pays ou ce produit.")).toBeVisible();
  await visitor.close();

  // The product check comes before the rate limiter: this probe uses no quote slot.
  const form = await readPublishedForm("fr");
  const result = await publicCall("POST", "/quote-requests", {
    json: {
      countryCode: "CI",
      productKey: "inexistant",
      formDefinitionId: form.formDefinitionId,
      language: "fr",
      contact: { email: "inconnu@visitor.e2e.test", phone: "0102030405" },
      answers: {},
      consent: { accepted: true, consentTextId: form.consent.consentTextId, version: form.consent.version, contentHash: form.consent.contentHash }
    }
  });
  note(`E-P4-03c API produit inconnu -> ${result.status} ${result.text}`);
  evidence.unknownProduct = { status: result.status, text: result.text };
  expect(result.text).toContain("Country or product is not available");
});

test("E-P4-03c anomalie : un produit inconnu à l'envoi du devis répond 500 au lieu de 404/422", async () => {
  test.fail(evidence.unknownProduct !== undefined && evidence.unknownProduct.status >= 500, "ANOMALIE E-P4-03c : POST /quote-requests sur un produit inconnu répond 500 (code COUNTRY_DISABLED) ; le scénario attend 404 ou 422");
  expect(evidence.unknownProduct, "needs the E-P4-03c screen test").toBeDefined();
  if ((evidence.unknownProduct?.status ?? 0) >= 500) {
    anomaly("E-P4-03c", `produit inconnu -> HTTP ${evidence.unknownProduct?.status} ${evidence.unknownProduct?.text} (quote-submission.service.ts:316 throw Error brut ; error-response.filter.ts:119-131 sans motif « not available »)`);
  }
  expect([404, 422]).toContain(evidence.unknownProduct?.status);
});

test("E-P5-03i Voyage sans courtier : prémisse absente sur cette pile (le produit voyage est routable)", async () => {
  const options = await readQuoteOptions([], "CI", "voyage");
  const form = await publicCall("GET", "/countries/CI/products/voyage/quote-form?language=fr");
  note(`E-P5-03i voyage : quote-form ${form.status}, courtiers eligibles ${options.brokers.length}`);
  // A Voyage request was sent once by hand (API) before writing this spec: status "routed", brokerName = the base broker.
  // The "Demande non transmise" path needs a product without any eligible broker, or the suspension of a broker: both
  // would break the other lots running on this shared stack.
  test.fixme(options.brokers.length > 0, `NON EXECUTE : ${options.brokers.length} courtier(s) éligible(s) pour Assurance voyage en CI (état partagé) ; la demande Voyage est routée au lieu de « Demande non transmise » ; à rejouer sur pile dédiée avec le seul produit Voyage sans courtier autorisé`);
  expect(options.brokers).toHaveLength(0);
});

// ---------------------------------------------------------------------------------------------
// Submissions (each one uses a quote rate slot)
// ---------------------------------------------------------------------------------------------

test("E-P5-02c téléphone non conforme au pays : 400 « Phone is invalid for country » et message d'écran", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await reachConsent(visitor, visitorIdentity("l4phone"));
  // The client-side pattern is the same rule as the server's: the body is rewritten in flight, the real API answers.
  await tamperQuotePost(page, (body) => {
    (body.contact as { phone: string }).phone = "0102030";
  });
  const response = await sendFromConsent(page);
  expect(response.status()).toBe(400);
  const body = (await response.json()) as { message: string; code: string };
  expect(body.message).toBe("Phone is invalid for country");
  await expect(page.getByRole("alert").filter({ hasText: "Le numéro de téléphone ne correspond pas au format attendu pour ce pays." })).toBeVisible();
  await expect(page.locator(".am-j-reference__value")).toHaveCount(0);
  note(`E-P5-02c -> ${response.status()} ${JSON.stringify(body)}`);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-03b consentement republié (équivalent : empreinte falsifiée) : 422 « Consent text mismatch » et message d'écran", async ({ browser }) => {
  // Not republishing the consent text (it would break the other lots): the request carries a contentHash that is not
  // the published one, which is exactly what the server sees when the text changed between page load and sending.
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await reachConsent(visitor, visitorIdentity("l4consent"));
  await tamperQuotePost(page, (body) => {
    (body.consent as { contentHash: string }).contentHash = "0".repeat(64);
  });
  const response = await sendFromConsent(page);
  expect(response.status()).toBe(422);
  const body = (await response.json()) as { message: string; code: string };
  expect(body.message).toBe("Consent text mismatch");
  await expect(
    page.getByRole("alert").filter({ hasText: "Le texte de consentement a été mis à jour. Rechargez la page pour lire la version en vigueur avant d'envoyer votre demande." })
  ).toBeVisible();
  await expect(page.locator(".am-j-reference__value")).toHaveCount(0);
  note(`E-P5-03b (equivalent par empreinte falsifiee) -> ${response.status()} ${JSON.stringify(body)}`);
  await visitor.close();
});

test("E-P5-03g honeypot answers.website : qualification de la réponse, aucune demande créée", async () => {
  await quoteSlot();
  const identity = visitorIdentity("l4honey");
  const result = await directQuote({
    offerId,
    identity,
    answers: { vehicle_use: "prive", vehicle_brand: "Toyota", city: "Abidjan", contact_preference: "email", website: "https://spam.example" }
  });
  evidence.honeypot = { status: result.status, text: result.text };
  note(`E-P5-03g honeypot -> ${result.status} ${result.text}`);
  expect(result.text, "a blocked submission never carries a reference").not.toMatch(/QR-/u);
  expect(result.status, "the blocked submission is not accepted").not.toBe(201);
  expect(result.text).toContain("Spam submission blocked");
  // Nothing is e-mailed to the spammer.
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  expect(await searchMessages(`to:"${identity.email}"`)).toHaveLength(0);
});

test("E-P5-03g anomalie : le honeypot répond en erreur serveur (5xx) au lieu d'un refus 4xx", async () => {
  test.fail(evidence.honeypot !== undefined && evidence.honeypot.status >= 500, "ANOMALIE E-P5-03g : « Spam submission blocked » est lancé comme Error brute : aucun motif du filtre ne le classe, la réponse est un 500 INTERNAL_ERROR");
  expect(evidence.honeypot, "needs E-P5-03g qualification").toBeDefined();
  if ((evidence.honeypot?.status ?? 0) >= 500) {
    anomaly("E-P5-03g", `honeypot -> HTTP ${evidence.honeypot?.status} ${evidence.honeypot?.text} (backend/src/modules/quote-requests/public-anti-spam.service.ts:9 + common/filters/error-response.filter.ts:119-131)`);
  }
  expect(evidence.honeypot?.status).toBeLessThan(500);
});

test("E-P5-02e qualification : taille de answers acceptée (10 000, 90 000, 200 000 caractères) et champs obligatoires absents", async () => {
  test.setTimeout(8 * 60_000);
  const need = { vehicle_use: "prive", vehicle_brand: "Toyota", city: "Abidjan", contact_preference: "email" };
  await quoteSlot();
  const small = await directQuote({ offerId, identity: visitorIdentity("l4a10k"), answers: { ...need, vehicle_brand: "A".repeat(10_000) } });
  evidence.answers10k = { status: small.status, text: small.text.slice(0, 200) };
  await quoteSlot();
  const large = await directQuote({ offerId, identity: visitorIdentity("l4a90k"), answers: { ...need, vehicle_brand: "B".repeat(90_000) } });
  evidence.answers90k = { status: large.status, text: large.text.slice(0, 200) };
  // 200 000 characters: above the default 100 kb body parser, answered before any quote logic (no rate slot used).
  const huge = await directQuote({ offerId, identity: visitorIdentity("l4a200k"), answers: { ...need, vehicle_brand: "C".repeat(200_000) } });
  evidence.answers200k = { status: huge.status, text: huge.text.slice(0, 200) };
  note(`E-P5-02e answers 10 000 -> ${small.status} ; 90 000 -> ${large.status} ; 200 000 -> ${huge.status} ${huge.text.slice(0, 120)}`);
  expect(small.status, "10 000 characters: no server error").toBeLessThan(500);
  expect(large.status, "90 000 characters: no server error").toBeLessThan(500);

  // Required product answers are only checked by the browser: an API client can send none.
  await quoteSlot();
  const bare = await directQuote({ offerId, identity: visitorIdentity("l4bare"), answers: {} });
  evidence.missingRequired = { status: bare.status, text: bare.text.slice(0, 200) };
  note(`E-P5-02e answers {} (vehicle_use, city, contact_preference absents) -> ${bare.status} ${bare.text.slice(0, 160)}`);
  expect(bare.status, "no server error").toBeLessThan(500);
});

test("E-P5-02e anomalie : un corps trop volumineux (200 000 caractères) répond 500 au lieu de 413", async () => {
  test.fail(evidence.answers200k !== undefined && evidence.answers200k.status >= 500, "ANOMALIE E-P5-02e : POST /quote-requests de 200 000 caractères répond 500 INTERNAL_ERROR « request entity too large » (erreur du body parser non reconnue comme 413)");
  expect(evidence.answers200k, "needs E-P5-02e qualification").toBeDefined();
  if ((evidence.answers200k?.status ?? 0) >= 500) {
    anomaly("E-P5-02e", `corps > 100 kb -> HTTP ${evidence.answers200k?.status} ${evidence.answers200k?.text} (error-response.filter.ts:119-131 : l'erreur body-parser porte status 413 mais n'est pas une HttpException, donc 500)`);
  }
  expect(evidence.answers200k?.status, "an oversized body is a client error").toBe(413);
});

test("E-P5-02e anomalie : answers n'a aucune borne côté serveur", async () => {
  test.fail(evidence.answers90k !== undefined && evidence.answers90k.status === 201, "ANOMALIE E-P5-02e : 90 000 caractères dans un seul champ sont acceptés (201) ; seule la limite de corps HTTP de 100 kb arrête l'envoi");
  expect(evidence.answers90k, "needs E-P5-02e qualification").toBeDefined();
  if (evidence.answers90k?.status === 201) {
    anomaly("E-P5-02e", `answers non borné : 10 000 -> ${evidence.answers10k?.status}, 90 000 -> ${evidence.answers90k.status}, 200 000 -> ${evidence.answers200k?.status} (packages/shared/contracts/quote.contracts.ts:288 z.record(z.string(), z.unknown()))`);
  }
  expect(evidence.answers90k?.status, "a bounded API refuses an oversized free field").toBeGreaterThanOrEqual(400);
});

test("E-P5-02e anomalie : les champs obligatoires du produit ne sont pas contrôlés côté serveur", async () => {
  test.fail(evidence.missingRequired !== undefined && evidence.missingRequired.status === 201, "ANOMALIE E-P5-02e : POST /quote-requests sans vehicle_use, city ni contact_preference est accepté (201)");
  expect(evidence.missingRequired, "needs E-P5-02e qualification").toBeDefined();
  if (evidence.missingRequired?.status === 201) {
    anomaly("E-P5-02e", "demande sans réponses obligatoires acceptée par l'API (aucun contrôle de required du formulaire publié : quote-submission.service.ts:297-367)");
  }
  expect(evidence.missingRequired?.status, "the server enforces the required answers of the published form").toBeGreaterThanOrEqual(400);
});

test("E-P5-02d + T-04 XSS dans marque, ville et prénom : accepté, jamais exécuté (écran, suivi, e-mails, courtier, admin)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const identity = visitorIdentity("l4xss", { firstName: XSS_SCRIPT });
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await reachConsent(visitor, identity, { use: "prive", brand: XSS_SCRIPT, city: XSS_IMG, contact: "email" });

  // Review step: shown as text, nothing injected.
  const review = page.locator(".am-quote-review");
  await expect(review).toContainText(XSS_SCRIPT);
  await expect(review).toContainText(XSS_IMG);
  expect(await review.locator("script, img").count()).toBe(0);
  expect(await page.locator("img[src='x']").count()).toBe(0);

  const response = await sendFromConsent(page);
  expect(response.status(), `accepted as text: ${await response.text()}`).toBe(201);
  const reference = await confirmedReference(page);
  expect(reference).toMatch(/^QR-\d{4}-[A-Z0-9]{8}$/u);
  const confirmationMessage = (await page.locator(FINEPRINT).first().innerText()).trim();
  await capture("confirmation-fr", page);
  expect(await page.locator("img[src='x']").count()).toBe(0);

  // Visitor e-mail: nothing raw in the HTML part.
  const mail = await waitForMail({ to: identity.email, subject: /bien reçue/iu, body: new RegExp(reference, "u") });
  assertMailEscaped(mail, "e-mail de confirmation du visiteur");
  await captureVisitorMails(identity.email, "mail-visiteur-fr");
  const trackingLink = extractLink(mail, new RegExp(`/demandes-de-devis/${reference}\\?token=`, "u"));

  // Tracking space (one tracking view).
  reserveTrackingViews(3, "E-P5-02d XSS suivi");
  await page.goto(trackingLink);
  await expect(page.getByText(reference).first()).toBeVisible();
  expect(await page.locator("img[src='x']").count()).toBe(0);
  await capture("suivi-fr", page);
  expect(visitor.dialogs, "no dialog on the visitor side").toEqual([]);
  await visitor.close();

  // Broker: the lead page after "Accepter" shows the name and answers as text.
  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  const brokerDialogs = watchDialogs(brokerPage);
  const assignmentId = await findAssignmentId(brokerPage, firm.owner, reference);
  await acceptStarterLead(brokerPage, firm.owner, assignmentId);
  await expect(brokerPage.locator("main")).toContainText(XSS_SCRIPT.slice(0, 25));
  await expect(brokerPage.locator("main")).toContainText(XSS_IMG);
  expect(await brokerPage.locator("main script, main img[src='x']").count()).toBe(0);
  const ownerMail = await waitForMail({ to: firm.owner.email, body: new RegExp(reference, "u"), timeoutMs: 120_000 });
  assertMailEscaped(ownerMail, "e-mail de nouveau lead du courtier");
  evidence.xss = { reference, email: identity.email, trackingLink, firstName: identity.firstName, brokerLeadRefs: await leadReferences(brokerPage) };
  expect(brokerDialogs, "no dialog on the broker side").toEqual([]);
  await brokerPage.context().close();

  // Admin: the quote request record.
  const adminPage = await appPage(browser, e2eEnv.adminUrl);
  const adminDialogs = watchDialogs(adminPage);
  await openAs(adminPage, superAdminAccount(), `/quote-requests?reference=${reference}`);
  await rowWith(adminPage, reference).getByRole("link").first().click();
  await adminPage.waitForURL(/\/quote-requests\/[0-9a-f-]{36}/u);
  await expect(adminPage.locator("main")).toContainText(XSS_IMG);
  expect(await adminPage.locator("main script, main img[src='x']").count()).toBe(0);
  expect(adminDialogs, "no dialog on the admin side").toEqual([]);
  await adminPage.context().close();

  note(`E-P5-02d/T-04 XSS accepte et rendu en texte : ${reference} ; message de confirmation identique a la saisie banale : "${confirmationMessage}"`);
  captured.set("confirmation-message", confirmationMessage);
});

function assertMailEscaped(mail: MailMessage, label: string): void {
  expect(mail.HTML, `${label}: no raw script tag`).not.toMatch(/<script[^>]*>\s*alert\(1\)/iu);
  expect(mail.HTML, `${label}: no raw img onerror`).not.toMatch(/<img[^>]*onerror/iu);
  expect(mail.Text.includes("<img src=x onerror") || mail.HTML.includes("&lt;img") || !mail.HTML.includes("onerror=alert"), `${label}: injected markup stays inert`).toBe(true);
  const escaped = mail.HTML.includes("&lt;script&gt;") || mail.HTML.includes("&lt;img");
  note(`E-P5-02d ${label} : sujet « ${mail.Subject} » ; charge reprise dans le corps : ${escaped ? "oui, echappee" : "non"}`);
}

test("E-P5-02d + T-05 chaînes SQL et budget négatif dans le devis : acceptés comme une saisie banale, aucun 500", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const identity = visitorIdentity("l4sql", { firstName: "Robert'); DROP TABLE users;--" });
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await reachConsent(visitor, identity, { use: "prive", brand: SQL_DROP, city: SQL_OR, contact: "email", budget: "-5" });
  await expect(page.locator(".am-quote-review")).toContainText(SQL_DROP);
  const response = await sendFromConsent(page);
  expect(response.status(), await response.text()).toBe(201);
  const reference = await confirmedReference(page);
  expect(reference).toMatch(/^QR-\d{4}-[A-Z0-9]{8}$/u);
  const message = (await page.locator(FINEPRINT).first().innerText()).trim();
  note(`T-05 devis SQL : ${reference}, budget -5 accepte par le serveur (201), message "${message}"`);
  expect(message, "same confirmation as an ordinary input").toBe(captured.get("confirmation-message") ?? message);
  await visitor.close();

  // The broker's lead list is intact (the previous lead is still there) and shows the new one; the lead page opens.
  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  const assignmentId = await findAssignmentId(brokerPage, firm.owner, reference);
  await acceptStarterLead(brokerPage, firm.owner, assignmentId);
  await expect(brokerPage.locator("main")).toContainText(SQL_OR);
  await expect(brokerPage.locator("main")).toContainText(SQL_DROP);
  const refs = await leadReferences(brokerPage);
  expect(refs, "the new lead is listed").toContain(reference);
  expect(refs, "the earlier (XSS) lead is still listed").toContain(evidence.xss?.reference ?? "missing");
  const budgetShown = await brokerPage.goto(`/leads/${assignmentId}`).then(() => brokerPage.locator("main").innerText());
  note(`T-05 budget -5 sur la fiche courtier : ${/-\s?5/u.test(budgetShown) ? "affiche" : "non affiche"}`);
  await brokerPage.context().close();
});

test("T-05 /suivi : saisie SQL refusée par le client puis un seul envoi, réponse neutre identique", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await page.goto("/suivi");
  // Client-side refusal of an injection string as reference: nothing is sent, no counter used.
  await page.locator("#tracking-reference").fill(SQL_OR);
  await page.locator("#tracking-email").fill("x@visitor.e2e.test");
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByText("Indiquez une référence valide (lettres, chiffres et tirets).")).toBeVisible();
  await page.locator("#tracking-reference").fill(SQL_DROP);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByText("Indiquez une référence valide (lettres, chiffres et tirets).")).toBeVisible();

  // One real send (5 per hour and per IP): well-formed reference, SQL in the e-mail local part.
  ensureRateBudget("tracking_link_resend", 5, 1, "T-05 /suivi SQL");
  await page.locator("#tracking-reference").fill("QR-2026-SQLTEST1");
  await page.locator("#tracking-email").fill("x'or'1'='1@visitor.e2e.test");
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  const neutral = page.getByRole("status").filter({ hasText: /lien/iu }).first();
  await expect(neutral).toBeVisible();
  const text = (await neutral.textContent())?.replace(/\s+/gu, " ").trim() ?? "";
  note(`T-05 /suivi SQL -> "${text}"`);
  expect(text).toContain("Si cette référence correspond à cette adresse e-mail, un nouveau lien de suivi vient d'y être envoyé.");
  await capture("suivi-renvoi-fr", page);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("E-P5-03c double clic sur « Envoyer ma demande » : une seule demande", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const identity = visitorIdentity("l4dbl");
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/quote-requests$/u.test(new URL(request.url()).pathname)) posts += 1;
  });
  await reachConsent(visitor, identity);
  await page.locator("#am-quote-consent").check();
  await quoteSlot();
  await page.getByRole("button", { name: "Envoyer ma demande" }).dblclick();
  const reference = await confirmedReference(page);
  expect(reference).toMatch(/^QR-\d{4}-[A-Z0-9]{8}$/u);
  const message = (await page.locator(FINEPRINT).first().innerText()).trim();
  await page.waitForTimeout(3_000);
  expect(posts, "one POST /quote-requests for a double click").toBe(1);

  // One confirmation e-mail, one lead.
  await waitForMail({ to: identity.email, subject: /bien reçue/iu, body: new RegExp(reference, "u") });
  await page.waitForTimeout(4_000);
  const received = (await searchMessages(`to:"${identity.email}"`)).filter((mail) => /bien reçue/iu.test(mail.Subject));
  expect(received).toHaveLength(1);
  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  await findAssignmentId(brokerPage, firm.owner, reference);
  const refs = await leadReferences(brokerPage);
  await brokerPage.context().close();
  evidence.sent = { identity, reference, message, leadRefsAfterSend: refs };
  note(`E-P5-03c double clic : ${posts} POST, 1 e-mail, ${reference}`);
  await visitor.close();
});

test("E-P5-03d doublon sous 30 jours : message du serveur, aucun second lead ni e-mail", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  expect(evidence.sent, "needs E-P5-03c").toBeDefined();
  const sent = evidence.sent as NonNullable<typeof evidence.sent>;
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  await reachConsent(visitor, sent.identity);
  const response = await sendFromConsent(page);
  const body = (await response.json()) as { publicReference: string; status: string; routed: boolean; verificationToken: string; message: string };
  note(`E-P5-03d API doublon -> ${response.status()} ${JSON.stringify({ ...body, verificationToken: body.verificationToken === "duplicate" ? "duplicate" : "<jeton>" })}`);
  expect(response.status()).toBe(201);
  expect(body.status).toBe("duplicate");
  expect(body.routed).toBe(false);
  const duplicateText = "Une demande récente similaire existe déjà; aucun courtier partenaire n'est notifié une seconde fois.";
  await expect(page.getByText(duplicateText)).toBeVisible();
  const reference = await confirmedReference(page);
  const href = (await page.getByRole("link", { name: /Suivre ma demande/u }).first().getAttribute("href")) ?? "";
  evidence.duplicate = { reference, message: duplicateText, href };
  note(`E-P5-03d ecran : reference affichee « ${reference} », lien « ${href} »`);
  await page.screenshot({ path: "test-results/edge-p5p7-01/evidence-E-P5-03d-duplicate.png" });
  await visitor.close();

  // No second lead at the broker, no second e-mail to the visitor.
  const brokerPage = await appPage(browser, e2eEnv.brokerUrl);
  const refs = await leadReferences(brokerPage);
  await brokerPage.context().close();
  expect(refs, "no second lead at the broker (same list as after the first send)").toEqual(sent.leadRefsAfterSend);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const mails = (await searchMessages(`to:"${sent.identity.email}"`)).filter((mail) => /bien reçue/iu.test(mail.Subject));
  expect(mails, "no second confirmation e-mail").toHaveLength(1);
});

test("E-P5-03d le lien de suivi du doublon ne mène à aucune demande (écran neutre)", async ({ browser }) => {
  expect(evidence.duplicate, "needs E-P5-03d").toBeDefined();
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  // A token of 8 characters is below the 16-character floor: it does not count against the 60 views per hour.
  await page.goto(evidence.duplicate?.href ?? "/");
  await expect(page.getByText("Ce lien de suivi ne permet pas d'afficher une demande")).toBeVisible();
  await expect(page.getByRole("link", { name: "Recevoir un nouveau lien" }).first()).toBeVisible();
  note(`E-P5-03d lien « ${new URL(page.url()).pathname}${new URL(page.url()).search} » -> ecran neutre`);
  await visitor.close();
});

test("E-P5-03d anomalie : la référence affichée au visiteur est « duplicate » et son lien est mort", async () => {
  test.fail(evidence.duplicate !== undefined && evidence.duplicate.reference === "duplicate", "ANOMALIE E-P5-03d : la confirmation affiche « Référence publique : duplicate » et propose un lien ?token=duplicate qui ne mène à rien");
  expect(evidence.duplicate, "needs E-P5-03d").toBeDefined();
  if (evidence.duplicate?.reference === "duplicate") {
    anomaly("E-P5-03d", `référence affichée « duplicate », lien « ${evidence.duplicate.href} » (quote-submission.service.ts:1160-1167 duplicateConfirmation ; quote-form.tsx:613-616 et 649-660 affichent la valeur telle quelle)`);
  }
  expect(evidence.duplicate?.reference, "the visitor is shown a real public reference or no reference at all").toMatch(/^QR-\d{4}-[A-Z0-9]{8}$/u);
});

test("E-P5-03j + I18N-01/02/03 parcours en anglais jusqu'à la confirmation", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const identity = visitorIdentity("l4en");
  const visitor = await openVisitor(browser, { locale: "en-US" });
  const { page } = visitor;
  await openQuote(page, EN_QUOTE_PATH(offerId), "Continue");
  expect(await page.locator("html").getAttribute("lang")).toBe("en");
  await expect(page.getByRole("heading", { name: "Request a quote" }).first()).toBeVisible();
  // English published form: option codes are the English ones.
  await page.locator("#am-answer-vehicle_use").selectOption("private");
  await page.locator("#am-answer-vehicle_brand").fill("Toyota");
  await page.locator("#am-answer-city").fill("Abidjan");
  await page.locator("#am-answer-contact_preference").selectOption("email");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await fillContactStep(page, identity);
  await page.getByRole("button", { name: "Review my request" }).click();
  await expect(page.locator("#am-quote-consent")).toBeVisible();
  await capture("devis-consentement-en", page);
  const response = await sendFromConsent(page, "Send my request");
  expect(response.status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  await expect(page.getByText("Public reference:")).toBeVisible();
  const reference = await confirmedReference(page);
  expect(reference).toMatch(/^QR-\d{4}-[A-Z0-9]{8}$/u);
  await expect(page.getByText(`Your request has been sent to ${firm.partnerName}.`)).toBeVisible();

  // I18N-03: the server sentence stays French and is marked lang="fr" (H15).
  const sentence = page.locator("section.am-j-sent .am-j-fineprint span[lang='fr']");
  await expect(sentence).toContainText("Votre demande indicative a été transmise au courtier partenaire identifié.");
  note("I18N-03 phrase de confirmation du serveur en francais sur /en, balisee lang=fr (H15, ui/backend-text.tsx:12)");
  await capture("confirmation-en", page);
  expect(await page.locator("html").getAttribute("lang")).toBe("en");

  // I18N-02: English subject.
  const mail = await waitForMail({ to: identity.email, subject: /has been received/iu, body: new RegExp(reference, "u") });
  expect(mail.Subject).toBe(`Your quote request ${reference} has been received`);
  await captureVisitorMails(identity.email, "mail-visiteur-en");
  const link = extractLink(mail, new RegExp(`/(?:en/)?(?:quote-requests|demandes-de-devis)/${reference}\\?token=`, "u"));
  evidence.enMail = { subject: mail.Subject, link: link.replace(/token=.*/u, "token=<jeton>") };
  note(`I18N-02 sujet « ${mail.Subject} » ; lien de suivi du courriel EN : ${evidence.enMail.link} ; corps en anglais : ${/request|received|tracking/iu.test(mail.Text) ? "oui" : "non"}`);

  // The tracking link of the English mail opens the English tracking space (one view).
  reserveTrackingViews(2, "E-P5-03j suivi EN");
  await page.goto(link);
  await expect(page.getByText(reference).first()).toBeVisible();
  note(`I18N-01 suivi depuis le courriel EN : html lang=${await page.locator("html").getAttribute("lang")} url=${new URL(page.url()).pathname}`);
  await capture("suivi-en", page);
  expect(visitor.dialogs).toEqual([]);
  await visitor.close();
});

test("RSP-01 largeur 375 px : accueil, comparateur, devis (étapes), confirmation, suivi sans défilement horizontal", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const identity = visitorIdentity("l4rsp");
  const visitor = await openVisitor(browser, { width: 375, height: 812 });
  const { page } = visitor;
  const overflows: string[] = [];
  const measure = async (label: string): Promise<void> => {
    const result = await horizontalOverflow(page);
    note(`RSP-01 ${label} : scrollWidth=${result.scrollWidth} clientWidth=${result.clientWidth}${result.widest ? ` plus large=${result.widest}` : ""}`);
    if (result.scrollWidth > 375) overflows.push(`${label}: scrollWidth ${result.scrollWidth} (${result.widest})`);
  };

  await page.goto("/");
  await measure("accueil");
  await page.goto("/pays/CI/produits/auto/offres");
  await measure("liste des offres");
  const ids = (await offerIdsOfList()).slice(0, 2);
  await page.goto(`/comparer?ids=${ids.join(",")}`);
  await measure("comparateur");
  await openQuote(page, FR_QUOTE_PATH(offerId));
  await measure("devis étape 1");
  await fillNeedStep(page);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
  await measure("devis étape 2");
  await fillContactStep(page, identity);
  await reviewQuote(page);
  await measure("devis étape 3 (consentement)");
  const response = await sendFromConsent(page);
  expect(response.status()).toBe(201);
  const reference = await confirmedReference(page);
  await measure("confirmation");
  await page.screenshot({ path: "test-results/edge-p5p7-01/evidence-RSP-01-confirmation-375.png" });
  await capture("confirmation-375", page);

  const mail = await waitForMail({ to: identity.email, body: new RegExp(reference, "u") });
  const link = extractLink(mail, new RegExp(`/demandes-de-devis/${reference}\\?token=`, "u"));
  reserveTrackingViews(2, "RSP-01 suivi");
  await page.goto(link);
  await expect(page.getByText(reference).first()).toBeVisible();
  await measure("espace de suivi");
  await page.screenshot({ path: "test-results/edge-p5p7-01/evidence-RSP-01-suivi-375.png" });
  expect(overflows, "no horizontal scroll at 375 px").toEqual([]);
  await visitor.close();
});

test("T-08 vocabulaire interdit : offres, comparateur, devis, confirmation, suivi et e-mails du visiteur (FR et EN)", async ({ browser }) => {
  const visitor = await openVisitor(browser);
  const { page } = visitor;
  const ids = (await offerIdsOfList()).slice(0, 2);
  for (const [name, url] of [
    ["offres-fr", "/pays/CI/produits/auto/offres"],
    ["comparateur-fr", `/comparer?ids=${ids.join(",")}`],
    ["devis-fr", FR_QUOTE_PATH(offerId)],
    ["offres-en", "/en/countries/CI/products/auto/offers"],
    ["comparateur-en", `/en/compare?ids=${ids.join(",")}`],
    ["devis-en", EN_QUOTE_PATH(offerId)]
  ] as const) {
    await page.goto(url);
    await expect(page.locator("main")).toBeVisible();
    await capture(name, page);
  }
  await visitor.close();

  // Everything captured along the way must be there (a missing page would make the sweep meaningless).
  for (const required of ["confirmation-fr", "suivi-fr", "confirmation-en", "suivi-en"]) {
    expect(captured.has(required), `captured text ${required}`).toBe(true);
  }
  expect([...captured.keys()].filter((name) => name.startsWith("mail-visiteur-fr")).length, "visitor e-mails captured (FR)").toBeGreaterThanOrEqual(2);
  expect([...captured.keys()].filter((name) => name.startsWith("mail-visiteur-en")).length, "visitor e-mails captured (EN)").toBeGreaterThanOrEqual(2);
  const findings: string[] = [];
  for (const [name, text] of captured) {
    for (const hit of forbiddenVocabulary(text)) findings.push(`[${name}] ${hit}`);
  }
  note(`T-08 balayage de ${captured.size} textes (${[...captured.keys()].join(", ")}) : ${findings.length} occurrence(s)`);
  for (const finding of findings) note(`T-08 occurrence ${finding}`);
  expect(findings, "forbidden vocabulary on visitor pages and e-mails").toEqual([]);
});
