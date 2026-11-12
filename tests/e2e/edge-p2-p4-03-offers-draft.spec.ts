import { expect, test, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import {
  L3,
  brokerOffer,
  contentPayload,
  createDraft,
  createForm,
  createPayload,
  describeResult,
  dialogsSeen,
  editForm,
  errorOf,
  fillCreateForm,
  formValues,
  isoDay,
  loadScope,
  noticeText,
  offerApi,
  offerName,
  offerNames,
  publicListing,
  rec,
  submitCreateForm,
  watchDialogs,
  type Scope
} from "./support/edge-p2p4-offers";
import { closeSessions, tokenFor, visit } from "./support/pro-roles";
import { confirmInDialog, card, fillReason, rowWith } from "./support/ui";
import { appPage, complianceAccount, inviteMember, provisionBroker, WORLD_REASON } from "./support/world";
import type { BrokerWorld } from "./support/journey-state";

// Lot 3, phase 3 edge cases (scenario sections 8 and 13, hypotheses H7 to H9, constat 16.2): the broker
// creates and edits offers in draft. Two throwaway Starter firms ("l3oa", "l3ob" for the isolation case) are
// provisioned for the file; their offers are withdrawn in afterAll so they do not linger on the shared
// public catalogue. State stays in memory (no saveWorld / saveJourneyState: the journey file is shared).

test.describe.configure({ mode: "serial", timeout: 240_000 });

let A: BrokerWorld;
let B: BrokerWorld;
let reader: BackOfficeAccount;
let agent: BackOfficeAccount;
let scope: Scope;
/** A valid draft of A, shared by the isolation and role cases (never submitted). */
let baseOffer: { id: string; name: string };
/** Offer submitted by E-P3-02a, reused by E-P3-02b and E-P3-02d. */
let submittedOffer: { id: string; name: string } | undefined;
/** Dialogs opened on the public offer sheet by the XSS offer of E-P3-01k, and the raw ld+json block served there. */
let publicDetailDialogs: string[] = [];
let publicDetailLdJson = "(non lu)";

const REASON = `${WORLD_REASON} lot 3 offres`;

function note(description: string): void {
  test.info().annotations.push({ type: "constat", description });
}

async function ownerPage(browser: import("@playwright/test").Browser, world: BrokerWorld, path: string): Promise<Page> {
  const page = await visit(browser, world.owner, path);
  watchDialogs(page);
  return page;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(1_200_000);
  scope = await loadScope();
  A = await provisionBroker(browser, { plan: "starter", label: "l3oa" });
  B = await provisionBroker(browser, { plan: "starter", label: "l3ob" });
  reader = await inviteMember(browser, A.owner, { key: "readOnly", displayName: "Lea Lecture L3", emailDomain: "broker-l3oa.e2e.test" });
  agent = await inviteMember(browser, A.owner, { key: "agent", displayName: "Aya Agent L3", emailDomain: "broker-l3oa.e2e.test" });
  const token = await tokenFor(browser, A.owner);
  baseOffer = await createDraft(token, scope, { name: offerName("Base") });
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(300_000);
  // Best effort: withdraw every published offer and abandon every submitted version of the two throwaway firms.
  for (const world of [A, B]) {
    if (!world) continue;
    try {
      const token = await tokenFor(browser, world.owner);
      const list = await offerApi(token, "GET", "/broker/offers");
      for (const item of Array.isArray(list.body) ? list.body : []) {
        const view = rec(item);
        const id = String(view.id);
        if (view.status === "published") await offerApi(token, "POST", `/broker/offers/${id}/withdraw`, { reason: `Nettoyage ${L3}`, target: "offer" });
        else if (rec(view.pending).status === "submitted") await offerApi(token, "POST", `/broker/offers/${id}/withdraw`, { reason: `Nettoyage ${L3}`, target: "pending" });
      }
    } catch {
      // best effort
    }
  }
  await closeSessions();
});

test("E-P3-01a nom vide, nom de 161 caractères, description de 1001 caractères : aucune offre créée", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const before = await offerNames(token);

  // Empty name: the browser blocks the submission (required), then, with the constraints off, the server action refuses.
  let page = await ownerPage(browser, A, "/offers/new");
  let form = await fillCreateForm(page, formValues({ name: "" }));
  const missing = await form.locator("input[name='name']").evaluate((node) => (node as HTMLInputElement).validity.valueMissing);
  expect(missing, "le champ Nom commercial est obligatoire côté navigateur").toBe(true);
  await form.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page).toHaveURL(/\/offers\/new/u);
  const empty = await submitCreateForm(page, form, { bypassBrowserValidation: true });
  expect(empty.offerId, "aucune offre créée").toBeUndefined();
  expect(empty.message).toMatch(/obligatoire/u);

  // 161 characters (the input has maxLength 160 but a typed value is only truncated by a real keyboard).
  const longName = `${L3} 161 `.padEnd(161, "x");
  expect(longName).toHaveLength(161);
  page = await ownerPage(browser, A, "/offers/new");
  form = await fillCreateForm(page, formValues({ name: longName }));
  expect((await form.locator("input[name='name']").inputValue()).length, "le champ plafonne la saisie à 160 caractères (maxLength)").toBe(160);
  page = await ownerPage(browser, A, "/offers/new");
  form = await fillCreateForm(page, formValues({ name: longName }), { removeMaxLength: true });
  const tooLong = await submitCreateForm(page, form, { bypassBrowserValidation: true });
  expect(tooLong.offerId).toBeUndefined();
  expect(tooLong.message).toContain("Données invalides : vérifiez les champs");

  // 1001 characters of description.
  const descName = offerName("desc1001");
  page = await ownerPage(browser, A, "/offers/new");
  form = await fillCreateForm(page, formValues({ name: descName, shortDescription: "d".repeat(1001) }), { removeMaxLength: true });
  const tooLongDescription = await submitCreateForm(page, form, { bypassBrowserValidation: true });
  expect(tooLongDescription.offerId).toBeUndefined();
  expect(tooLongDescription.message).toContain("Données invalides : vérifiez les champs");

  // The same refusals at the API (400), and nothing was stored.
  const apiLongName = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: longName }));
  expect(apiLongName.status, describeResult(apiLongName)).toBe(400);
  const apiLongDescription = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: descName, shortDescription: "d".repeat(1001) }));
  expect(apiLongDescription.status, describeResult(apiLongDescription)).toBe(400);
  const apiEmpty = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: "" }));
  expect(apiEmpty.status, describeResult(apiEmpty)).toBe(400);
  const after = await offerNames(token);
  expect(after, "aucune offre créée par les refus").toEqual(before);
  note(`UI nom vide : « ${empty.message} » ; 161 car. / 1001 car. : « ${tooLong.message} » ; API : ${describeResult(apiLongName)}`);
});

test("E-P3-01b prime minimale 140000 supérieure à la maximale 80000 : refus", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const name = offerName("prix-inverse");
  const page = await ownerPage(browser, A, "/offers/new");
  const form = await fillCreateForm(page, formValues({ name, indicativePriceMin: "140000", indicativePriceMax: "80000" }));
  const outcome = await submitCreateForm(page, form);
  expect(outcome.offerId).toBeUndefined();
  expect(outcome.message).toBe("Prix invalide : la prime minimale dépasse la prime maximale.");
  const api = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name, indicativePriceMin: 140000, indicativePriceMax: 80000 }));
  expect(api.status, describeResult(api)).toBe(400);
  expect(errorOf(api).message).toContain("indicativePriceMin must not exceed indicativePriceMax");
  expect(await offerNames(token)).not.toContain(name);
});

test("E-P3-01c prime négative et devise de 2 lettres refusées ; prime 0 acceptée (constat H7)", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  // Negative price through the screen.
  const negativeName = offerName("prix-negatif");
  const page = await ownerPage(browser, A, "/offers/new");
  const form = await fillCreateForm(page, formValues({ name: negativeName, indicativePriceMin: "-5", indicativePriceMax: "120000" }));
  const negative = await submitCreateForm(page, form, { bypassBrowserValidation: true });
  expect(negative.offerId).toBeUndefined();
  expect(negative.message).toContain("Données invalides : vérifiez les champs");
  // API: negative, 2-letter currency, and a 4-letter one.
  const apiNegative = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: negativeName, indicativePriceMin: -5 }));
  expect(apiNegative.status, describeResult(apiNegative)).toBe(400);
  const currencyName = offerName("devise-xo");
  const apiCurrency = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: currencyName, currency: "XO" }));
  expect(apiCurrency.status, describeResult(apiCurrency)).toBe(400);
  const apiCurrencyLong = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: currencyName, currency: "XOFA" }));
  expect(apiCurrencyLong.status, describeResult(apiCurrencyLong)).toBe(400);
  // Screen with the 2-letter currency (minlength is bypassed like a forged request).
  const page2 = await ownerPage(browser, A, "/offers/new");
  const form2 = await fillCreateForm(page2, formValues({ name: currencyName, currency: "XO" }));
  const ui2 = await submitCreateForm(page2, form2, { bypassBrowserValidation: true });
  expect(ui2.offerId).toBeUndefined();
  expect(ui2.message).toContain("Données invalides");
  const names = await offerNames(token);
  expect(names).not.toContain(negativeName);
  expect(names).not.toContain(currencyName);

  // Zero is accepted (H7): drafted, not submitted.
  const zeroName = offerName("prix-zero");
  const zero = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: zeroName, indicativePriceMin: 0, indicativePriceMax: 0 }));
  expect(zero.status, describeResult(zero)).toBe(201);
  note(`H7 confirmée : une prime minimale et maximale de 0 est acceptée (HTTP ${zero.status}, brouillon ${String(rec(zero.body).id)}) ; packages/shared/contracts/offer-content.ts:42-43 (nonnegative). À trancher par le produit ; la conformité devrait refuser à la revue.`);
});

test("E-P3-01d fin de validité avant le début refusée ; fin dans le passé : brouillon créé, soumission refusée", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const inverted = offerName("dates-inversees");
  let page = await ownerPage(browser, A, "/offers/new");
  let form = await fillCreateForm(page, formValues({ name: inverted, validFrom: isoDay(10), validUntil: isoDay(5) }));
  const refused = await submitCreateForm(page, form);
  expect(refused.offerId).toBeUndefined();
  expect(refused.message).toBe("Dates incohérentes : la fin de validité doit être postérieure au début.");
  const api = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: inverted, validFrom: `${isoDay(10)}T00:00:00.000Z`, validUntil: `${isoDay(5)}T23:59:59.000Z` }));
  expect(api.status, describeResult(api)).toBe(400);
  expect(await offerNames(token)).not.toContain(inverted);

  // End date in the past: the draft is accepted, the submission is not.
  const past = offerName("fin-passee");
  page = await ownerPage(browser, A, "/offers/new");
  form = await fillCreateForm(page, formValues({ name: past, validFrom: isoDay(-60), validUntil: isoDay(-1) }));
  const created = await submitCreateForm(page, form);
  expect(created.offerId, created.message).toBeTruthy();
  await expect(page.getByText("Offre créée en brouillon (version 1). Complétez-la puis soumettez-la à validation.")).toBeVisible();
  await expect(page.locator("[data-offer-completeness='true']").first()).toContainText("À compléter : Fin de validité future");
  await expect(page.getByText("Complétude minimale non atteinte : la soumission sera refusée avec la liste des champs manquants.")).toBeVisible();
  const actions = card(page, "Actions");
  await actions.getByRole("button", { name: "Soumettre à validation" }).click();
  const message = await noticeText(actions, "danger");
  expect(message).toContain("Soumission refusée : la complétude minimale n'est pas atteinte. Complétez les champs listés.");
  expect(message).toContain("Champ obligatoire manquant : Fin de validité (future)");
  const view = await brokerOffer(token, created.offerId as string);
  expect(view.status, "l'offre reste en brouillon").toBe("draft");
});

test("E-P3-01e 51 garanties : l'écran s'arrête à 50, l'API refuse la 51e (400)", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const page = await ownerPage(browser, A, "/offers/new");
  const form = createForm(page);
  const add = form.getByRole("button", { name: "Ajouter une garantie" });
  for (let index = 1; index < 50; index += 1) await add.click();
  await expect(form.locator("input[name='guaranteeLabel']")).toHaveCount(50);
  await expect(add, "« Ajouter une garantie » désactivé à 50").toBeDisabled();

  const guarantees = (count: number) => Array.from({ length: count }, (_, index) => ({ key: `garantie_${index + 1}`, label: `Garantie ${index + 1}`, included: true }));
  const over = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: offerName("51-garanties"), guarantees: guarantees(51) }));
  expect(over.status, describeResult(over)).toBe(400);
  const overError = errorOf(over);
  note(`API 51 garanties : ${describeResult(over)} ; le scénario attendait le code OFFER_MAX_GUARANTEES, le code réel est « ${overError.code} » (la limite vient du schéma zod, packages/shared/contracts/offer-content.ts, .max(OFFER_MAX_GUARANTEES)).`);
  const exact = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: offerName("50-garanties"), guarantees: guarantees(50) }));
  expect(exact.status, describeResult(exact)).toBe(201);
});

test("E-P3-01f aucune garantie : brouillon accepté, soumission refusée avec la liste des champs manquants", async ({ browser }) => {
  const page = await ownerPage(browser, A, "/offers/new");
  const name = offerName("sans-garantie");
  const form = await fillCreateForm(page, formValues({ name, guaranteeLabels: [] }));
  const created = await submitCreateForm(page, form);
  expect(created.offerId, created.message).toBeTruthy();
  await expect(page.getByText("Offre créée en brouillon (version 1)")).toBeVisible();
  await expect(page.getByText("Complétude minimale non atteinte : la soumission sera refusée avec la liste des champs manquants.")).toBeVisible();
  const actions = card(page, "Actions");
  await actions.getByRole("button", { name: "Soumettre à validation" }).click();
  const message = await noticeText(actions, "danger");
  expect(message).toContain("Soumission refusée : la complétude minimale n'est pas atteinte. Complétez les champs listés.");
  expect(message).toContain("Champ obligatoire manquant : Garanties (au moins une)");
  const token = await tokenFor(browser, A.owner);
  const direct = await offerApi(token, "POST", `/broker/offers/${created.offerId}/submit`, {});
  expect(direct.status, describeResult(direct)).toBe(422);
  expect(errorOf(direct).code).toBe("OFFER_INCOMPLETE");
  expect(errorOf(direct).blockers).toEqual(expect.arrayContaining([{ code: "missing_field", field: "guarantees" }]));
});

test("E-P3-01g « souscrire maintenant » et « acheter maintenant » : formulation interdite, aucune offre enregistrée", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  for (const [tag, phrase] of [["souscrire", "souscrire maintenant"], ["acheter", "Acheter maintenant"]] as const) {
    const name = offerName(`interdit-${tag}`);
    const page = await ownerPage(browser, A, "/offers/new");
    const form = await fillCreateForm(page, formValues({ name, shortDescription: `Votre assurance auto : ${phrase} en ligne.` }));
    const outcome = await submitCreateForm(page, form);
    expect(outcome.offerId).toBeUndefined();
    expect(outcome.message).toBe(`Formulation réglementée interdite détectée : « ${phrase.toLowerCase()} ». Reformulez le champ concerné.`);
    const api = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name, shortDescription: phrase }));
    expect(api.status, describeResult(api)).toBe(400);
    expect(errorOf(api).message).toContain("Forbidden regulated wording");
    expect(await offerNames(token)).not.toContain(name);
  }
});

test("E-P3-01h « contrat validé » (accent) : qualifier le constat 16.2 / H8 jusqu'à la revue de conformité", async ({ browser }) => {
  test.fail(true, "ANOMALIE E-P3-01h : « contrat validé » (accent) passe la création, la soumission ET la validation « Valider et publier » : la formulation interdite est publiée (content-safety.ts:1-9, offer-content.ts:119, aucun contrôle à la revue dans offer-lifecycle.service.ts:validationBlockers)");
  const token = await tokenFor(browser, A.owner);
  // Control: the same phrase without the accent is refused at the entry.
  const control = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: offerName("H8-controle"), shortDescription: "Un contrat valide pour vous." }));
  expect(control.status, `sans accent : ${describeResult(control)}`).toBe(400);
  expect(errorOf(control).message).toContain("Forbidden regulated wording");

  const name = offerName("H8");
  const created = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name, shortDescription: "Avec ce contrat validé, vous êtes couvert dès aujourd'hui." }));
  const observed: string[] = [`création avec accent : ${describeResult(created)}`];
  expect(created.status, "H8 : la création avec l'accent est acceptée (liste étroite)").toBe(201);
  const id = String(rec(created.body).id);
  let refusedAtReview: string | undefined;
  try {
    const submit = await offerApi(token, "POST", `/broker/offers/${id}/submit`, {});
    observed.push(`soumission : ${describeResult(submit)}`);
    expect(submit.status, "soumission acceptée").toBe(200);

    const admin = await visit(browser, complianceAccount(), `/offers/${id}`);
    watchDialogs(admin);
    try {
      await confirmInDialog(admin, admin.locator("[data-offer-decision='validate']"), "Valider et publier", (dialog) => fillReason(dialog, REASON));
    } catch (error) {
      refusedAtReview = error instanceof Error ? error.message : String(error);
    }
    observed.push(refusedAtReview ? `validation refusée : ${refusedAtReview}` : "validation : « Valider et publier » acceptée, l'offre est publiée");
    if (!refusedAtReview) {
      await expect.poll(async () => (await publicListing()).some((offer) => offer.id === id), { timeout: 90_000, intervals: [2_000, 5_000] }).toBe(true);
      const detail = await offerApi(undefined, "GET", `/offers/${id}`);
      const visible = detail.text.includes("contrat validé");
      observed.push(`catalogue public : offre listée ; texte « contrat validé » dans le détail public (API) : ${visible ? "oui" : "non"}`);
      const visitor = await appPage(browser, e2eEnv.publicUrl);
      try {
        await visitor.goto(`/offres/${id}`);
        const pageText = await visitor.locator("body").innerText();
        observed.push(`page /offres/${id} : « contrat validé » affiché : ${pageText.includes("contrat validé") ? "oui" : "non"}`);
      } finally {
        await visitor.context().close();
      }
    }
  } finally {
    // Never leave a regulated wording on the shared public catalogue.
    await offerApi(token, "POST", `/broker/offers/${id}/withdraw`, { reason: `Nettoyage ${L3}`, target: (await brokerOffer(token, id)).status === "published" ? "offer" : "pending" });
    note(observed.join(" | "));
    note("Comparaison : la messagerie utilise findForbiddenWordingAnyLanguage (normalisation NFKC/diacritiques/tirets, content-safety.ts:234, appelée par lead-messaging.service.ts:196) ; les offres n'utilisent que findForbiddenWording (content-safety.ts:18, texte brut en minuscules, 7 expressions) via refineOfferContent (offer-content.ts:119). Correctif : appeler findForbiddenWordingAnyLanguage dans refineOfferContent ET ajouter un contrôle de formulation dans validationBlockers (offer-lifecycle.service.ts) pour couvrir les versions déjà stockées.");
  }
  expect(refusedAtReview, "la revue de conformité doit refuser une formulation réglementée interdite").toBeTruthy();
});

test("E-P3-01i deux offres au même nom : créées, clé publique suffixée -2 (constat H9)", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const name = offerName("doublon");
  const first = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name }));
  const second = await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name }));
  expect(first.status, describeResult(first)).toBe(201);
  expect(second.status, describeResult(second)).toBe(201);
  const firstKey = String(rec(first.body).publicKey);
  const secondKey = String(rec(second.body).publicKey);
  expect(firstKey).not.toBe("");
  expect(secondKey).toBe(`${firstKey}-2`);
  expect(rec(first.body).id).not.toBe(rec(second.body).id);
  const page = await ownerPage(browser, A, "/offers");
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(2);
  note(`H9 confirmée : aucune unicité du nom commercial ; clés publiques « ${firstKey} » et « ${secondKey} » (offer-lifecycle.service.ts:574-579).`);
});

test("E-P3-01j produit Voyage non couvert : absent de la liste, API 422 « Périmètre non couvert »", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const page = await ownerPage(browser, A, "/offers/new");
  const options = await createForm(page).locator("select[name='scope'] option").allInnerTexts();
  expect(options.some((text) => text.includes("Côte d'Ivoire (CI) — Assurance auto"))).toBe(true);
  expect(options.filter((text) => /Voyage/iu.test(text)), "aucune option Voyage").toEqual([]);

  const name = offerName("voyage");
  const api = await offerApi(token, "POST", "/broker/offers", { ...createPayload(scope, { name }), productId: scope.voyageId });
  expect(api.status, describeResult(api)).toBe(422);
  expect(errorOf(api).code).toBe("OFFER_SCOPE_NOT_COVERED");

  // Forged option in the screen: the French refusal wording of the broker app.
  const form = await fillCreateForm(page, formValues({ name }));
  await form.locator("select[name='scope']").evaluate((node, value) => {
    const select = node as HTMLSelectElement;
    const option = document.createElement("option");
    option.value = value;
    option.text = "forgé";
    select.add(option);
    select.value = value;
  }, `${scope.countryId}:${scope.voyageId}`);
  const outcome = await submitCreateForm(page, form);
  expect(outcome.offerId).toBeUndefined();
  expect(outcome.message).toContain("Périmètre non couvert : votre cabinet n'a pas de licence valide et d'autorisations actives pour ce pays et ce produit. Contactez AssurMatch pour étendre votre couverture.");
  expect(outcome.message, "la liste des blocages est ajoutée au message").toContain("Courtier non autorisé pour ce produit");
  note(`Message réel de l'écran : « ${outcome.message} » ; API : ${describeResult(api)} blockers ${JSON.stringify(errorOf(api).blockers)}`);
  expect(await offerNames(token)).not.toContain(name);
  note("Variante « aucune couverture licenciée » (notice « Aucune couverture licenciée » et bouton désactivé) : non exécuté, pile jetable requise (il faudrait un courtier sans licence ni autorisation de périmètre ; les courtiers de ce lot ont tous CI x Auto).");
});

test("E-P3-01k / T-04 / T-05 XSS et SQL dans Nom, Description, Source : texte inerte dans les trois apps, aucun 500", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const name = `${L3} XSS <script>alert(1)</script> ' OR '1'='1 ${Date.now().toString(36)}`;
  const description = `"><img src=x onerror=alert(1)> '; DROP TABLE leads;-- prix indicatif`;
  const source = `<svg onload=alert(1)> ' OR '1'='1`;
  const dialogsBefore = dialogsSeen.length;
  let id = "";
  try {
    const page = await ownerPage(browser, A, "/offers/new");
    const form = await fillCreateForm(page, formValues({ name, shortDescription: description, sourceOfInformation: source }));
    const created = await submitCreateForm(page, form);
    expect(created.offerId, created.message).toBeTruthy();
    id = created.offerId as string;
    // Broker app: rendered as text.
    const body = page.locator("body");
    await expect(body).toContainText(name);
    await expect(body).toContainText(description);
    await expect(body).toContainText(source);
    expect(await page.locator("img[src='x'], svg[onload], img[onerror]").count(), "aucun élément injecté (app courtier)").toBe(0);
    // Stored as typed (T-05).
    const view = await brokerOffer(token, id);
    expect(rec(rec(view.pending).content).name).toBe(name);
    expect(rec(rec(view.pending).content).shortDescription).toBe(description);
    expect(rec(rec(view.pending).content).sourceOfInformation).toBe(source);
    await card(page, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
    // The success notice goes away with the submit form once the version is submitted: the card text stays.
    await expect(page.getByText("En attente de validation par AssurMatch.")).toBeVisible();

    // Admin app: file and offer sheet.
    const admin = await visit(browser, complianceAccount(), "/offers?queue=submitted");
    watchDialogs(admin);
    await expect(rowWith(admin, name)).toBeVisible();
    await admin.goto(`/offers/${id}`);
    await expect(admin.locator("body")).toContainText(name);
    await expect(admin.locator("body")).toContainText(source);
    expect(await admin.locator("img[src='x'], svg[onload], img[onerror]").count(), "aucun élément injecté (app admin)").toBe(0);
    await confirmInDialog(admin, admin.locator("[data-offer-decision='validate']"), "Valider et publier", (dialog) => fillReason(dialog, REASON));
    await expect(admin.locator("[data-offer-decision='suspend']")).toBeVisible();

    // Public comparator.
    await expect.poll(async () => (await publicListing()).some((offer) => offer.id === id), { timeout: 90_000, intervals: [2_000, 5_000] }).toBe(true);
    const visitor = await appPage(browser, e2eEnv.publicUrl);
    try {
      watchDialogs(visitor);
      await visitor.goto("/pays/CI/produits/auto/offres");
      await expect(visitor.getByRole("article", { name, exact: true })).toBeVisible();
      expect(await visitor.locator("img[src='x'], svg[onload], img[onerror]").count(), "aucun élément injecté (comparateur)").toBe(0);
      const detail = await visitor.goto(`/offres/${id}`);
      expect(detail?.status()).toBeLessThan(500);
      const rawHtml = (await detail?.text()) ?? "";
      const injected = rawHtml.indexOf("onerror=alert(1)");
      publicDetailLdJson = injected >= 0 ? rawHtml.slice(Math.max(0, injected - 260), injected + 60) : "(charge img onerror absente du HTML serveur)";
      await expect(visitor.locator("body")).toContainText(name);
      expect(await visitor.locator("img[src='x'], svg[onload], img[onerror]").count(), "aucun élément injecté (fiche publique)").toBe(0);
    } finally {
      await visitor.context().close();
    }

    // T-05: injection strings in list filters answer a validation error, never a 500.
    for (const query of ["status=' OR '1'='1", "countryId='; DROP TABLE offers;--", "offerType=<script>alert(1)</script>"]) {
      const result = await offerApi(token, "GET", `/broker/offers?${query}`);
      expect(result.status, `GET /broker/offers?${query} : ${describeResult(result)}`).toBeLessThan(500);
    }
  } finally {
    if (id) await offerApi(token, "POST", `/broker/offers/${id}/withdraw`, { reason: `Nettoyage ${L3}`, target: (await brokerOffer(token, id)).status === "published" ? "offer" : "pending" });
  }
  // Every surface except the public offer sheet (see the next test) must stay inert.
  const fresh = dialogsSeen.slice(dialogsBefore);
  publicDetailDialogs = fresh.filter((entry) => entry.includes("/offres/"));
  expect(fresh.filter((entry) => !entry.includes("/offres/")), "aucune boîte de dialogue ouverte (app courtier, app admin, comparateur)").toEqual([]);
});

test("E-P3-01k-bis / T-04 aucune charge XSS ne s'exécute sur la fiche publique /offres/<id>", async () => {
  test.fail(true, "ANOMALIE E-P3-01k-bis : XSS stocké sur la fiche publique d'une offre : JsonLd échappe « < » avec la chaîne littérale unicode-escape u003c (en JavaScript elle vaut le caractère « < » lui-même : remplacement sans effet) donc « </script> » dans le nom ferme le bloc ld+json et le HTML qui suit (img onerror de la description) s'exécute (apps/public/app/components/ui/json-ld.tsx:7)");
  note(`Extrait du HTML serveur de /offres/<id> autour de la charge : ${publicDetailLdJson}`);
  expect(publicDetailDialogs, "aucune boîte de dialogue sur la fiche publique").toEqual([]);
});

test("E-P3-01l double clic sur « Créer le brouillon » : une seule offre", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const name = offerName("double-clic");
  const page = await ownerPage(browser, A, "/offers/new");
  const form = await fillCreateForm(page, formValues({ name }));
  const outcome = await submitCreateForm(page, form, { doubleClick: true });
  expect(outcome.offerId, outcome.message).toBeTruthy();
  // Let a possible second request settle before counting.
  await page.waitForTimeout(3_000);
  const matching = (await offerNames(token)).filter((candidate) => candidate === name);
  expect(matching, "une seule offre créée par le double clic").toHaveLength(1);
});

test("E-P3-01m / T-02 le courtier B n'accède jamais à l'offre du courtier A (page, API, liste)", async ({ browser }) => {
  const tokenB = await tokenFor(browser, B.owner);
  const page = await ownerPage(browser, B, `/offers/${baseOffer.id}`);
  await expect(page.getByRole("heading", { name: "Offre introuvable" })).toBeVisible();
  await expect(page.getByText("Cette offre n'existe pas ou n'appartient pas à votre cabinet.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(baseOffer.name);

  const attempts: Array<[string, () => Promise<{ status: number; text: string }>]> = [
    ["GET", () => offerApi(tokenB, "GET", `/broker/offers/${baseOffer.id}`)],
    ["PATCH", () => offerApi(tokenB, "PATCH", `/broker/offers/${baseOffer.id}`, contentPayload({ name: "Piratage B" }))],
    ["PUT", () => offerApi(tokenB, "PUT", `/broker/offers/${baseOffer.id}`, contentPayload({ name: "Piratage B" }))],
    ["POST submit", () => offerApi(tokenB, "POST", `/broker/offers/${baseOffer.id}/submit`, {})],
    ["POST withdraw", () => offerApi(tokenB, "POST", `/broker/offers/${baseOffer.id}/withdraw`, { reason: "Tentative du courtier B", target: "pending" })],
    ["POST renew", () => offerApi(tokenB, "POST", `/broker/offers/${baseOffer.id}/renew`, { validFrom: `${isoDay(1)}T00:00:00.000Z`, validUntil: `${isoDay(90)}T23:59:59.000Z` })],
    ["GET ai-summary", () => offerApi(tokenB, "GET", `/broker/offers/${baseOffer.id}/ai-summary`)]
  ];
  const statuses: string[] = [];
  for (const [label, attempt] of attempts) {
    const result = await attempt();
    statuses.push(`${label} ${result.status}`);
    expect([403, 404], `${label} : ${result.status} ${result.text.slice(0, 200)}`).toContain(result.status);
    expect(result.text, `${label} ne divulgue aucune donnée de A`).not.toContain(baseOffer.name);
  }
  const listB = await offerNames(tokenB);
  expect(listB).not.toContain(baseOffer.name);
  // A's offer is untouched.
  const tokenA = await tokenFor(browser, A.owner);
  const view = await brokerOffer(tokenA, baseOffer.id);
  expect(rec(rec(view.pending).content).name).toBe(baseOffer.name);
  expect(view.status).toBe("draft");
  note(`Statuts réels du courtier B sur l'offre de A : ${statuses.join(", ")} (l'audit cross_tenant d'offer.access_refused n'est pas relu ici).`);
});

test("E-P3-01n changer le « Type d'offre » d'une offre existante : 422", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const api = await offerApi(token, "PATCH", `/broker/offers/${baseOffer.id}`, contentPayload({ name: baseOffer.name, offerType: "private" }));
  expect(api.status, describeResult(api)).toBe(422);
  expect(errorOf(api).code).toBe("OFFER_TYPE_IMMUTABLE");
  // Screen: the type field is read-only; a forged hidden value gets the French refusal.
  const page = await ownerPage(browser, A, `/offers/${baseOffer.id}`);
  const form = editForm(page);
  await expect(form.getByLabel("Type d'offre")).toHaveAttribute("readonly", "");
  await form.locator("input[name='offerType'][type='hidden']").evaluate((node) => ((node as HTMLInputElement).value = "private"));
  await form.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  expect(await noticeText(form, "danger")).toContain("Le type d'une offre ne peut pas changer après sa création. Créez une nouvelle offre du type voulu.");
  const view = await brokerOffer(token, baseOffer.id);
  expect(view.offerType).toBe("indicative");
});

test("E-P3-01o le lecteur et l'agent ne peuvent ni créer ni enregistrer une offre", async ({ browser }) => {
  for (const [label, account] of [["lecteur", reader], ["agent", agent]] as const) {
    const token = await tokenFor(browser, account);
    const create = await ownerPageFor(browser, account, "/offers/new");
    await expect(create.getByText("Création réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement.")).toBeVisible();
    expect(await createForm(create).count(), `${label} : pas de formulaire de création`).toBe(0);
    const detail = await ownerPageFor(browser, account, `/offers/${baseOffer.id}`);
    await expect(detail.getByText("Consultation seule : seuls le propriétaire et les managers du cabinet modifient les offres.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Enregistrer le brouillon" })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Soumettre à validation" })).toHaveCount(0);

    const list = await offerApi(token, "GET", "/broker/offers");
    expect(list.status, `${label} lit la liste`).toBe(200);
    const forced = {
      create: await offerApi(token, "POST", "/broker/offers", createPayload(scope, { name: offerName(`refus-${label}`) })),
      update: await offerApi(token, "PATCH", `/broker/offers/${baseOffer.id}`, contentPayload({ name: `Modifie par ${label}` })),
      submit: await offerApi(token, "POST", `/broker/offers/${baseOffer.id}/submit`, {}),
      withdraw: await offerApi(token, "POST", `/broker/offers/${baseOffer.id}/withdraw`, { reason: `Tentative du ${label}`, target: "pending" })
    };
    for (const [action, result] of Object.entries(forced)) expect(result.status, `${label} ${action} : ${describeResult(result)}`).toBe(403);
    note(`${label} : écran « Création réservée… » / « Consultation seule… » ; API forcée : ${Object.entries(forced).map(([action, result]) => `${action} ${result.status}`).join(", ")} (« ${errorOf(forced.update).message} »). Le texte « Action réservée au propriétaire… » du scénario n'est affiché qu'après une écriture forcée, impossible depuis l'écran puisque le formulaire est absent.`);
  }
  const tokenA = await tokenFor(browser, A.owner);
  const view = await brokerOffer(tokenA, baseOffer.id);
  expect(rec(rec(view.pending).content).name, "l'offre n'a pas été modifiée").toBe(baseOffer.name);
  expect(view.status).toBe("draft");
});

async function ownerPageFor(browser: import("@playwright/test").Browser, account: BackOfficeAccount, path: string): Promise<Page> {
  const page = await visit(browser, account, path);
  watchDialogs(page);
  return page;
}

test("E-P3-02a soumettre deux fois (deux onglets) : le second reçoit 409 « Action impossible… »", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const draft = await createDraft(token, scope, { name: offerName("double-soumission") });
  submittedOffer = { id: draft.id, name: draft.name };
  const tab1 = await ownerPage(browser, A, `/offers/${draft.id}`);
  const tab2 = await tab1.context().newPage();
  watchDialogs(tab2);
  await tab2.goto(`/offers/${draft.id}`);
  await expect(card(tab2, "Actions").getByRole("button", { name: "Soumettre à validation" })).toBeVisible();

  const actions1 = card(tab1, "Actions");
  await actions1.getByRole("button", { name: "Soumettre à validation" }).click();
  // The success notice disappears with the submit form (the version is no longer a draft): the card text stays.
  await expect(tab1.getByText("En attente de validation par AssurMatch.")).toBeVisible();

  const actions2 = card(tab2, "Actions");
  await actions2.getByRole("button", { name: "Soumettre à validation" }).click();
  expect(await noticeText(actions2, "danger")).toContain("Action impossible dans l'état actuel de l'offre (version déjà soumise, aucune version en cours ou offre retirée). Rechargez la page.");
  const api = await offerApi(token, "POST", `/broker/offers/${draft.id}/submit`, {});
  expect(api.status, describeResult(api)).toBe(409);
  expect((await brokerOffer(token, draft.id)).status).toBe("submitted");
  await tab2.close();
});

test("E-P3-02d brouillon et offre en attente ne sont jamais publics (liste, API, fiche publique)", async ({ browser }) => {
  expect(submittedOffer, "E-P3-02a a soumis une offre").toBeDefined();
  const pending = submittedOffer as { id: string; name: string };
  const listing = await publicListing();
  for (const offer of [baseOffer, pending]) {
    expect(listing.map((item) => item.name), `${offer.name} absente du catalogue public (API)`).not.toContain(offer.name);
    expect(listing.map((item) => item.id)).not.toContain(offer.id);
  }
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  try {
    watchDialogs(visitor);
    await visitor.goto("/pays/CI/produits/auto/offres");
    await expect(visitor.getByRole("article", { name: baseOffer.name, exact: true })).toHaveCount(0);
    await expect(visitor.getByRole("article", { name: pending.name, exact: true })).toHaveCount(0);
    const statuses: string[] = [];
    for (const [label, offer] of [["brouillon", baseOffer], ["en attente", pending]] as const) {
      const response = await visitor.goto(`/offres/${offer.id}`);
      statuses.push(`${label} HTTP ${response?.status()}`);
      await expect(visitor.locator("body")).not.toContainText(offer.name);
      await expect(visitor.getByText("Offre indisponible").first()).toBeVisible();
      const api = await offerApi(undefined, "GET", `/offers/${offer.id}`);
      statuses.push(`API détail ${label} ${api.status}`);
      expect(api.text).not.toContain(offer.name);
    }
    note(`Fiche publique d'une offre non publiée : ${statuses.join(", ")}.`);
  } finally {
    await visitor.context().close();
  }
});

test("E-P3-02b modifier une version soumise : notice « la renvoie en brouillon », puis retour en brouillon", async ({ browser }) => {
  expect(submittedOffer, "E-P3-02a a soumis une offre").toBeDefined();
  const offer = submittedOffer as { id: string; name: string };
  const token = await tokenFor(browser, A.owner);
  expect((await brokerOffer(token, offer.id)).status).toBe("submitted");
  const page = await ownerPage(browser, A, `/offers/${offer.id}`);
  await expect(page.getByText("Cette version est en attente de validation : la modifier la renvoie en brouillon, et une nouvelle soumission sera nécessaire.")).toBeVisible();
  const form = editForm(page);
  await form.locator("textarea[name='shortDescription']").fill("Description modifiée après la soumission, prix indicatif.");
  await form.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  expect(await noticeText(form, "success")).toContain("Version enregistrée en brouillon.");
  const view = await brokerOffer(token, offer.id);
  expect(view.status).toBe("draft");
  expect(rec(view.pending).status).toBe("draft");
  expect(rec(rec(view.pending).content).shortDescription).toBe("Description modifiée après la soumission, prix indicatif.");
  await page.reload();
  await expect(card(page, "Actions").getByRole("button", { name: "Soumettre à validation" })).toBeVisible();
});

test("E-P3-02c deux onglets enregistrent l'offre : conflit de version OFFER_VERSION_CONFLICT", async ({ browser }) => {
  const token = await tokenFor(browser, A.owner);
  const draft = await createDraft(token, scope, { name: offerName("conflit") });
  const tab1 = await ownerPage(browser, A, `/offers/${draft.id}`);
  const tab2 = await tab1.context().newPage();
  watchDialogs(tab2);
  await tab2.goto(`/offers/${draft.id}`);
  await expect(editForm(tab2).locator("textarea[name='shortDescription']")).toBeVisible();

  const form1 = editForm(tab1);
  await form1.locator("textarea[name='shortDescription']").fill("Premier onglet, prix indicatif.");
  await form1.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  expect(await noticeText(form1, "success")).toContain("Version enregistrée en brouillon.");

  const form2 = editForm(tab2);
  await form2.locator("textarea[name='shortDescription']").fill("Second onglet, prix indicatif.");
  await form2.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  expect(await noticeText(form2, "danger")).toContain("Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez.");
  const view = await brokerOffer(token, draft.id);
  expect(rec(rec(view.pending).content).shortDescription, "le premier enregistrement est conservé").toBe("Premier onglet, prix indicatif.");
  // API: a stale token is refused with the dedicated code.
  const stale = await offerApi(token, "PATCH", `/broker/offers/${draft.id}`, contentPayload({ name: draft.name, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }));
  expect(stale.status, describeResult(stale)).toBe(409);
  expect(errorOf(stale).code).toBe("OFFER_VERSION_CONFLICT");
  await tab2.close();
});
