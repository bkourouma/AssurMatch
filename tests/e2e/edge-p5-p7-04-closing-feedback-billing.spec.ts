import { expect, test, type Browser, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import {
  adminApi,
  adminSessionToken,
  allMailSummaries,
  closeTokenPages,
  closeLeadViaUi,
  ensureAdminAccount,
  urlsOf,
  visibleTextWithoutLinks,
  waitSurveyLinks,
  withoutCorrelation
} from "./support/edge-p5p7-closing";
import { createLead, ensureL4Firm, ensureRateBudget, loadFirm, note, publicScopeUsage, reserveTrackingViews, saveFirm, tokenOfLink, type L4Lead } from "./support/edge-p5p7-support";
import type { BrokerWorld } from "./support/journey-state";
import { extractLink, readMessage, searchMessages, waitForMail } from "./support/mailpit";
import { apiCall, bearerToken, closeSessions, tokenFor, visit } from "./support/pro-roles";
import { loadJourneyState, requireState } from "./support/journey-state";
import { adminBearerToken, publicCall } from "./support/recos-062b";
import { card, confirmInDialog, uniqueSuffix } from "./support/ui";
import { appPage, complianceAccount, inviteMember, isoDate, provisionBroker, superAdminAccount } from "./support/world";

// Lot 4 / file 04 - phase 7 (closing, feedback survey, billing), E-P5-04 (tracking tokens), T-01, T-03, T-07
// (scenario lines 308-313, 389-406, 410-418). Own firms (l4f, l4fb) and own leads; nothing here touches the
// base journey or the invoices of the other firms. No rate limit is ever pushed to its ceiling.
//   E-P7-01a/01b  closing: issue, 500 characters, closing twice, read-only conversation, documents closed
//   E-P7-02a..02d feedback survey (rating, token, alert, opt-out)
//   E-P5-04b/04d/04e + T-03  tracking tokens and cross-visitor probes
//   E-P7-03a..03d finance: empty draft, payments, credit note, roles, MFA
//   T-01 audit trail, T-07 e-mails of the visitors

test.describe.configure({ mode: "serial" });

const SUFFIX = uniqueSuffix();
const RUN_START = new Date().toISOString();
const NEUTRAL_TRACKING = "Ce lien de suivi ne permet pas d'afficher une demande";
const SURVEY_GONE = "Ce questionnaire n'est plus disponible";
const CONFLICT_NOTICE = "Opération refusée: état de la facture incompatible (déjà facturé, déjà payée, montant supérieur au solde ou facture non réglée).";

let firm: BrokerWorld;
const leads = new Map<string, L4Lead>();
const visitorPages = new Map<string, Page>();
const closed = new Set<string>();

async function lead(browser: Browser, key: "a" | "b" | "c" | "d"): Promise<L4Lead> {
  const known = leads.get(key);
  if (known) return known;
  if (!firm) firm = await ensureL4Firm(browser, "l4f", "l4f");
  const created = await createLead(browser, firm, `l4f${key}`, { accept: true });
  leads.set(key, created);
  return created;
}

/** One tracking page opening per key for the whole file (60 consultations per hour per IP, shared). */
async function visitorPage(browser: Browser, key: string, target: L4Lead): Promise<Page> {
  const known = visitorPages.get(key);
  if (known && !known.isClosed()) return known;
  reserveTrackingViews(1, `edge-04 ${key}`);
  const page = await appPage(browser, e2eEnv.publicUrl);
  await page.goto(target.trackingLink);
  visitorPages.set(key, page);
  return page;
}

async function brokerPage(browser: Browser, assignmentId: string): Promise<Page> {
  return visit(browser, firm.owner, `/leads/${assignmentId}`);
}

async function closeWon(browser: Browser, key: "b" | "c" | "d"): Promise<void> {
  if (closed.has(key)) return;
  const target = await lead(browser, key);
  const page = await brokerPage(browser, target.assignmentId);
  await closeLeadViaUi(page, firm.owner, target.assignmentId, "gagne", `Clôture de contrôle L4 ${key} ${SUFFIX}`);
  closed.add(key);
}

test.afterAll(async () => {
  for (const page of visitorPages.values()) await page.context().close().catch(() => undefined);
  await closeSessions();
  await closeTokenPages();
});

// ---------------------------------------------------------------------------------------------
// E-P7-01a / E-P7-01b: closing the lead A
// ---------------------------------------------------------------------------------------------

test("E-P7-01a clôture sans issue, commentaire de 501 caractères, clôture répétée", async ({ browser }) => {
  firm = await ensureL4Firm(browser, "l4f", "l4f");
  const a = await lead(browser, "a");
  const page = await brokerPage(browser, a.assignmentId);
  const token = await bearerToken(page);
  const closeUrl = `/broker/starter/leads/${a.assignmentId}/close`;

  // Something to close afterwards (E-P7-01b): a message and an open document request.
  const message = await apiCall(token, "POST", `/broker/starter/leads/${a.assignmentId}/conversation/messages`, { body: `Échange avant clôture L4F ${SUFFIX}` });
  expect(message.status, `message before closing -> ${message.text.slice(0, 200)}`).toBe(201);
  const request = await apiCall(token, "POST", `/broker/starter/leads/${a.assignmentId}/document-requests`, { label: `Pièce L4F ${SUFFIX}` });
  expect(request.status, `document request before closing -> ${request.text.slice(0, 200)}`).toBe(201);

  // 1. No issue: the browser blocks the dialog (required select); the API refuses too.
  await card(page, "Actions Starter").getByRole("button", { name: "Clôturer" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Clôturer le lead" }).last().click();
  expect(await dialog.locator("#close-outcome").evaluate((el) => (el as HTMLSelectElement).validity.valueMissing), "native required check on the issue").toBe(true);
  await expect(dialog).toBeVisible();
  expect(await dialog.locator("#close-comment").getAttribute("maxlength")).toBe("500");
  await dialog.getByRole("button", { name: /Annuler|Fermer/u }).first().click();
  const noIssue = await apiCall(token, "POST", closeUrl, {});
  expect(noIssue.status, `close without issue -> ${noIssue.text.slice(0, 200)}`).toBe(400);
  const badIssue = await apiCall(token, "POST", closeUrl, { outcome: "inconnu" });
  expect(badIssue.status, `close with an unknown issue -> ${badIssue.text.slice(0, 200)}`).toBe(400);

  // 2. 501 characters: refused by the API, nothing closed.
  const tooLong = await apiCall(token, "POST", closeUrl, { outcome: "gagne", comment: "c".repeat(501) });
  expect(tooLong.status, `close with 501 characters -> ${tooLong.text.slice(0, 200)}`).toBe(400);
  await page.reload();
  await expect(card(page, "Actions Starter").getByRole("button", { name: "Clôturer" }).first()).toBeVisible();

  // 3. The three issues are offered; "Gagné" with exactly 500 characters closes.
  await card(page, "Actions Starter").getByRole("button", { name: "Clôturer" }).first().click();
  const options = await page.locator("dialog[open] #close-outcome option").allInnerTexts();
  expect(options.join("|")).toContain("Gagné");
  expect(options.join("|")).toContain("Perdu");
  expect(options.join("|")).toContain("Sans suite");
  await page.locator("dialog[open]").getByRole("button", { name: /Annuler|Fermer/u }).first().click();
  await closeLeadViaUi(page, firm.owner, a.assignmentId, "gagne", "c".repeat(500));
  closed.add("a");
  await expect(card(page, "Informations utiles")).toContainText("Clôturé");

  // 4. Closing again: the screen is read-only, the API refuses (409 LEAD_CLOSED).
  await expect(card(page, "Actions Starter")).toContainText("Ce lead est clôturé: aucune action courtier n'est plus possible.");
  await expect(card(page, "Actions Starter").getByRole("button", { name: "Clôturer" })).toHaveCount(0);
  const again = await apiCall(token, "POST", closeUrl, { outcome: "perdu" });
  expect(again.status, `second closing -> ${again.text.slice(0, 200)}`).toBe(409);
  expect(again.text).toContain("LEAD_CLOSED");
  note(`E-P7-01a clôture sans issue API -> 400 ${withoutCorrelation(noIssue.text).slice(0, 160)} ; 501 car. -> 400 ${withoutCorrelation(tooLong.text).slice(0, 160)} ; re-clôture -> 409 ${withoutCorrelation(again.text).slice(0, 160)}`);
});

test("E-P7-01b après clôture : courtier « aucun message ni demande », visiteur « Conversation en lecture seule », documents demandés fermés", async ({ browser }) => {
  const a = await lead(browser, "a");
  const page = await brokerPage(browser, a.assignmentId);
  const token = await bearerToken(page);

  // The messaging flag is shared by every lot and stays as it is (the spec never touches it).
  const forcedMessage = await apiCall(token, "POST", `/broker/starter/leads/${a.assignmentId}/conversation/messages`, { body: "Message après clôture L4F" });
  expect(forcedMessage.status, `message after closing -> ${forcedMessage.text.slice(0, 200)}`).toBe(409);
  expect(forcedMessage.text).toContain("LEAD_CLOSED");
  const forcedRequest = await apiCall(token, "POST", `/broker/starter/leads/${a.assignmentId}/document-requests`, { label: "Demande après clôture L4F" });
  expect(forcedRequest.status, `document request after closing -> ${forcedRequest.text.slice(0, 200)}`).toBe(409);
  expect(forcedRequest.text).toContain("LEAD_CLOSED");

  // What the composer relay answers (the page lands on ?conv=lead_closed without JavaScript).
  const relayed = await page.evaluate(async (action) => {
    const data = new FormData();
    data.set("body", "Message par le relais après clôture");
    const response = await fetch(action, { method: "POST", body: data, headers: { accept: "application/json" }, credentials: "same-origin" });
    return { status: response.status, json: (await response.json()) as { ok?: boolean; outcome?: string } };
  }, `/leads/${a.assignmentId}/conversation/messages`);
  expect(relayed.json.outcome, JSON.stringify(relayed)).toBe("lead_closed");
  await page.goto(`/leads/${a.assignmentId}?conv=lead_closed`);
  await expect(page.getByText("Ce lead est clôturé : aucun message ni demande ne peut être envoyé.").first()).toBeVisible();
  await expect(page.getByText("Ce lead est clôturé : la conversation est en lecture seule.").first()).toBeVisible();
  await expect(page.locator("form[aria-label='Nouveau message au visiteur']")).toHaveCount(0);
  await expect(page.locator("form[aria-label='Nouvelle demande de document']")).toHaveCount(0);

  // Visitor: read-only conversation, requested document closed.
  const visitor = await visitorPage(browser, "a", a);
  await expect(visitor.locator("#conversation").getByText("Conversation en lecture seule")).toBeVisible();
  await expect(visitor.locator("#conversation form[data-form='visitor-message']")).toHaveCount(0);
  await expect(visitor.locator("#conversation")).toContainText("Cette demande est clôturée : vous pouvez relire les échanges, mais plus en envoyer.");
  const documents = visitor.locator("#documents-demandes article");
  await expect(documents.first()).toHaveAttribute("data-request-status", "cancelled");
  await expect(visitor.locator("#documents-demandes input[type='file']")).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------
// E-P7-02a / 02b: survey of the visitor A
// ---------------------------------------------------------------------------------------------

test("E-P7-02a avis : sans note, commentaire de 1001 caractères", async ({ browser }) => {
  const a = await lead(browser, "a");
  const links = await waitSurveyLinks(a.email);
  const reference = links.reference;
  const visitor = await appPage(browser, e2eEnv.publicUrl);

  // Server: no rating -> refused with the documented sentence (valid token, survey still open).
  ensureRateBudget("consent_withdrawal", 5, 1, "E-P7-02a API without rating");
  const noRating = await publicCall("POST", `/satisfaction-surveys/${reference}`, { token: links.token, json: { comment: "sans note" } });
  note(`E-P7-02a API sans note -> ${noRating.status} ${withoutCorrelation(noRating.text).slice(0, 220)}`);
  expect(noRating.status, `survey without rating -> ${noRating.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
  expect(noRating.text).toContain("Rating must be an integer between 1 and 5");

  // Screen: "Choisissez une note de 1 à 5." and no request leaves the page.
  await visitor.goto(links.feedbackLink);
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText(reference);
  const posts: string[] = [];
  visitor.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/satisfaction-surveys/")) posts.push(request.url());
  });
  await visitor.getByRole("button", { name: "Envoyer mon avis" }).click();
  await expect(visitor.getByText("Choisissez une note de 1 à 5.")).toBeVisible();
  expect(posts, "no request for a survey without rating").toHaveLength(0);

  // 1001 characters: the field stops at 1000 and the request carries 1000 at most.
  const comment = visitor.getByLabel("Commentaire (optionnel)");
  await comment.fill("x".repeat(1001));
  const typed = await comment.inputValue();
  note(`E-P7-02a commentaire de 1001 caractères saisi : le champ en garde ${typed.length}`);
  expect(typed.length).toBeLessThanOrEqual(1000);
  await visitor.getByLabel("4 - Satisfait").check({ force: true });
  ensureRateBudget("consent_withdrawal", 5, 1, "E-P7-02a UI submit");
  const submitted = visitor.waitForRequest((request) => request.method() === "POST" && request.url().includes("/satisfaction-surveys/"));
  await visitor.getByRole("button", { name: "Envoyer mon avis" }).click();
  const sent = JSON.parse((await submitted).postData() ?? "{}") as { rating?: number; comment?: string };
  expect(sent.rating).toBe(4);
  expect((sent.comment ?? "").length).toBeLessThanOrEqual(1000);
  await expect(visitor.getByText("Merci pour votre avis")).toBeVisible();
  await expect(visitor.getByText("Votre réponse est enregistrée.")).toBeVisible();
  await visitor.context().close();

  // The server never keeps more than 1000 characters: a long comment sent straight to the API is cut, not refused
  // (second POST of an already answered survey: nothing is modified, see E-P7-02b).
});

test("E-P7-02b avis : lien rouvert, jeton falsifié, référence inconnue, second POST", async ({ browser }) => {
  const a = await lead(browser, "a");
  const links = await waitSurveyLinks(a.email);
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const partnerName = firm.partnerName;

  // Reopened after the answer: the same neutral screen, no data of the request.
  await visitor.goto(links.feedbackLink);
  await expect(visitor.getByText(SURVEY_GONE)).toBeVisible();
  await expect(visitor.getByText("Le lien est peut-être incomplet, a expiré ou a déjà été utilisé.")).toBeVisible();
  await expect(visitor.getByText(partnerName)).toHaveCount(0);
  await expect(visitor.getByText(a.reference)).toHaveCount(0);

  // Forged token, unknown reference, no token: the same screen.
  const forged = `${links.token.slice(0, -4)}AAAA`;
  await visitor.goto(`/avis/${links.reference}?token=${forged}`);
  await expect(visitor.getByText(SURVEY_GONE)).toBeVisible();
  await visitor.goto(`/avis/SF-INCONNU0000?token=${links.token}`);
  await expect(visitor.getByText(SURVEY_GONE)).toBeVisible();
  await visitor.goto(`/avis/${links.reference}`);
  await expect(visitor.getByText(SURVEY_GONE)).toBeVisible();
  await visitor.context().close();

  // API: GET status is neutral for every case; the second POST returns the previous confirmation and changes nothing.
  const statusOk = await publicCall("GET", `/satisfaction-surveys/${links.reference}`, { token: links.token });
  const statusForged = await publicCall("GET", `/satisfaction-surveys/${links.reference}`, { token: forged });
  const statusUnknown = await publicCall("GET", "/satisfaction-surveys/SF-INCONNU0000", { token: links.token });
  expect(statusOk.text, "answered survey reads as unavailable").toContain(SURVEY_GONE);
  expect(statusForged.text).toBe(statusOk.text);
  expect(statusUnknown.text).toBe(statusOk.text);

  ensureRateBudget("consent_withdrawal", 5, 1, "E-P7-02b second POST");
  const second = await publicCall("POST", `/satisfaction-surveys/${links.reference}`, { token: links.token, json: { rating: 1, comment: "second envoi", flaggedConcern: true } });
  expect(second.status, `second POST -> ${second.text.slice(0, 200)}`).toBe(200);
  const confirmation = second.body as { status?: string; alreadySubmitted?: boolean };
  expect(confirmation.status).toBe("submitted");
  expect(confirmation.alreadySubmitted).toBe(true);
  note(`E-P7-02b second POST -> ${second.status} ${second.text.slice(0, 200)} ; E-P7-02b jeton expiré (30 jours) : non rejouable sans toucher à l'horloge, couvert par le message commun`);

  // Nothing was modified: the second POST (rating 1 + concern) raised no alert for this survey.
  const compliance = await visit(browser, complianceAccount(), "/");
  const alerts = await adminApi(await adminBearerToken(compliance), "GET", "/admin/dashboard/compliance-alerts?pageSize=100&category=broker_satisfaction_concern");
  expect(alerts.status, `compliance alerts -> ${alerts.text.slice(0, 200)}`).toBe(200);
  expect(alerts.text, "an answered survey cannot be altered by a second POST").not.toContain(links.reference);
});

// ---------------------------------------------------------------------------------------------
// E-P7-02c: alerts
// ---------------------------------------------------------------------------------------------

test("E-P7-02c note 1 ou case « signaler un problème » : alerte conformité créée et visible côté admin", async ({ browser }) => {
  await closeWon(browser, "b");
  await closeWon(browser, "c");
  const b = await lead(browser, "b");
  const c = await lead(browser, "c");
  const linksB = await waitSurveyLinks(b.email);
  const linksC = await waitSurveyLinks(c.email);

  const answer = async (links: typeof linksB, rating: string, flag: boolean): Promise<void> => {
    const visitor = await appPage(browser, e2eEnv.publicUrl);
    await visitor.goto(links.feedbackLink);
    await expect(visitor.getByLabel("Je souhaite signaler un problème avec le courtier partenaire")).toBeVisible();
    await visitor.getByLabel(rating).check({ force: true });
    if (flag) await visitor.getByLabel("Je souhaite signaler un problème avec le courtier partenaire").check();
    ensureRateBudget("consent_withdrawal", 5, 1, "E-P7-02c submit");
    await visitor.getByRole("button", { name: "Envoyer mon avis" }).click();
    await expect(visitor.getByText("Merci pour votre avis")).toBeVisible();
    await visitor.context().close();
  };
  await answer(linksB, "1 - Pas du tout satisfait", false);
  await answer(linksC, "5 - Très satisfait", true);

  // Admin side: the compliance journal carries both alerts (category broker_satisfaction_concern).
  const compliance = await visit(browser, complianceAccount(), "/dashboard/compliance-alerts?pageSize=100");
  const api = await adminApi(await adminBearerToken(compliance), "GET", "/admin/dashboard/compliance-alerts?pageSize=100&category=broker_satisfaction_concern");
  expect(api.status, `compliance alerts -> ${api.text.slice(0, 200)}`).toBe(200);
  const items = ((api.body as { items?: Array<{ category: string; targetId: string | null; reason: string; partnerTenantId: string | null }> }).items) ?? [];
  const references = items.map((item) => item.targetId);
  expect(references, "alert of the survey with rating 1").toContain(linksB.reference);
  expect(references, "alert of the survey with the concern box").toContain(linksC.reference);
  const own = items.filter((item) => item.targetId === linksB.reference || item.targetId === linksC.reference);
  for (const item of own) {
    expect(item.category).toBe("broker_satisfaction_concern");
    expect(item.reason).toBe("broker_satisfaction_concern");
    expect(item.partnerTenantId).toBe(firm.partnerId);
  }
  // Screen: the same rows in "Journal conformité".
  // The journal lists the oldest events first (100 per page): the alerts of this run are on the last pages.
  const overview = await adminApi(await adminBearerToken(compliance), "GET", "/admin/dashboard/compliance-alerts?pageSize=100");
  const lastPage = Math.max(1, Math.ceil(((overview.body as { total?: number }).total ?? 1) / 100));
  const journal = compliance.getByRole("table", { name: "Alertes conformité" });
  for (const reference of [linksB.reference, linksC.reference]) {
    let found = false;
    for (let pageNumber = lastPage; pageNumber >= Math.max(1, lastPage - 2) && !found; pageNumber -= 1) {
      await compliance.goto(`/dashboard/compliance-alerts?page=${pageNumber}&pageSize=100`);
      found = (await journal.getByRole("row").filter({ hasText: reference }).count()) > 0;
    }
    expect(found, `journal row of ${reference}`).toBe(true);
    await expect(journal.getByRole("row").filter({ hasText: reference }).first()).toContainText("broker_satisfaction_concern");
  }
  await compliance.screenshot({ path: "test-results/edge-p5p7-04/evidence-E-P7-02c.png" });
  note(`E-P7-02c alertes visibles : ${linksB.reference} (note 1), ${linksC.reference} (case signalement, note 5)`);
});

// ---------------------------------------------------------------------------------------------
// E-P7-02d: opt-out
// ---------------------------------------------------------------------------------------------

test("E-P7-02d /desinscription : jeton absent, falsifié, valide ; les e-mails de suivi continuent", async ({ browser }) => {
  await closeWon(browser, "d");
  const d = await lead(browser, "d");
  const links = await waitSurveyLinks(d.email);
  const visitor = await appPage(browser, e2eEnv.publicUrl);

  // Absent or malformed: "Ce lien n'est pas valide".
  await visitor.goto("/desinscription");
  await expect(visitor.getByText("Ce lien n'est pas valide")).toBeVisible();
  await visitor.goto("/desinscription?token=abc");
  await expect(visitor.getByText("Ce lien n'est pas valide")).toBeVisible();

  // Forged (valid shape, wrong signature): the page asks, the API refuses with the same neutral text.
  const unsubscribeToken = new URL(links.unsubscribeLink).searchParams.get("token") ?? "";
  await visitor.goto(`/desinscription?token=${unsubscribeToken.slice(0, -4)}AAAA`);
  await visitor.getByRole("button", { name: "Confirmer la désinscription" }).click();
  await expect(visitor.getByText("Ce lien n'est pas valide")).toBeVisible();
  await expect(visitor.getByText("Désinscription enregistrée")).toHaveCount(0);

  // Valid: nothing changes until the visitor confirms.
  await visitor.goto(links.unsubscribeLink);
  await expect(visitor.getByRole("button", { name: "Confirmer la désinscription" })).toBeVisible();
  await visitor.getByRole("button", { name: "Confirmer la désinscription" }).click();
  await expect(visitor.getByText("Désinscription enregistrée")).toBeVisible();
  await expect(visitor.getByText("Vous ne recevrez plus ce type d'e-mail AssurMatch à cette adresse.")).toBeVisible();
  await visitor.context().close();

  // The follow-up mails of the request continue: the tracking link re-sent from /suivi (one real send for the whole file).
  ensureRateBudget("tracking_link_resend", 5, 1, "E-P7-02d follow-up e-mail");
  const seen = new Set((await searchMessages(`to:"${d.email}"`)).map((message) => message.ID));
  const suivi = await appPage(browser, e2eEnv.publicUrl);
  await suivi.goto("/suivi");
  await suivi.locator("#tracking-reference").fill(d.reference);
  await suivi.locator("#tracking-email").fill(d.email);
  await suivi.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(suivi.getByText("Demande prise en compte")).toBeVisible();
  const resent = await waitForMail({ to: d.email, exclude: seen, subject: /Votre lien de suivi/u });
  extractLink(resent, new RegExp(`/demandes-de-devis/${d.reference}\\?token=`, "u"));
  await suivi.context().close();
  note(`E-P7-02d désinscription enregistrée pour ${d.reference} ; e-mail de suivi « ${resent.Subject} » reçu ensuite`);
});

test("E-P7-02a (statut HTTP) une note absente ou un jeton falsifié sur POST doit être un refus client (4xx), pas une erreur serveur", async ({ browser }) => {
  test.fail(true, "ANOMALIE E-P7-02a : POST /satisfaction-surveys/:ref répond 500 INTERNAL_ERROR pour une note absente (message « Rating must be an integer between 1 and 5 ») et pour un jeton falsifié ; une saisie ou un lien invalide est une erreur client (400/404)");
  test.info().annotations.push({
    type: "anomalie",
    description: "E-P7-02a: satisfaction-surveys.service.ts:110-146 throw plain Error (UNAVAILABLE_MESSAGE / 'Rating must be an integer...') that the HTTP wiring (runtime-http-wiring.module.ts:1026-1033) does not map: 500 INTERNAL_ERROR instead of 400/404"
  });
  const d = await lead(browser, "d");
  const links = await waitSurveyLinks(d.email);
  ensureRateBudget("consent_withdrawal", 5, 2, "E-P7-02a statuses");
  const noRating = await publicCall("POST", `/satisfaction-surveys/${links.reference}`, { token: links.token, json: { comment: "sans note" } });
  const forged = await publicCall("POST", `/satisfaction-surveys/${links.reference}`, { token: `${links.token.slice(0, -4)}AAAA`, json: { rating: 3 } });
  note(`ANOMALIE E-P7-02a : POST sans note -> ${noRating.status} ${withoutCorrelation(noRating.text).slice(0, 160)} ; POST jeton falsifié -> ${forged.status} ${withoutCorrelation(forged.text).slice(0, 160)} (satisfaction-surveys.service.ts:110-146 ; runtime-http-wiring.module.ts:1026-1033 ne mappe pas ces erreurs)`);
  expect(noRating.status, `no rating -> ${noRating.text.slice(0, 200)}`).toBe(400);
  expect(forged.status, `forged token -> ${forged.text.slice(0, 200)}`).toBe(404);
});

// ---------------------------------------------------------------------------------------------
// E-P5-04b / E-P5-04e / E-P5-04d / T-03: tracking tokens and cross-visitor probes
// ---------------------------------------------------------------------------------------------

test("E-P5-04b jeton de V1 avec la référence de V2 : écran neutre, aucune donnée de V2", async ({ browser }) => {
  const a = await lead(browser, "a");
  const b = await lead(browser, "b");
  reserveTrackingViews(2, "E-P5-04b");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const url = `/demandes-de-devis/${b.reference}?token=${tokenOfLink(a.trackingLink)}`;
  const response = await visitor.goto(url);
  expect(response?.status(), "neutral screen answers 200").toBe(200);
  await expect(visitor.getByText(NEUTRAL_TRACKING)).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Recevoir un nouveau lien" })).toBeVisible();
  const text = (await visitor.locator("body").innerText()).replace(/\s+/gu, " ");
  for (const secret of [firm.partnerName, b.email, b.name, b.phone]) expect(text, `no data of V2: ${secret}`).not.toContain(secret);
  expect(text).not.toContain("Message du courtier");
  // Same screen as a plain forged token.
  await visitor.goto(`/demandes-de-devis/${b.reference}?token=${`${tokenOfLink(b.trackingLink).slice(0, -4)}AAAA`}`);
  await expect(visitor.getByText(NEUTRAL_TRACKING)).toBeVisible();
  await visitor.context().close();
});

test("T-03 accès croisés visiteur par API : 404 VISITOR_ACCESS_DENIED « Quote status not available », corps identiques", async ({ browser }) => {
  const a = await lead(browser, "a");
  const b = await lead(browser, "b");
  const tokenA = tokenOfLink(a.trackingLink);
  const tokenB = tokenOfLink(b.trackingLink);
  reserveTrackingViews(8, "T-03");
  const before = publicScopeUsage("tracking_status")?.count ?? 0;

  const cases: Array<[string, { status: number; text: string }]> = [];
  const probe = async (label: string, path: string, token?: string): Promise<void> => {
    const result = await publicCall("GET", path, token === undefined ? {} : { token });
    cases.push([label, result]);
  };
  await probe("jeton de V1 sur la référence de V2", `/quote-requests/${b.reference}`, tokenA);
  await probe("référence de V2 sans jeton", `/quote-requests/${b.reference}`);
  await probe("jeton falsifié de V2", `/quote-requests/${b.reference}`, `${tokenB.slice(0, -4)}AAAA`);
  await probe("jeton inconnu (43 caractères)", `/quote-requests/${b.reference}`, "A".repeat(43));
  await probe("référence inconnue avec le jeton de V1", "/quote-requests/QR-2026-ZZZZZZZZ", tokenA);
  await probe("jeton de moins de 16 caractères", `/quote-requests/${b.reference}`, "court");
  const after = publicScopeUsage("tracking_status")?.count ?? 0;
  note(`T-03 compteur tracking_status : ${before} -> ${after} pour ${cases.length} appels`);
  for (const [label, result] of cases) {
    note(`T-03 ${label} -> ${result.status} ${withoutCorrelation(result.text).slice(0, 200)}`);
    expect(result.status, label).toBe(404);
    expect(result.text, label).toContain("VISITOR_ACCESS_DENIED");
    expect(result.text, label).toContain("Quote status not available");
    for (const secret of [firm.partnerName, b.email, b.name]) expect(result.text, `${label}: no data`).not.toContain(secret);
  }
  const reference = withoutCorrelation(cases[0]?.[1].text ?? "");
  for (const [label, result] of cases) expect(withoutCorrelation(result.text), `${label}: identical body`).toBe(reference);

  // Conversations, documents, attachments, proposals and data requests of V2 with the token of V1: the same neutral 404.
  const nilId = "00000000-0000-4000-8000-000000000000";
  const crossPaths = [
    `/quote-requests/${b.reference}/conversations`,
    `/quote-requests/${b.reference}/conversations/${nilId}`,
    `/quote-requests/${b.reference}/conversations/${nilId}/messages/${nilId}/attachments/${nilId}`,
    `/quote-requests/${b.reference}/proposals/${nilId}/document`,
    `/quote-requests/${b.reference}/data-requests`
  ];
  for (const path of crossPaths) {
    const cross = await publicCall("GET", path, { token: tokenA });
    const unknown = await publicCall("GET", path.replace(b.reference, "QR-2026-ZZZZZZZZ"), { token: tokenA });
    note(`T-03 ${path.replace(b.reference, "<V2>")} avec le jeton de V1 -> ${cross.status} ${withoutCorrelation(cross.text).slice(0, 160)}`);
    expect(cross.status, path).toBe(404);
    expect(cross.text, path).toContain("VISITOR_ACCESS_DENIED");
    expect(withoutCorrelation(cross.text), `${path}: same body as an unknown reference`).toBe(withoutCorrelation(unknown.text));
    for (const secret of [firm.partnerName, b.email, b.name]) expect(cross.text).not.toContain(secret);
  }
});

test("T-03 (documents d'un autre visiteur) la liste des pièces répond le même 404 neutre VISITOR_ACCESS_DENIED", async ({ browser }) => {
  test.fail(true, "ANOMALIE T-03 : GET /quote-requests/:ref/documents refuse avec 404 NOT_FOUND « Quote request not found » (même corps pour tous les cas, donc aucun oracle) au lieu du 404 neutre VISITOR_ACCESS_DENIED « Quote status not available » des autres routes visiteur");
  test.info().annotations.push({
    type: "anomalie",
    description: "T-03: quote-documents.service.ts:314-316 authenticate() throws Error('Quote request not found'); the other visitor routes answer VISITOR_ACCESS_DENIED (quote-submission.service.ts:145)"
  });
  const a = await lead(browser, "a");
  const b = await lead(browser, "b");
  const path = `/quote-requests/${b.reference}/documents`;
  const cross = await publicCall("GET", path, { token: tokenOfLink(a.trackingLink) });
  const unknown = await publicCall("GET", "/quote-requests/QR-2026-ZZZZZZZZ/documents", { token: tokenOfLink(a.trackingLink) });
  const noToken = await publicCall("GET", path);
  note(`ANOMALIE T-03 documents : jeton de V1 sur V2 -> ${cross.status} ${withoutCorrelation(cross.text).slice(0, 160)} ; référence inconnue -> ${unknown.status} ${withoutCorrelation(unknown.text).slice(0, 120)} ; sans jeton -> ${noToken.status} ${withoutCorrelation(noToken.text).slice(0, 120)} (quote-documents.service.ts:314-316)`);
  expect(withoutCorrelation(cross.text), "no oracle between a foreign token and an unknown reference").toBe(withoutCorrelation(unknown.text));
  expect(withoutCorrelation(noToken.text)).toBe(withoutCorrelation(cross.text));
  expect(cross.status).toBe(404);
  expect(cross.text).toContain("VISITOR_ACCESS_DENIED");
});

test("E-P5-04e en-têtes de la page de suivi : no-referrer, no-store, seul le jeton dans l'URL", async ({ browser }) => {
  const a = await lead(browser, "a");
  reserveTrackingViews(2, "E-P5-04e");
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const response = await visitor.goto(a.trackingLink);
  const headers = response?.headers() ?? {};
  note(`E-P5-04e en-têtes de la page de suivi : referrer-policy=${headers["referrer-policy"]} cache-control=${headers["cache-control"]} x-robots-tag=${headers["x-robots-tag"]}`);
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"] ?? "").toContain("no-store");
  const url = new URL(visitor.url());
  expect([...url.searchParams.keys()]).toEqual(["token"]);
  expect(url.pathname).toBe(`/demandes-de-devis/${a.reference}`);
  expect(visitor.url()).not.toContain(a.email);
  expect(visitor.url()).not.toContain(encodeURIComponent(a.email));
  expect(await visitor.locator("meta[name='referrer']").getAttribute("content")).toBe("no-referrer");
  await visitor.context().close();
});

test("E-P5-04d /suivi : référence ou e-mail invalides côté écran, aucune requête", async ({ browser }) => {
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const posts: string[] = [];
  visitor.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("tracking-link")) posts.push(request.url());
  });
  await visitor.goto("/suivi");
  await visitor.locator("#tracking-reference").fill("QR 2026!");
  await visitor.locator("#tracking-email").fill("pas-un-email");
  await visitor.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(visitor.getByText("Indiquez une référence valide (lettres, chiffres et tirets).")).toBeVisible();
  await expect(visitor.getByText("Indiquez une adresse e-mail valide.")).toBeVisible();
  await visitor.locator("#tracking-reference").fill("QR-2026-ABC123");
  await visitor.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(visitor.getByText("Indiquez une référence valide (lettres, chiffres et tirets).")).toHaveCount(0);
  await expect(visitor.getByText("Indiquez une adresse e-mail valide.")).toBeVisible();
  expect(posts, "invalid input never reaches the API").toHaveLength(0);
  await visitor.context().close();
});

test.fixme("E-P5-04d 6e demande de renvoi en une heure : « Trop de demandes en peu de temps. Réessayez dans une heure. »", async () => {
  // NON EXECUTE, pile jetable : la 6e demande bloque l'IP d'une heure pour toute la pile (compteur par IP, 127.0.0.1 pour tous les lots).
});

// ---------------------------------------------------------------------------------------------
// Billing (E-P7-03a .. 03d)
// ---------------------------------------------------------------------------------------------

interface Invoice {
  id: string;
  number: string;
  status: string;
  totalAmount: number;
  amountDue: number;
  draftId: string;
  customer: { legalName: string };
}

let finance: BackOfficeAccount;
let financeToken = "";
let invoiceMain: Invoice | undefined;
let invoiceSecond: Invoice | undefined;
let secondFirm: BrokerWorld;
/** One invoice per partner and month: the invoice chain of E-P7-03b runs on a firm created for this run. */
let billingFirm: BrokerWorld;

async function financeApi(browser: Browser, method: "GET" | "POST" | "PUT", path: string, data?: Record<string, unknown>) {
  financeToken = await adminSessionToken(browser, finance);
  return adminApi(financeToken, method, path, data);
}

async function invoicesOf(browser: Browser, partnerId: string): Promise<Invoice[]> {
  const list = await financeApi(browser, "GET", `/admin/billing/issued-invoices?partnerId=${partnerId}`);
  expect(list.status, `invoices of ${partnerId} -> ${list.text.slice(0, 200)}`).toBe(200);
  return list.body as Invoice[];
}

async function draftsOf(browser: Browser, partnerId: string): Promise<Array<{ id: string; totalAmount: number; reference: string }>> {
  const list = await financeApi(browser, "GET", `/admin/billing/invoices?partnerId=${partnerId}`);
  expect(list.status, `drafts of ${partnerId} -> ${list.text.slice(0, 200)}`).toBe(200);
  return (list.body as { items: Array<{ id: string; totalAmount: number; reference: string }> }).items;
}

/** UI: recomputes the drafts of ONE partner (the field "Partenaire (optionnel)"), never the other firms' drafts. */
async function recomputeDraftsOf(page: Page, partnerId: string): Promise<void> {
  await page.goto("/billing?tab=brouillons");
  if ((await page.locator("#billing-draft-partner").count()) === 0) {
    note(`E-P7-03 debug: ${JSON.stringify(await page.locator("input, select").evaluateAll((els) => els.map((el) => `${el.id}|${el.getAttribute("name")}`)))} :: ${(await page.locator("main").innerText()).replace(/\s+/gu, " ").slice(0, 500)}`);
  }
  await page.locator("#billing-draft-partner").fill(partnerId);
  await page.locator("#billing-draft-reason").fill(`Recalcul lot 4 fichier 04 ${SUFFIX}`);
  await page.getByRole("button", { name: "Recalculer les brouillons" }).click();
  await page.waitForURL(/billing=/u);
  const outcome = new URL(page.url()).searchParams.get("billing");
  expect(outcome, `recompute outcome ${page.url()}`).toBe("drafts_computed");
  await expect(page.getByText("Brouillons recalculés. Un brouillon déjà facturé reste inchangé.")).toBeVisible();
}

test("E-P7-03 préparation : compte Finance Admin, tarif Starter CI, brouillon de la firme l4f alimenté par ses clôtures", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  billingFirm = await ensureL4Firm(browser, `l4fi${SUFFIX}`, "l4fi");
  const billingLead = await createLead(browser, billingFirm, "l4fi", { accept: true });
  await closeLeadViaUi(await visit(browser, billingFirm.owner, `/leads/${billingLead.assignmentId}`), billingFirm.owner, billingLead.assignmentId, "gagne", `Clôture facturable L4 ${SUFFIX}`);
  finance = await ensureAdminAccount(browser, "finance_admin", "l4finscope", requireState(loadJourneyState(), "countryId"));
  await closeWon(browser, "b");
  await closeWon(browser, "c");
  await closeWon(browser, "d");
  // Tariffs and draft recomputation need `billing:*` (Super Admin only, see the anomaly test below): the Super Admin does them.
  const page = await visit(browser, superAdminAccount(), "/billing?tab=tarifs");
  const plans = await financeApi(browser, "GET", "/admin/billing/plans");
  expect(plans.status, `plans -> ${plans.text.slice(0, 200)}`).toBe(200);
  const list = (Array.isArray(plans.body) ? plans.body : ((plans.body as { items?: unknown[] }).items ?? [])) as Array<{ plan: string; countryCode: string; monthlySubscription: number }>;
  note(`E-P7-03 tarifs existants : ${JSON.stringify(list.map((entry) => `${entry.plan}/${entry.countryCode}=${entry.monthlySubscription}`))}`);
  if (!list.some((entry) => entry.plan === "starter" && entry.countryCode === "CI")) {
    const tariff = card(page, "Tarifs par plan et pays");
    await tariff.locator("#billing-plan").selectOption("starter");
    await tariff.locator("#billing-country").fill("CI");
    await tariff.locator("#billing-subscription").fill("25000");
    await tariff.locator("#billing-per-lead").fill("5000");
    await tariff.locator("#billing-plan-reason").fill("Tarif Starter CI (lot 4 fichier 04)");
    await tariff.getByRole("button", { name: "Enregistrer le tarif" }).click();
    await expect(page.getByText("Tarif de plan enregistré et audité.")).toBeVisible();
    note("E-P7-03 tarif Starter CI absent : créé par le fichier 04");
  }
  await recomputeDraftsOf(page, billingFirm.partnerId);
  const drafts = await draftsOf(browser, billingFirm.partnerId);
  expect(drafts.length, "one draft of the month for l4f").toBeGreaterThan(0);
  expect(drafts[0]?.totalAmount, "draft of l4f is not empty").toBeGreaterThan(0);
});

test("E-P7-03 (rôle FA) le Finance Admin enregistre un tarif et recalcule les brouillons (scénario P7-03)", async ({ browser }) => {
  test.fail(true, "ANOMALIE P7-03 : finance_admin n'a pas la permission billing:* (réservée au Super Admin) ; PUT /admin/billing/plans et POST /admin/billing/invoices/recompute répondent 403 au Finance Admin alors que le scénario et l'écran « Tarifs » / « Recalculer les brouillons » le lui proposent");
  test.info().annotations.push({
    type: "anomalie",
    description: "P7-03: billing-plans.service.ts:126 and draft-invoice.service.ts:413 require 'billing:*', which finance_admin does not hold (assurmatch-role-matrix.ts:37); the screen answers « Action refusée: rôle Finance Admin ou Super Admin requis. » to a Finance Admin (apps/admin/app/billing/page.tsx:BILLING_NOTICES.forbidden)"
  });
  const plans = await financeApi(browser, "GET", "/admin/billing/plans");
  const list = (Array.isArray(plans.body) ? plans.body : ((plans.body as { items?: unknown[] }).items ?? [])) as Array<{ plan: string; countryCode: string; monthlySubscription: number; perLeadPrice: number; setupFee?: number }>;
  const starter = list.find((entry) => entry.plan === "starter" && entry.countryCode === "CI");
  expect(starter, "starter/CI tariff").toBeDefined();
  // Same values as today: nothing changes if the call were accepted.
  const put = await financeApi(browser, "PUT", "/admin/billing/plans", { plan: "starter", countryCode: "CI", monthlySubscription: starter?.monthlySubscription ?? 0, perLeadPrice: starter?.perLeadPrice ?? 0, setupFee: starter?.setupFee ?? 0, reason: "Verification du droit FA (valeurs inchangees) lot 4" });
  const recompute = await financeApi(browser, "POST", "/admin/billing/invoices/recompute", { partnerId: billingFirm.partnerId, reason: "Verification du droit FA lot 4" });
  note(`ANOMALIE P7-03 : Finance Admin PUT tarif -> ${put.status} ${withoutCorrelation(put.text).slice(0, 140)} ; recalcul des brouillons -> ${recompute.status} ${withoutCorrelation(recompute.text).slice(0, 140)} (billing-plans.service.ts:126, draft-invoice.service.ts:413, assurmatch-role-matrix.ts:37)`);
  expect(put.status, `FA tariff -> ${put.text.slice(0, 160)}`).toBeLessThan(300);
  expect(recompute.status, `FA recompute -> ${recompute.text.slice(0, 160)}`).toBeLessThan(300);
});

test("E-P7-03a brouillon vide -> 409 « Invoice conflict: empty_draft » ; billing_disabled et mentions légales : non exécutables", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  // A broker whose plan has no tariff has an empty draft (subscription 0, no lead): found among all the drafts first.
  const everyDraft: Array<{ id: string; totalAmount: number; partnerName: string; partnerId: string }> = [];
  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const result = await financeApi(browser, "GET", `/admin/billing/invoices?pageSize=50&page=${pageNumber}`);
    expect(result.status, `drafts -> ${result.text.slice(0, 200)}`).toBe(200);
    const body = result.body as { items: typeof everyDraft; total: number };
    everyDraft.push(...body.items);
    if (everyDraft.length >= body.total || body.items.length === 0) break;
  }
  const empty = everyDraft.filter((draft) => draft.totalAmount <= 0);
  note(`E-P7-03a brouillons vides existants : ${empty.length}`);
  let target = empty.find((draft) => draft.partnerName.includes("l4"));
  if (!target) {
    // Own Pro firm (no Pro tariff unless another lot created one): its draft is empty.
    let proFirm = loadFirm("l4fp");
    if (!proFirm) {
      proFirm = await provisionBroker(browser, { plan: "pro", label: "l4fp" });
      saveFirm("l4fp", proFirm);
    }
    const page = await visit(browser, superAdminAccount(), "/billing?tab=brouillons");
    await recomputeDraftsOf(page, proFirm.partnerId);
    const drafts = await draftsOf(browser, proFirm.partnerId);
    const own = drafts.find((draft) => draft.totalAmount <= 0);
    test.skip(!own, "NON EXECUTE : un tarif Pro existe, aucun brouillon vide atteignable sans toucher à la configuration tarifaire");
    target = { id: own?.id ?? "", totalAmount: 0, partnerName: proFirm.partnerName, partnerId: proFirm.partnerId };
  }
  // The screen never offers an empty draft ("Aucun brouillon facturable"): API only.
  const issued = await financeApi(browser, "POST", "/admin/billing/issued-invoices", { draftId: target.id, reason: `Brouillon vide lot 4 ${SUFFIX}` });
  note(`E-P7-03a émission d'un brouillon vide -> ${issued.status} ${withoutCorrelation(issued.text).slice(0, 200)}`);
  expect(issued.status).toBe(409);
  expect(issued.text).toContain("Invoice conflict: empty_draft");
  const page = await visit(browser, finance, "/billing?tab=factures");
  await expect(page.locator("#invoice-draft option").filter({ hasText: target.partnerName })).toHaveCount(0);
});

test.fixme("E-P7-03a billing_disabled (422) et mentions légales incomplètes (422 « Invoicing configuration incomplete »)", async () => {
  // NON EXECUTE : billing_enabled est un drapeau sensible partagé par toute la pile (aucune bascule dans le back-office, seule la
  // commande de politique de conformité le change) ; la complétude des mentions légales dépend de la configuration du serveur
  // (invoicing.config.ts, en local « [A COMPLETER] » imprimé sans refus). Les deux exigent de modifier la configuration.
});

test("E-P7-03b paiements refusés : reste dû dépassé, date future ; facture payée ; PDF courtier", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const page = await visit(browser, finance, "/billing?tab=factures");
  const drafts = await draftsOf(browser, billingFirm.partnerId);
  const draft = drafts[0];
  expect(draft, "draft of l4f").toBeDefined();
  let invoices = (await invoicesOf(browser, billingFirm.partnerId)).filter((invoice) => invoice.status !== "cancelled");
  if (invoices.length === 0) {
    const issue = card(page, "Émettre la facture d'un brouillon");
    await issue.locator("#invoice-draft").selectOption(draft?.id ?? "");
    await issue.locator("#invoice-reason").fill(`Facture mensuelle lot 4 ${SUFFIX}`);
    await issue.getByRole("button", { name: "Émettre la facture" }).click();
    await expect(page.getByText("Facture numérotée émise, PDF archivé et courtier notifié.")).toBeVisible();
    invoices = (await invoicesOf(browser, billingFirm.partnerId)).filter((invoice) => invoice.status !== "cancelled");
  }
  invoiceMain = invoices[0];
  expect(invoiceMain?.number, "numbered invoice").toMatch(/^CI-\d{4}-\d{6}$/u);
  const invoice = invoiceMain as Invoice;
  const pay = async (amount: number, date: string): Promise<void> => {
    await page.goto("/billing?tab=factures");
    const form = card(page, "Enregistrer un paiement reçu");
    await form.locator("#payment-invoice").selectOption(invoice.id);
    await form.locator("#payment-amount").fill(String(amount));
    await form.locator("#payment-date").fill(date);
    await form.locator("#payment-method").selectOption("bank_transfer");
    await form.locator("#payment-reference").fill(`VIR-L4-${SUFFIX}`);
    await form.getByRole("button", { name: "Enregistrer le paiement" }).click();
  };

  // Above the balance: refused, nothing recorded.
  await pay(invoice.amountDue + 1, isoDate(new Date()));
  await expect(page.getByText(CONFLICT_NOTICE)).toBeVisible();
  await page.screenshot({ path: "test-results/edge-p5p7-04/evidence-E-P7-03b-amount.png" });
  // Future date: refused.
  const tomorrow = isoDate(new Date(Date.now() + 2 * 86_400_000));
  await pay(Math.min(1000, invoice.amountDue), tomorrow);
  await expect(page.getByText(CONFLICT_NOTICE)).toBeVisible();
  expect((await invoicesOf(browser, billingFirm.partnerId)).find((entry) => entry.id === invoice.id)?.amountDue, "nothing recorded by the refusals").toBe(invoice.amountDue);
  // API texts.
  const over = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/payments`, { amount: invoice.amountDue + 1, receivedAt: isoDate(new Date()), method: "bank_transfer", reference: `VIR-L4-X-${SUFFIX}` });
  const future = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/payments`, { amount: 1000, receivedAt: tomorrow, method: "bank_transfer", reference: `VIR-L4-F-${SUFFIX}` });
  note(`E-P7-03b API montant > reste dû -> ${over.status} ${withoutCorrelation(over.text).slice(0, 160)} ; date future -> ${future.status} ${withoutCorrelation(future.text).slice(0, 160)} ; texte d'écran : « ${CONFLICT_NOTICE} » (message générique pour les deux cas, jamais la raison)`);
  expect(over.status).toBe(409);
  expect(over.text).toContain("Invoice conflict: amount_exceeds_balance");
  expect(future.status).toBe(409);
  expect(future.text).toContain("Invoice conflict: payment_date_in_future");

  // Settled in two payments (partial then rest): partially paid, then paid.
  const partial = Math.max(1, Math.floor(invoice.amountDue / 2));
  await pay(partial, isoDate(new Date()));
  await expect(page.getByText("Paiement reçu hors plateforme enregistré et audité.")).toBeVisible();
  const afterPartial = (await invoicesOf(browser, billingFirm.partnerId)).find((entry) => entry.id === invoice.id);
  expect(afterPartial?.status).toBe("partially_paid");
  await pay(invoice.amountDue - partial, isoDate(new Date()));
  await expect(page.getByText("Paiement reçu hors plateforme enregistré et audité.")).toBeVisible();
  const paid = (await invoicesOf(browser, billingFirm.partnerId)).find((entry) => entry.id === invoice.id);
  expect(paid?.status).toBe("paid");
  await expect(card(page, "Factures B2B numérotées").getByRole("row").filter({ hasText: invoice.number })).toContainText("payée");

  // Already paid / credit note on a settled invoice.
  const again = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/payments`, { amount: 1000, receivedAt: isoDate(new Date()), method: "bank_transfer", reference: `VIR-L4-P-${SUFFIX}` });
  expect(again.status).toBe(409);
  expect(again.text).toContain("Invoice conflict: invoice_already_paid");
  const creditPaid = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/credit-note`, { reason: `Avoir sur facture réglée lot 4 ${SUFFIX}` });
  note(`E-P7-03b facture déjà payée -> ${again.status} ${withoutCorrelation(again.text).slice(0, 160)} ; E-P7-03c avoir sur facture réglée -> ${creditPaid.status} ${withoutCorrelation(creditPaid.text).slice(0, 160)}`);
  expect(creditPaid.status).toBe(409);
  expect(creditPaid.text).toContain("Invoice conflict: invoice_has_payments");

  // The owner of l4f sees it settled and can download the PDF.
  const broker = await visit(browser, billingFirm.owner, "/billing");
  await expect(broker.getByRole("table", { name: "Factures du cabinet" }).getByRole("row").filter({ hasText: invoice.number }).first()).toContainText("réglée");
  await expect(broker.getByText("Aucun paiement en ligne, aucune prime d'assurance encaissee par AssurMatch.")).toBeVisible();
});

test("P7-03 (libellé courtier) « Facturation manuelle: aucun paiement en ligne, aucune prime d'assurance encaissée par AssurMatch. »", async ({ browser }) => {
  test.fail(true, "ANOMALIE P7-03 : le bandeau de /billing côté courtier vient de l'API sans accents (« encaissee », « reglement ») et ne reprend pas la phrase du scénario");
  test.info().annotations.push({
    type: "anomalie",
    description: "P7-03: invoicing.service.ts:59-60 STATEMENT_NOTICE is ASCII ('Facturation manuelle: reglement par virement ... aucune prime d'assurance encaissee par AssurMatch.') and apps/broker/app/billing/page.tsx:124 shows account.data.notice instead of its accented fallback"
  });
  const broker = await visit(browser, billingFirm.owner, "/billing");
  const text = (await broker.locator("main").innerText()).replace(/s+/gu, " ");
  note(`ANOMALIE P7-03 bandeau courtier : « ${text.match(/Facturation manuelle[^.]*.[^.]*./u)?.[0] ?? "?"} » (invoicing.service.ts:59-60)`);
  await expect(broker.getByText("Facturation manuelle: aucun paiement en ligne, aucune prime d'assurance encaissée par AssurMatch.")).toBeVisible({ timeout: 3_000 });
});

test("E-P7-03c avoir sur facture non réglée (annulation) puis paiement sur facture annulée", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  let second = loadFirm("l4fb");
  if (!second) {
    second = await provisionBroker(browser, { plan: "starter", label: "l4fb" });
    saveFirm("l4fb", second);
  }
  secondFirm = second;
  const superPage = await visit(browser, superAdminAccount(), "/billing?tab=brouillons");
  await recomputeDraftsOf(superPage, secondFirm.partnerId);
  const page = await visit(browser, finance, "/billing?tab=factures");
  const draft = (await draftsOf(browser, secondFirm.partnerId))[0];
  expect(draft?.totalAmount, "draft of l4fb carries the subscription").toBeGreaterThan(0);
  let invoices = await invoicesOf(browser, secondFirm.partnerId);
  if (!invoices.some((entry) => entry.status === "issued")) {
    const issued = await financeApi(browser, "POST", "/admin/billing/issued-invoices", { draftId: draft?.id ?? "", reason: `Facture lot 4 fichier 04 ${SUFFIX}` });
    expect(issued.status, `issue for l4fb -> ${issued.text.slice(0, 200)}`).toBe(201);
    invoices = await invoicesOf(browser, secondFirm.partnerId);
  }
  invoiceSecond = invoices.find((entry) => entry.status === "issued");
  const invoice = invoiceSecond as Invoice;
  expect(invoice, "an unpaid invoice of l4fb").toBeDefined();

  await page.goto("/billing?tab=factures");
  const credit = card(page, "Émettre un avoir");
  await confirmInDialog(page, credit, "Émettre l'avoir", async (dialog) => {
    await dialog.locator("#credit-note-invoice").selectOption(invoice.id);
    await dialog.locator("#credit-note-reason").fill(`Annulation intégrale lot 4 ${SUFFIX}`);
  });
  await expect(page.getByText("Avoir numéroté émis: la facture est annulée, rien n'est supprimé.")).toBeVisible();
  const cancelled = (await invoicesOf(browser, secondFirm.partnerId)).find((entry) => entry.id === invoice.id) as Invoice & { creditNote?: { number: string } | null };
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.creditNote?.number, "numbered credit note").toMatch(/^CI-AV-\d{4}-\d{6}$/u);
  await expect(card(page, "Factures B2B numérotées").getByRole("row").filter({ hasText: invoice.number })).toContainText("annulée par avoir");

  const pay = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/payments`, { amount: 1000, receivedAt: isoDate(new Date()), method: "bank_transfer", reference: `VIR-L4-C-${SUFFIX}` });
  const second2 = await financeApi(browser, "POST", `/admin/billing/issued-invoices/${invoice.id}/credit-note`, { reason: `Second avoir lot 4 ${SUFFIX}` });
  note(`E-P7-03b/03c paiement sur facture annulée -> ${pay.status} ${withoutCorrelation(pay.text).slice(0, 160)} ; second avoir -> ${second2.status} ${withoutCorrelation(second2.text).slice(0, 160)}`);
  expect(pay.status).toBe(409);
  expect(pay.text).toContain("Invoice conflict: invoice_cancelled");
  expect(second2.status).toBe(409);
  expect(second2.text).toContain("Invoice conflict: invoice_already_cancelled");
});

test("E-P7-03d /billing : rôles sans droit, sans MFA, agent courtier, facture d'un autre courtier", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  const support = await ensureAdminAccount(browser, "support_admin", "l4support");
  const compliance = complianceAccount();
  expect(invoiceMain, "invoice of l4f (E-P7-03b)").toBeDefined();
  const invoice = invoiceMain as Invoice;

  for (const [label, account] of [["compliance_admin", compliance], ["support_admin", support]] as const) {
    const page = await visit(browser, account, "/billing");
    await expect(page.getByText("Accès billing refusé pour ce rôle admin.")).toBeVisible();
    const token = await adminBearerToken(page);
    const list = await adminApi(token, "GET", "/admin/billing/issued-invoices");
    const issue = await adminApi(token, "POST", "/admin/billing/issued-invoices", { draftId: "00000000-0000-4000-8000-000000000000", reason: "Test de rôle lot 4" });
    const pay = await adminApi(token, "POST", `/admin/billing/issued-invoices/${invoice.id}/payments`, { amount: 1, receivedAt: isoDate(new Date()), method: "other", reference: "ROLE-L4" });
    note(`E-P7-03d ${label} : liste -> ${list.status} ${withoutCorrelation(list.text).slice(0, 120)} ; émission -> ${issue.status} ; paiement -> ${pay.status} ${withoutCorrelation(pay.text).slice(0, 120)}`);
    for (const result of [list, issue, pay]) {
      expect(result.status, `${label} refused`).toBe(403);
      expect(result.text).toContain("Billing access denied: forbidden_role");
    }
    await page.screenshot({ path: `test-results/edge-p5p7-04/evidence-E-P7-03d-${label}.png` });
  }

  // Observation: a Finance Admin without country scope is refused by the whole screen (billing foundation needs a scope).
  const unscoped = await ensureAdminAccount(browser, "finance_admin", "l4finance");
  const unscopedPage = await visit(browser, unscoped, "/billing");
  await expect(unscopedPage.getByText("Accès billing refusé pour ce rôle admin.")).toBeVisible();
  const unscopedToken = await adminBearerToken(unscopedPage);
  const foundation = await adminApi(unscopedToken, "GET", "/admin/billing/foundation");
  const unscopedInvoices = await adminApi(unscopedToken, "GET", "/admin/billing/issued-invoices");
  note(`E-P7-03d finance_admin sans périmètre pays : écran « Accès billing refusé pour ce rôle admin. » ; /foundation -> ${foundation.status} ${withoutCorrelation(foundation.text).slice(0, 120)} ; /issued-invoices -> ${unscopedInvoices.status} (billing-foundation.service.ts:135-137 missing_billing_scope : l'écran impute à tort le refus au rôle)`);
  test.info().annotations.push({ type: "constat", description: "E-P7-03d: a Finance Admin created without country scope gets 'Accès billing refusé pour ce rôle admin.' (missing_billing_scope, billing-foundation.service.ts:135-137) although the role is right" });
  expect(foundation.status).toBe(403);
  expect(foundation.text).toContain("missing_billing_scope");

  // Without MFA: the password step only (no code): the app keeps the visitor on /mfa and the API refuses the token.
  const noMfa = await appPage(browser, e2eEnv.adminUrl);
  await noMfa.goto("/login?returnTo=%2Fbilling");
  await noMfa.locator("#login-email").fill(finance.email);
  await noMfa.locator("#login-password").fill(finance.password);
  await noMfa.getByRole("button", { name: "Se connecter" }).click();
  await noMfa.waitForURL((url) => !url.pathname.startsWith("/login"));
  await noMfa.goto("/billing");
  const landed = `${new URL(noMfa.url()).pathname}`;
  const screen = (await noMfa.locator("body").innerText()).replace(/\s+/gu, " ").slice(0, 300);
  note(`E-P7-03d sans MFA : /billing -> ${landed} ; texte « ${screen} »`);
  expect(landed.startsWith("/mfa") || landed.startsWith("/login"), "the billing screen is not shown before the MFA step").toBe(true);
  await expect(noMfa.getByText("Facturation des courtiers")).toHaveCount(0);
  const halfToken = await adminBearerToken(noMfa).catch(() => "");
  if (halfToken) {
    const refused = await adminApi(halfToken, "GET", "/admin/billing/issued-invoices");
    note(`E-P7-03d sans MFA : API avec le jeton du seul mot de passe -> ${refused.status} ${withoutCorrelation(refused.text).slice(0, 160)}`);
    expect(refused.status).toBe(403);
    expect(refused.text).toContain("MFA required");
  } else {
    note("E-P7-03d sans MFA : aucune session n'existe après le seul mot de passe (pas de jeton à présenter à l'API) ; le texte « Vérification MFA requise avant cette action. » (catalog-messages.ts:142) n'est pas affiché sur /billing : l'accès est coupé en amont (retour /login)");
  }
  await noMfa.context().close();

  // Broker side: an agent of l4f cannot open /billing; the owner of another firm cannot read l4f's invoice.
  if (!firm.members.agent) {
    firm.members.agent = await inviteMember(browser, firm.owner, { key: "agent", displayName: "Aya Agent L4F", emailDomain: "broker-l4f.e2e.test" });
    saveFirm("l4f", firm);
  }
  const agentPage = await visit(browser, firm.members.agent, "/billing");
  await expect(agentPage.getByRole("heading", { name: "Accès réservé" })).toBeVisible();
  const agentToken = await bearerToken(agentPage);
  const agentAccount = await apiCall(agentToken, "GET", "/broker/billing/account");
  expect(agentAccount.status, `agent account -> ${agentAccount.text.slice(0, 200)}`).toBe(403);
  expect(agentAccount.text).toContain("forbidden_role");

  const otherOwner = (secondFirm ?? loadFirm("l4fb"))?.owner;
  expect(otherOwner, "owner of l4fb").toBeDefined();
  const otherToken = await tokenFor(browser, otherOwner as BackOfficeAccount);
  const foreign = await apiCall(otherToken, "GET", `/broker/billing/invoices/${invoice.id}/pdf`);
  const unknown = await apiCall(otherToken, "GET", "/broker/billing/invoices/00000000-0000-4000-8000-000000000000/pdf");
  note(`E-P7-03d facture d'un autre courtier -> ${foreign.status} ${withoutCorrelation(foreign.text).slice(0, 160)} ; identifiant inconnu -> ${unknown.status}`);
  expect(foreign.status).toBe(404);
  expect(withoutCorrelation(foreign.text)).toBe(withoutCorrelation(unknown.text));
  expect(foreign.text).not.toContain(invoice.number);
  const otherAccount = await apiCall(otherToken, "GET", "/broker/billing/account");
  expect(otherAccount.status).toBe(200);
  expect(otherAccount.text, "the account statement of l4fb never lists the invoice of l4f").not.toContain(invoice.number);
});

// ---------------------------------------------------------------------------------------------
// T-01: audit trail
// ---------------------------------------------------------------------------------------------

interface AuditRow {
  action: string;
  actorId?: string | null;
  targetType: string;
  targetId: string;
  result: string;
  reason?: string | null;
  occurredAt: string;
}

test("T-01 journal d'audit des phases 5 à 7 : actions rejouées avec acteur, cible et résultat ; refus audités", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const page = await visit(browser, complianceAccount(), "/");
  const token = await adminBearerToken(page);
  const rows = async (prefix: string): Promise<AuditRow[]> => {
    const out: AuditRow[] = [];
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      const result = await adminApi(token, "GET", `/admin/operations/audit-logs?action=${encodeURIComponent(prefix)}&pageSize=100&page=${pageNumber}`);
      expect(result.status, `audit ${prefix} -> ${result.text.slice(0, 200)}`).toBe(200);
      const body = result.body as { items: AuditRow[]; total: number };
      out.push(...body.items);
      if (out.length >= body.total || body.items.length === 0) break;
    }
    return out;
  };
  const mine = (all: AuditRow[]): AuditRow[] => all.filter((row) => row.occurredAt >= RUN_START);
  const a = leads.get("a");
  const prefixes: Record<string, number> = {};

  // Closing (A): success with the actor, and the refused second closing.
  const starter = await rows("broker_starter.lead_closed");
  prefixes["broker_starter.lead_closed"] = starter.length;
  const closedA = starter.filter((row) => row.targetId === a?.assignmentId);
  expect(closedA.some((row) => row.result === "success" && row.actorId), "closing of A: success with actor").toBe(true);
  expect(closedA.some((row) => row.result === "refused" && row.reason === "lead_closed" && row.actorId), "second closing of A: refused and audited").toBe(true);

  // Survey: submitted, concern flagged (refused), invalid links.
  const survey = mine(await rows("satisfaction_survey."));
  prefixes["satisfaction_survey."] = survey.length;
  for (const action of ["satisfaction_survey.submitted", "satisfaction_survey.concern_flagged", "satisfaction_survey.link_invalid"]) {
    expect(survey.some((row) => row.action === action), `${action} of this run`).toBe(true);
  }
  expect(survey.filter((row) => row.action === "satisfaction_survey.concern_flagged").every((row) => row.result === "refused")).toBe(true);
  const opt = mine(await rows("notification.unsubscribe"));
  expect(opt.some((row) => row.action === "notification.unsubscribed" && row.result === "success"), "opt-out recorded").toBe(true);
  expect(opt.some((row) => row.action === "notification.unsubscribe_refused"), "forged opt-out refused and audited").toBe(true);

  // Visitor access: cross-visitor probes refused.
  const access = mine(await rows("visitor_access."));
  prefixes["visitor_access."] = access.length;
  expect(access.some((row) => row.action === "visitor_access.denied" && row.result !== "success"), "cross-visitor probes audited").toBe(true);
  expect(access.some((row) => row.action === "visitor_access.space_opened"), "tracking page openings audited").toBe(true);

  // Billing.
  const billing = mine(await rows("billing."));
  prefixes["billing."] = billing.length;
  if (invoiceMain) {
    expect(billing.some((row) => row.action === "billing.invoice.issued" && row.targetId === invoiceMain?.id && row.actorId && row.result === "success"), "invoice issued").toBe(true);
    expect(billing.some((row) => row.action === "billing.payment.recorded" && row.targetId === invoiceMain?.id && row.result === "success"), "payment recorded").toBe(true);
    expect(billing.some((row) => row.action === "billing.payment.refused" && row.reason === "amount_exceeds_balance"), "payment above the balance refused").toBe(true);
    expect(billing.some((row) => row.action === "billing.payment.refused" && row.reason === "payment_date_in_future"), "payment with a future date refused").toBe(true);
    expect(billing.some((row) => row.action === "billing.credit_note.refused" && row.targetId === invoiceMain?.id), "credit note on a settled invoice refused").toBe(true);
  }
  if (invoiceSecond) expect(billing.some((row) => row.action === "billing.credit_note.issued"), "credit note issued").toBe(true);
  expect(billing.some((row) => row.action === "billing.access.refused" && row.result === "refused"), "role refusals audited").toBe(true);

  // Prefixes of the phases 5 to 7 replayed by the other files of the lot.
  for (const prefix of ["quote_request.", "routing.", "broker_starter.", "lead_proposal.", "lead_message.", "lead_document_request.", "consent."]) {
    const found = await rows(prefix);
    prefixes[prefix] = found.length;
    expect(found.length, `entries for the prefix ${prefix}`).toBeGreaterThan(0);
  }
  note(`T-01 entrées par préfixe : ${JSON.stringify(prefixes)}`);

  // Screen: the prefix filter of /compliance/audit-logs.
  await page.goto("/compliance/audit-logs?action=billing.&pageSize=50");
  const table = page.getByRole("table", { name: "Journal d'audit" });
  await expect(table.getByRole("row").filter({ hasText: "billing.invoice.issued" }).first()).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "billing.payment.refused" }).first()).toContainText("refused");
  await page.screenshot({ path: "test-results/edge-p5p7-04/evidence-T-01.png" });
});

// ---------------------------------------------------------------------------------------------
// T-07: e-mails sent to the visitors of the whole suite
// ---------------------------------------------------------------------------------------------

test("T-07 e-mails des visiteurs : aucune promesse contractuelle, aucun jeton visible, pas de contenu de messagerie, bons liens", async () => {
  test.setTimeout(10 * 60_000);
  const summaries = (await allMailSummaries()).filter((summary) => summary.To.some((to) => /^visiteur\.l4/u.test(to.Address)));
  note(`T-07 e-mails vers visiteur.l4*@visitor.e2e.test : ${summaries.length}`);
  expect(summaries.length, "visitor e-mails to scan").toBeGreaterThan(5);
  const subjects = new Map<string, number>();
  const contractual = /contrat valid|garanti(?:e|es|s)?\b|garantie accept|guaranteed|souscri|acheter|buy now|subscribe\b|\bpayer\b|prix (?:fixe|définitif|final)/iu;
  const findings: string[] = [];
  const messagingBodies = new Map<string, Set<string>>();
  for (const summary of summaries) {
    const mail = await readMessage(summary.ID);
    const subject = mail.Subject.replace(/QR-[A-Z0-9-]+|SF-[A-Z0-9]+|DR-[A-Z0-9-]+/gu, "<ref>");
    subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
    const text = visibleTextWithoutLinks(mail);
    // A link shown as its own text (auto-linked URL) is still "the link": only text outside any URL counts.
    const html = mail.HTML.replace(/href="[^"]*"/gu, "").replace(/<[^>]+>/gu, " ").replace(/https?:\/\/[^\s"'<>)]+/gu, "<lien>");
    // 1. no guarantee / price presented as binding ("non contractuelle" is the required disclaimer).
    // The fixed footer of every visitor e-mail denies any amount, guarantee or commitment: it is the requirement, not a claim.
    const claim = `${mail.Subject}\n${text}`
      .replace(/non contractuel(?:le)?s?/giu, "")
      .replace(/Aucun montant, aucune garantie et aucun engagement contractuel ne résulte de ce message\./giu, "")
      .match(contractual);
    if (claim) findings.push(`${mail.Subject}: « ${claim[0]} »`);
    // 2. no token in a visible field: only the links carry it.
    const tokens = urlsOf(mail).flatMap((url) => {
      try {
        const token = new URL(url).searchParams.get("token");
        return token && token.length >= 16 ? [token] : [];
      } catch {
        return [];
      }
    });
    for (const token of tokens) {
      if (text.includes(token) || html.includes(token)) findings.push(`${mail.Subject}: token visible outside a link`);
    }
    // 3. links go to the public application only.
    for (const url of urlsOf(mail)) {
      const origin = new URL(url).origin;
      if (origin !== e2eEnv.publicUrl) findings.push(`${mail.Subject}: link to ${origin}`);
    }
    // 4. messaging e-mails: the same text for everybody (no message body, no file name, no document label).
    if (/Nouveau message de votre courtier|Des documents vous sont demandés/u.test(mail.Subject)) {
      const normalized = text.replace(/QR-[A-Z0-9-]+/gu, "<ref>").replace(/Courtage [\w-]+ E2E \w+/gu, "<courtier>").replace(/\s+/gu, " ").trim();
      const bucket = messagingBodies.get(subject) ?? new Set<string>();
      bucket.add(normalized);
      messagingBodies.set(subject, bucket);
    }
  }
  note(`T-07 sujets : ${JSON.stringify([...subjects.entries()])}`);
  for (const [subject, bodies] of messagingBodies) {
    note(`T-07 e-mail « ${subject} » : ${bodies.size} texte(s) distinct(s) après normalisation`);
    expect(bodies.size, `messaging e-mail "${subject}" has a fixed text`).toBe(1);
  }
  expect(findings, findings.join("\n")).toEqual([]);
  expect(await searchMessages('subject:"Votre avis sur votre mise en relation"'), "survey e-mails exist").not.toHaveLength(0);
});

test.fixme("T-06 limites de débit (connexion, candidature, devis, suivi, retrait, réponse, messages, demandes de données, avis, contact)", async () => {
  // NON EXECUTE, pile jetable : chaque seuil franchi bloque l'IP (127.0.0.1) une heure pour toute la pile, y compris les autres lots.
});

test.fixme("T-09 messages d'erreur d'authentification admin/courtier", async () => {
  // Hors périmètre du fichier 04 (visiteur et facturation) : couvert par les lots 2 et 3.
});
