import { expect, test, type Page } from "@playwright/test";
import { api, expectStatus, itemsOfBody, rec } from "./support/admin-lot11";
import { EDGE_REASON, L2_TAG, sharedComplianceAdmin, sharedSuperAdmin, type EdgeAccount } from "./support/edge-p0p1-accounts";
import {
  PRODUCT_NAME, PUBLISHED_MARKER, VALID_CONSENT, cleanSandbox, createConsentDraft, createPlatformAccounts, ensureInternal, ensureSandbox,
  freshToken, openConsentText, publishFromDialog, type PlatformSandbox
} from "./support/edge-p0p1-platform-env";
import { openAs } from "./support/backoffice";
import { sessionPage } from "./support/pro-roles";
import { card, fillReason } from "./support/ui";

// Lot 2 / phase 0 platform edge cases (scenario section 5): consent texts, quote forms, activation checklist,
// country status and activation refusals. Nothing here touches CI or SN: the refusals are played on two sandbox
// countries (ZQ, ZR) and one sandbox product created by the spec (see support/edge-p0p1-platform-env.ts).
// The tests are independent (no serial mode); each draft it creates carries a version `l2-<n>-<timestamp>`.

const RUN = L2_TAG.replace(/^E2E Courtage L2-/u, "");
let counter = 0;
const nextVersion = (label: string): string => `l2-${label}-${RUN}-${(counter += 1)}`;

let sandbox: PlatformSandbox;
let adminPays: EdgeAccount;
let support: EdgeAccount;

/** Audit entries the tests expect (checked by T-01 at the end). */
const expectedAudit: Array<{ label: string; action: string; targetId: string }> = [];
const expectAudit = (label: string, action: string, targetId: string): void => { expectedAudit.push({ label, action, targetId }); };

test.beforeAll(async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const superAdmin = sharedSuperAdmin();
  const token = await freshToken(browser, superAdmin);
  sandbox = await ensureSandbox(token);
  // Start from a clean sandbox (leftovers of an interrupted run).
  await cleanSandbox(token, [sandbox.zqId, sandbox.zrId]);
  ({ adminPays, support } = await createPlatformAccounts(browser, superAdmin, sandbox));
});

test.afterAll(async ({ browser }) => {
  // Put back what the tests changed: every text and form created on the sandbox is retired, ZR is internal again.
  const token = await freshToken(browser, sharedSuperAdmin());
  const result = await cleanSandbox(token, [sandbox.zqId, sandbox.zrId]);
  await ensureInternal(token, sandbox.zrId);
  await ensureInternal(token, sandbox.zqId);
  test.info().annotations.push({ type: "cleanup", description: `retired ${result.consentRetired} consent text(s) and ${result.formsRetired} quote form(s) of the sandbox` });
});

async function complianceToken(browser: Parameters<typeof freshToken>[0]): Promise<string> {
  return freshToken(browser, sharedComplianceAdmin());
}

function anomaly(description: string): void {
  test.info().annotations.push({ type: "anomaly", description });
}
function hypothesis(description: string): void {
  test.info().annotations.push({ type: "hypothesis", description });
}

/** Creates a draft, opens it as the compliance admin, clicks Publish and returns the refusal shown in the dialog. */
async function publishOnScreen(browser: Parameters<typeof freshToken>[0], page: Page, content: string, label: string): Promise<{ id: string; screen: string; apiToken: string }> {
  const apiToken = await complianceToken(browser);
  const id = await createConsentDraft(apiToken, { countryId: sandbox.zrId, version: nextVersion(label), content });
  await openConsentText(page, sharedComplianceAdmin(), id);
  const screen = await publishFromDialog(page);
  return { id, screen, apiToken };
}

const LABELS = {
  summary: "Publication refusée : le texte ne respecte pas les règles de consentement listées ci-dessous.",
  recipient: "Le destinataire {{brokerName}} est absent du texte de transmission.",
  role: "Le rappel du rôle technique d'AssurMatch (ni courtier ni assureur) est absent.",
  forbidden: "Formulation réglementée interdite détectée dans le texte.",
  empty: "Contenu du texte absent : saisissez le texte complet avant publication."
};

test.describe("consent texts (E-P0-03)", () => {
  test("E-P0-03a1 texte sans {{brokerName}} : publication refusée avec le destinataire absent (écran et API 422)", async ({ browser }) => {
    const page = await sessionPage(browser, sharedComplianceAdmin());
    const { id, screen, apiToken } = await publishOnScreen(browser, page, "Je consens a la transmission de ma demande a un courtier. AssurMatch assure le role technique, ni courtier ni assureur.", "nobroker");
    expect(screen).toContain(LABELS.summary);
    expect(screen).toContain(LABELS.recipient);
    expect(screen).not.toContain(LABELS.role);
    const api422 = await api(apiToken, "POST", `/admin/consent-texts/${id}/publish`, { reason: EDGE_REASON });
    expectStatus(api422, 422, "publish without brokerName");
    expect(rec(api422.body).code).toBe("CONSENT_TEXT_INVALID");
    expectAudit("consent publication refused (no brokerName)", "consent_text.publication_refused", id);
    const detail = await api(apiToken, "GET", `/admin/consent-texts/${id}`);
    expect(rec(detail.body).status, "a refused publication leaves the draft").toBe("draft");
  });

  test("E-P0-03a2 texte sans le rappel du rôle technique d'AssurMatch : publication refusée", async ({ browser }) => {
    const page = await sessionPage(browser, sharedComplianceAdmin());
    const { id, screen } = await publishOnScreen(browser, page, "Je consens a la transmission de ma demande a {{brokerName}}.", "norole");
    expect(screen).toContain(LABELS.summary);
    expect(screen).toContain(LABELS.role);
    expect(screen).not.toContain(LABELS.recipient);
    expectAudit("consent publication refused (no technical role)", "consent_text.publication_refused", id);
  });

  test("E-P0-03a3 texte sans destinataire ni rôle : les deux motifs sont listés", async ({ browser }) => {
    const page = await sessionPage(browser, sharedComplianceAdmin());
    const { id, screen } = await publishOnScreen(browser, page, "Je consens a la transmission de ma demande.", "neither");
    expect(screen).toContain(LABELS.recipient);
    expect(screen).toContain(LABELS.role);
    expectAudit("consent publication refused (neither)", "consent_text.publication_refused", id);
  });

  test("E-P0-03b1 texte contenant « garantie acceptée » : formulation réglementée interdite", async ({ browser }) => {
    const page = await sessionPage(browser, sharedComplianceAdmin());
    const { id, screen } = await publishOnScreen(browser, page, "Je consens a la transmission a {{brokerName}}. Garantie acceptée. AssurMatch assure le role technique, ni courtier ni assureur.", "garantie");
    expect(screen).toContain(LABELS.summary);
    expect(screen).toContain(LABELS.forbidden);
    expectAudit("consent publication refused (garantie acceptée)", "consent_text.publication_refused", id);
  });

  test("E-P0-03b2 texte contenant « contrat valide » (sans accent) : refusé ; avec accent « contrat validé » : doit l'être aussi", async ({ browser }) => {
    const page = await sessionPage(browser, sharedComplianceAdmin());
    const plain = await publishOnScreen(browser, page, "Je consens a la transmission a {{brokerName}}. Contrat valide. AssurMatch assure le role technique, ni courtier ni assureur.", "contrat-sans-accent");
    expect(plain.screen).toContain(LABELS.forbidden);
    expectAudit("consent publication refused (contrat valide)", "consent_text.publication_refused", plain.id);

    // The scenario names the accented form: it is the one the editors actually write.
    const accented = await publishOnScreen(browser, page, "Je consens a la transmission a {{brokerName}}. Contrat validé. AssurMatch assure le role technique, ni courtier ni assureur.", "contrat-accent");
    if (accented.screen === PUBLISHED_MARKER) {
      anomaly("consent publication accepts « contrat validé » (accent): packages/shared/contracts/consent-content.ts:77 calls the raw findForbiddenWording (lower-case + includes, accent-sensitive) instead of findForbiddenWordingAnyLanguage (content-safety.ts:233, accent-insensitive) used elsewhere. Proposed fix: replace the call by findForbiddenWordingAnyLanguage(content). The published text is retired by the cleanup of this spec.");
    }
    expect(accented.screen, "« contrat validé » must be refused as regulated wording").toContain(LABELS.forbidden);
  });

  test("E-P0-03b3 texte vide : refusé dès la création (400), « Contenu du texte absent » n'est pas atteignable depuis l'écran", async ({ browser }) => {
    const token = await complianceToken(browser);
    for (const content of ["", "   \n  "]) {
      const created = await api(token, "POST", "/admin/consent-texts", {
        purpose: "lead_transmission", countryId: sandbox.zrId, recipientCategory: "courtier_partenaire_agree", language: "fr", version: nextVersion("empty"), content, reason: EDGE_REASON
      });
      expectStatus(created, 400, `create consent with content ${JSON.stringify(content)}`);
    }
    hypothesis(`The scenario expects « ${LABELS.empty} » on publication of an empty text. The create schema (compliance.contracts.ts:39, content trim().min(1)) refuses an empty draft with 400 VALIDATION_FAILED, so a draft without content cannot exist; content_missing only concerns legacy hash-only rows (detail page: « Texte sans contenu »). Not reachable through the screens or the API without a database write.`);
  });

  test("E-P0-03c admin_pays : publication d'un consentement refusée (API 403, écran sans bouton « Publier »)", async ({ browser }) => {
    const token = await complianceToken(browser);
    const id = await createConsentDraft(token, { countryId: sandbox.zrId, version: nextVersion("ap"), content: VALID_CONSENT });
    const apToken = await freshToken(browser, adminPays);
    const refused = await api(apToken, "POST", `/admin/consent-texts/${id}/publish`, { reason: EDGE_REASON });
    expectStatus(refused, 403, "admin_pays publishes a consent text");
    expectAudit("consent publication refused (admin_pays)", "consent_text.publication_refused", id);

    const page = await sessionPage(browser, adminPays);
    await openConsentText(page, adminPays, id);
    await expect(page.getByRole("button", { name: "Publier" })).toHaveCount(0);
    await expect(page.getByText(/réservé(e)?s? à la conformité/u).first()).toBeVisible();
    const after = await api(token, "GET", `/admin/consent-texts/${id}`);
    expect(rec(after.body).status, "the draft was not published").toBe("draft");
  });
});

test.describe("quote form labels (E-P0-04)", () => {
  test("E-P0-04a libellé « acheter maintenant » : la publication du formulaire est refusée (écran), le brouillon reste", async ({ browser }) => {
    const compliance = sharedComplianceAdmin();
    const token = await complianceToken(browser);
    // A valid published consent text on the sandbox country ZR is needed to link a form (retired by the cleanup).
    const consentId = await createConsentDraft(token, { countryId: sandbox.zrId, version: nextVersion("form-consent"), content: VALID_CONSENT });
    expectStatus(await api(token, "POST", `/admin/consent-texts/${consentId}/publish`, { reason: EDGE_REASON }), 200, "publish the sandbox consent text");

    const page = await sessionPage(browser, compliance);
    await openAs(page, compliance, "/quote-form-definitions");
    const version = nextVersion("form");
    const create = page.locator("form[data-quote-form='create']");
    await create.getByLabel("Pays (UUID)").fill(sandbox.zrId);
    await create.getByLabel("Produit (UUID)").fill(sandbox.productId);
    await create.getByLabel("Langue").fill("fr");
    await create.getByLabel("Version").fill(version);
    await create.getByLabel("Texte de consentement publié (UUID)").fill(consentId);
    await create.getByLabel(/^Champs/).fill("l2_field|Acheter maintenant votre garantie|text|true|public|");
    await fillReason(create, EDGE_REASON);
    await create.getByRole("button", { name: "Créer le brouillon" }).click();
    const created = create.locator(".bo-notice[data-tone='success'], .bo-notice[data-tone='danger']").first();
    await expect(created).toBeVisible({ timeout: 30_000 });
    const createdText = (await created.innerText()).replace(/\s+/gu, " ");
    const formId = createdText.match(/Brouillon créé: ([0-9a-f-]{36})/u)?.[1];
    expect(formId, `draft creation notice: ${createdText}`).toBeTruthy();

    await page.goto("/quote-form-definitions");
    const publish = page.locator("form[data-quote-form='publish']");
    await publish.getByLabel("Formulaire").selectOption(formId as string);
    await fillReason(publish, EDGE_REASON);
    await publish.getByRole("button", { name: "Publier", exact: true }).click();
    const refusal = publish.locator(".bo-notice[data-tone='danger'], .bo-notice[data-tone='success']").first();
    await expect(refusal).toBeVisible({ timeout: 30_000 });
    expect(await refusal.getAttribute("data-tone"), "the form with a regulated label must not publish").toBe("danger");
    const shown = (await refusal.innerText()).replace(/\s+/gu, " ").trim();

    const api400 = await api(token, "POST", `/admin/quote-form-definitions/${formId}/publish`, { reason: EDGE_REASON });
    const list = await api(token, "GET", `/admin/quote-form-definitions?countryId=${sandbox.zrId}`);
    const stored = itemsOfBody(list.body).find((form) => form.id === formId);
    expect(stored?.status, "refused publication leaves the draft").toBe("draft");
    expect(api400.status, `publish API refusal: ${api400.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);

    // The message is the quality criterion of this case: the scenario expects the regulated wording to be named.
    const wordingNamed = /formulation (interdite|réglementée)/iu.test(shown);
    if (!wordingNamed || api400.status === 400) {
      anomaly(`quote form publication with a regulated label is refused with HTTP ${api400.status} ${String(rec(api400.body).code)} and the publish form shows the raw text « ${shown} » (no explanation, no named wording). quote-form-definition.service.ts:371-374 throws a bare Error (mapped to 400 VALIDATION_FAILED) instead of a 422 FORBIDDEN_WORDING (the admin message table already maps this code, catalog-messages.ts:« Texte refusé : il contient une formulation interdite », but the quote-form publish action prints the raw api_<status>: apps/admin/app/quote-form-definitions/actions.ts:28-29 actionError + lib/admin-api.ts:92/116 throw api_<status>). Proposed fix: throw unprocessable(ErrorCodes.FORBIDDEN_WORDING, ..., { wording }).`);
    }
    expect.soft(wordingNamed, `screen message should name the regulated wording, got: ${shown}`).toBe(true);
    expectAudit("quote form publication refused (label)", "quote_form.publication_refused", formId as string);
  });

  test("E-P0-04b libellé « votre contrat validé » (accent) : doit aussi être refusé à la publication", async ({ browser }) => {
    const token = await complianceToken(browser);
    const consentId = await createConsentDraft(token, { countryId: sandbox.zrId, version: nextVersion("form2-consent"), content: VALID_CONSENT });
    expectStatus(await api(token, "POST", `/admin/consent-texts/${consentId}/publish`, { reason: EDGE_REASON }), 200, "publish the sandbox consent text");
    const created = await api(token, "POST", "/admin/quote-form-definitions", {
      countryId: sandbox.zrId, productId: sandbox.productId, language: "fr", version: nextVersion("form2"), consentTextId: consentId, reason: EDGE_REASON,
      fields: [{ key: "l2_field", label: "Votre contrat validé", type: "text", required: true, sensitivity: "public" }]
    });
    expectStatus(created, 201, "create the draft");
    const formId = String(rec(created.body).id);
    const publish = await api(token, "POST", `/admin/quote-form-definitions/${formId}/publish`, { reason: EDGE_REASON });
    if (publish.status < 300) {
      anomaly("quote form publication accepts the label « Votre contrat validé » (accent): quote-form-definition.service.ts:371 uses the raw findForbiddenWording (accent-sensitive, content-safety.ts:17) instead of findForbiddenWordingAnyLanguage. Proposed fix: use findForbiddenWordingAnyLanguage(field.label). The published form (sandbox country ZR) is retired by the cleanup.");
    }
    expect(publish.status, `publish -> ${publish.status} ${publish.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
  });
});

test.describe("activation attestations (E-P0-05)", () => {
  test("E-P0-05a note trop courte (moins de 10 caractères, moins de 30 pour le plan de désactivation) : refus, rien n'est écrit", async ({ browser }) => {
    const token = await complianceToken(browser);
    const attempts: Array<{ controlKey: string; note: string; reasonCode: string }> = [
      { controlKey: "country_support_ready", note: "abcdefghi", reasonCode: "9 chars" },
      { controlKey: "country_notifications_tested", note: "court", reasonCode: "5 chars" },
      { controlKey: "country_deactivation_plan", note: "a".repeat(29), reasonCode: "29 chars (plan: 30 min)" },
      { controlKey: "country_deactivation_plan", note: "abcdefghij", reasonCode: "10 chars (plan: 30 min)" }
    ];
    for (const attempt of attempts) {
      const result = await api(token, "POST", "/admin/activation-attestations", { scopeType: "country", scopeId: sandbox.zrId, controlKey: attempt.controlKey, note: attempt.note });
      expect(result.status, `${attempt.controlKey} ${attempt.reasonCode} -> ${result.status} ${result.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(result.status, `${attempt.controlKey}: a short note is a client-side refusal`).toBeLessThan(500);
      if (result.status !== 400) hypothesis(`short note refused with HTTP ${result.status} ${String(rec(result.body).code)} (scenario only says « refus »): ${result.text.slice(0, 120)}`);
    }
    const list = await api(token, "GET", `/admin/activation-attestations?scopeType=country&scopeId=${sandbox.zrId}`);
    expectStatus(list, 200, "list attestations");
    expect((rec(list.body).attestations as unknown[]).length, "no attestation was written").toBe(0);
    expectAudit("attestation refused (short note)", "activation_attestation.refused", `country:${sandbox.zrId}:country_deactivation_plan`);
  });

  test("E-P0-05b admin_pays et support_admin : attestation refusée (403)", async ({ browser }) => {
    for (const [label, account] of [["admin_pays", adminPays], ["support_admin", support]] as const) {
      const token = await freshToken(browser, account);
      const note = "Verifie lors du controle E2E L2, dossier de conformite interne";
      const refused = await api(token, "POST", "/admin/activation-attestations", { scopeType: "country", scopeId: sandbox.zrId, controlKey: "country_support_ready", note });
      expectStatus(refused, 403, `${label} attests`);
    }
    const compliance = await complianceToken(browser);
    const list = await api(compliance, "GET", `/admin/activation-attestations?scopeType=country&scopeId=${sandbox.zrId}`);
    expect((rec(list.body).attestations as unknown[]).length, "nothing was written by the refused roles").toBe(0);
    expectAudit("attestation refused (rbac)", "activation_attestation.refused", `country:${sandbox.zrId}:country_support_ready`);
  });
});

test.describe("country status and activation refusals (E-P0-06)", () => {
  test("E-P0-06a1 internal -> public refusé (API) : 422 ACTIVATION_BLOCKED tant que la checklist a des blocages ; l'écran n'offre pas « public »", async ({ browser }) => {
    const superAdmin = sharedSuperAdmin();
    const token = await freshToken(browser, superAdmin);
    await ensureInternal(token, sandbox.zqId);
    const refused = await api(token, "POST", `/admin/countries/${sandbox.zqId}/status`, { status: "public", reason: EDGE_REASON });
    expect(refused.status, `internal -> public: ${refused.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    if (refused.status !== 409) {
      hypothesis(`The scenario expects 409 « Country status transition internal -> public is not allowed ». The API answers ${refused.status} ${String(rec(refused.body).code)}: catalog-admin.service.ts:103-109 evaluates the activation checklist BEFORE the transition graph (countries.module.ts:127), so a country with blocking controls never reaches the graph check; the 409 only shows when the checklist is green. Code is authoritative: asserting the real answer.`);
      expect(refused.status).toBe(422);
      expect(rec(refused.body).code).toBe("ACTIVATION_BLOCKED");
    }
    expectAudit("country status refused (internal -> public)", "country.status_change_refused", sandbox.zqId);

    const page = await sessionPage(browser, superAdmin);
    await openAs(page, superAdmin, `/catalog/countries/${sandbox.zqId}`);
    const options = await card(page, "Statut du pays").getByLabel("Nouveau statut").locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(options, "the status form never offers a transition the graph forbids").not.toContain("public");
    expect(options).toEqual(expect.arrayContaining(["partner_test", "pilot"]));
    const detail = await api(token, "GET", `/admin/countries/${sandbox.zqId}`);
    expect(rec(detail.body).status, "a refusal changes nothing").toBe("internal");
  });

  test("E-P0-06a2 transition interdite (draft -> pilot) : 409 « Country status transition draft -> pilot is not allowed »", async ({ browser }) => {
    const token = await freshToken(browser, sharedSuperAdmin());
    const created = await api(token, "GET", "/admin/countries");
    expectStatus(created, 200, "countries");
    // A fresh draft country is needed: ZR/ZQ are internal. Reuse ZS when it exists.
    let draft = itemsOfBody(created.body).find((country) => country.isoCode === "ZS");
    if (!draft) {
      const made = await api(token, "POST", "/admin/countries", { isoCode: "ZS", name: "Zonedraft E2E L2", currency: "XOF", languages: ["fr"], timezone: "Africa/Abidjan", regulatoryFamily: "future", reason: EDGE_REASON });
      expectStatus(made, 201, "create ZS");
      draft = rec(made.body);
    }
    expect(draft.status, "ZS must stay draft (never promoted by this spec)").toBe("draft");
    const refused = await api(token, "POST", `/admin/countries/${String(draft.id)}/status`, { status: "pilot", reason: EDGE_REASON });
    expectStatus(refused, 409, "draft -> pilot");
    expect(String(rec(refused.body).message)).toBe("Country status transition draft -> pilot is not allowed");
    expectAudit("country status refused (draft -> pilot)", "country.status_change_refused", String(draft.id));
  });

  test("E-P0-06a3 écran : formulaire de statut périmé (transition devenue interdite) : « Conflit : cet élément existe déjà… »", async ({ browser }) => {
    const superAdmin = sharedSuperAdmin();
    const token = await freshToken(browser, superAdmin);
    await ensureInternal(token, sandbox.zrId);
    const page = await sessionPage(browser, superAdmin);
    await openAs(page, superAdmin, `/catalog/countries/${sandbox.zrId}`);
    const statusCard = card(page, "Statut du pays");
    try {
      // The page was rendered at `internal` (offers partner_test); the country is suspended meanwhile: suspended -> partner_test is not in the graph.
      expectStatus(await api(token, "POST", `/admin/countries/${sandbox.zrId}/status`, { status: "suspended", reason: EDGE_REASON }), 200, "suspend ZR");
      await statusCard.getByLabel("Nouveau statut").selectOption("partner_test");
      await fillReason(statusCard, EDGE_REASON);
      await statusCard.getByRole("button", { name: "Changer le statut" }).click();
      const notice = statusCard.locator(".bo-notice[data-tone='danger']").first();
      await expect(notice).toBeVisible({ timeout: 30_000 });
      await expect(notice).toContainText("Conflit : cet élément existe déjà ou son état actuel ne permet pas cette action. Rechargez la page pour voir l'état à jour.");
      expectAudit("country status refused (stale form)", "country.status_change_refused", sandbox.zrId);
    } finally {
      await ensureInternal(token, sandbox.zrId);
    }
  });

  test("E-P0-06c admin_pays : passage d'un pays en public refusé (403, rien ne change)", async ({ browser }) => {
    const token = await freshToken(browser, adminPays);
    const refused = await api(token, "POST", `/admin/countries/${sandbox.zqId}/status`, { status: "public", reason: EDGE_REASON });
    expectStatus(refused, 403, "admin_pays opens a country");
    expectAudit("country status refused (admin_pays public)", "country.status_change_refused", sandbox.zqId);
    const check = await api(await freshToken(browser, sharedSuperAdmin()), "GET", `/admin/countries/${sandbox.zqId}`);
    expect(rec(check.body).status).toBe("internal");
  });

  test("E-P0-06d1 country_quote_enabled sans formulaire publié : « Activation refusée : aucun formulaire de devis publié… » (écran et API 422)", async ({ browser }) => {
    const superAdmin = sharedSuperAdmin();
    const page = await sessionPage(browser, superAdmin);
    await openAs(page, superAdmin, `/catalog/countries/${sandbox.zqId}`);
    const form = page.locator('form[data-catalog-flag-form="country_quote_enabled"]').first();
    await expect(form.getByRole("button", { name: /^Activer :/u })).toBeVisible();
    await fillReason(form, EDGE_REASON);
    await form.getByRole("button", { name: /^Activer :/u }).click();
    const notice = form.locator(".bo-notice[data-tone='danger'], .bo-notice[data-tone='success']").first();
    await expect(notice).toBeVisible({ timeout: 30_000 });
    expect(await notice.getAttribute("data-tone"), "country_quote_enabled must be refused without a published form").toBe("danger");
    await expect(notice).toContainText("Activation refusée : aucun formulaire de devis publié pour ce pays et ce produit.");

    const token = await freshToken(browser, superAdmin);
    const refused = await api(token, "POST", `/admin/countries/${sandbox.zqId}/flags`, { key: "country_quote_enabled", value: true, reason: EDGE_REASON });
    expectStatus(refused, 422, "country_quote_enabled");
    expect(rec(refused.body).code).toBe("QUOTE_FORM_REQUIRED");
    const country = await api(token, "GET", `/admin/countries/${sandbox.zqId}`);
    expect(rec(rec(country.body).flags).country_quote_enabled, "flag unchanged").toBe(false);
    expectAudit("country flag refused (quote form)", "country.flag_changed", sandbox.zqId);
  });

  test("E-P0-06d2 product_public_enabled sans consentement lead_transmission publié : « Activation refusée : aucun texte de consentement… »", async ({ browser }) => {
    const superAdmin = sharedSuperAdmin();
    const page = await sessionPage(browser, superAdmin);
    await openAs(page, superAdmin, `/catalog/countries/${sandbox.zqId}`);
    const link = card(page, `Liaison ZQ × ${PRODUCT_NAME}`);
    const form = link.locator('form[data-catalog-flag-form="product_public_enabled"]').first();
    await expect(form.getByRole("button", { name: /^Activer :/u })).toBeVisible();
    await fillReason(form, EDGE_REASON);
    await form.getByRole("button", { name: /^Activer :/u }).click();
    const notice = form.locator(".bo-notice[data-tone='danger'], .bo-notice[data-tone='success']").first();
    await expect(notice).toBeVisible({ timeout: 30_000 });
    expect(await notice.getAttribute("data-tone"), "product_public_enabled must be refused without a published consent text").toBe("danger");
    await expect(notice).toContainText("Activation refusée : aucun texte de consentement de transmission publié pour ce pays.");

    const token = await freshToken(browser, superAdmin);
    const refused = await api(token, "POST", `/admin/countries/${sandbox.zqId}/products/${sandbox.productId}/flags`, { key: "product_public_enabled", value: true, reason: EDGE_REASON });
    expectStatus(refused, 422, "product_public_enabled");
    expect(rec(refused.body).code).toBe("CONSENT_TEXT_REQUIRED");
    const links = await api(token, "GET", `/admin/countries/${sandbox.zqId}/products`);
    const link0 = itemsOfBody(links.body).find((item) => item.productId === sandbox.productId);
    expect(rec(rec(link0).flags).product_public_enabled, "flag unchanged").toBe(false);
    expectAudit("link flag refused (consent text)", "country_product.flag_changed", `${sandbox.productId}@${sandbox.zqId}`);
  });
});

test("T-01 (plateforme) : les refus déclenchés apparaissent dans le journal d'audit avec acteur, cible et résultat", async ({ browser }) => {
  test.skip(expectedAudit.length === 0, "no refusal was recorded by the previous tests");
  const token = await freshToken(browser, sharedSuperAdmin());
  const missing: string[] = [];
  for (const expected of expectedAudit) {
    const found = await api(token, "GET", `/admin/audit-logs?targetId=${encodeURIComponent(expected.targetId)}&action=${encodeURIComponent(expected.action)}&pageSize=100`);
    expectStatus(found, 200, `audit ${expected.label}`);
    const entries = itemsOfBody(found.body).filter((entry) => entry.action === expected.action && entry.targetId === expected.targetId);
    const refused = entries.filter((entry) => entry.result === "refused");
    if (refused.length === 0) {
      missing.push(`${expected.label}: no « ${expected.action} » refused entry for ${expected.targetId} (found ${entries.length} entries, results ${entries.map((entry) => String(entry.result)).join(",")})`);
      continue;
    }
    const entry = refused[0] as Record<string, unknown>;
    expect(String(entry.actorId ?? ""), `${expected.label}: actor`).not.toBe("");
    expect(String(entry.targetType ?? ""), `${expected.label}: target type`).not.toBe("");
    expect(String(entry.reason ?? ""), `${expected.label}: refusal reason`).not.toBe("");
  }
  if (missing.length > 0) {
    anomaly(`refusals not found in the audit log: ${missing.join(" | ")}`);
  }
  expect(missing, "every triggered refusal is audited").toEqual([]);

  // The screen lists them too (compliance console).
  const page = await sessionPage(browser, sharedSuperAdmin());
  await openAs(page, sharedSuperAdmin(), "/compliance/audit-logs");
  await expect(page.getByText(/consent_text\.publication_refused|activation_attestation\.refused|country\.status_change_refused/u).first()).toBeVisible();
});
