import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { setGlobalFlag } from "./support/admin";
import { openAs } from "./support/edge-p5p7-login";
import { e2eEnv } from "./support/env";
import {
  L4_REASON,
  createLead,
  ensureL4Firm,
  ensureRateBudget,
  note,
  publicScopeUsage,
  reserveTrackingViews,
  type L4Lead
} from "./support/edge-p5p7-support";
import {
  bigPdf,
  brokerComposer,
  brokerRequestForm,
  brokerThreadSize,
  emptyPdf,
  eicarFile,
  pdfFile,
  pdfFiles,
  sendFromBroker,
  textFile,
  visitorThreadMessages,
  visitorThreads
} from "./support/edge-p5p7-messaging";
import type { BrokerWorld } from "./support/journey-state";
import { extractLink, readMessage, searchMessages, waitForMail } from "./support/mailpit";
import { apiCall, bearerToken, closeSessions, tokenFor, visit } from "./support/pro-roles";
import { adminBearerToken, MESSAGING_FLAG, publicCall, tokenOfLink } from "./support/recos-062b";
import { submitStatusTransition } from "./support/partners";
import { card, confirmInDialog, uniqueSuffix } from "./support/ui";
import { appPage, complianceAccount, superAdminAccount } from "./support/world";
import { globalFlagIsOn, readQuoteOptions } from "./support/visitor-gaps";

// Lot 4 / file 03 - phase 6 messaging, requested documents and lead life cycle (scenario lines 351-387)
// plus A11Y-03. Own firms (l4m: messaging, l4mt: broker that gets terminated) and own leads; nothing
// here touches the base journey. No rate limit is ever pushed to its ceiling.
//   E-P6-06b/06c  broker composer: empty / 2001 chars / duplicate, files and wording on file names
//   E-P6-07a/07b  visitor composer: file labels, no wording filter (H18), duplicate, honeypot
//   E-P6-07c      read-only reasons: not accepted, closed lead, withdrawn consent
//   E-P6-07d      thresholds (31st message, 300 messages): NOT RUN, see test.fixme
//   E-P6-08b/08c  document request cap (10) and cancellation; pointer e-mails carry no content
//   E-P6-09a      terminated broker (definitive)
//   E-P6-11a      erasure details above 1000 characters
//   E-P6-12a      reassignment refusals (admin API)
//   A11Y-03       the tracking space with the keyboard only

test.describe.configure({ mode: "serial" });

const SUFFIX = uniqueSuffix();
const DUPLICATE_NOTICE = "Ce message vient déjà d'être envoyé. Attendez la réponse du visiteur avant de le renvoyer.";
const INVALID_NOTICE = "Saisie refusée : le message (2000 caractères au maximum) ou l'intitulé de la demande (120 caractères) est obligatoire.";
const FILE_NOTICE = "Fichier refusé : 3 fichiers au maximum, PDF, JPEG ou PNG de 5 Mo chacun.";
const AV_NOTICE = "Envoi refusé : un fichier n'a pas passé l'antivirus. Il n'a pas été conservé.";
const WORDING_NOTICE = "Envoi refusé : le texte contient une formulation interdite. Reformulez puis renvoyez.";

interface Fixtures {
  firm: BrokerWorld;
  terminated: BrokerWorld;
  /** Accepted: broker composer (06b/06c) then visitor composer (07a/07b). */
  l1: L4Lead;
  /** Accepted: 10 document requests (08b), keyboard journey (A11Y-03), data request (11a). */
  l2: L4Lead;
  /** Never accepted. */
  l3: L4Lead;
  /** Accepted then closed. */
  l4: L4Lead;
  /** Accepted, then the visitor withdraws the consent. */
  l5: L4Lead;
}

let fx: Fixtures;
/** Everything typed by a broker or a visitor: must never travel by e-mail (E-P6-08c). */
const secrets: string[] = [];
const visitorPages = new Map<string, Page>();
const requestLabels: string[] = [];
let adminPage: Page | undefined;

/** One tracking page opening per key for the whole file (60 consultations per hour per IP, shared). */
async function visitorPage(browser: Browser, key: string, lead: L4Lead): Promise<Page> {
  const known = visitorPages.get(key);
  if (known && !known.isClosed()) return known;
  reserveTrackingViews(1, `edge-03 ${key}`);
  const page = await appPage(browser, e2eEnv.publicUrl);
  await page.goto(lead.trackingLink);
  visitorPages.set(key, page);
  return page;
}

function visitorForm(page: Page): Locator {
  return page.locator("#conversation form[data-form='visitor-message']");
}

async function clearPicked(form: Locator): Promise<void> {
  const remove = form.locator(".am-msg__remove");
  while ((await remove.count()) > 0) await remove.first().click();
}

async function brokerPage(browser: Browser, assignmentId: string): Promise<Page> {
  return visit(browser, fx.firm.owner, `/leads/${assignmentId}`);
}

function adminHeader(): Page {
  if (!adminPage) throw new Error("admin page not open");
  return adminPage;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  // The messaging flag is shared by every lot: open it when closed, never close it.
  adminPage = await appPage(browser, e2eEnv.adminUrl);
  await openAs(adminPage, superAdminAccount(), "/feature-flags");
  if (!(await globalFlagIsOn(adminPage, MESSAGING_FLAG))) {
    await setGlobalFlag(adminPage, MESSAGING_FLAG, true, L4_REASON);
    note("edge-03 broker_visitor_messaging_enabled was closed: opened (never closed by this file)");
  }
  expect(await globalFlagIsOn(adminPage, MESSAGING_FLAG), "messaging flag is on").toBe(true);

  const firm = await ensureL4Firm(browser, "l4m", "l4m");
  const terminated = await ensureL4Firm(browser, "l4mt", "l4mt");
  const l1 = await createLead(browser, firm, "l4m1", { accept: true });
  const l2 = await createLead(browser, firm, "l4m2", { accept: true });
  const l3 = await createLead(browser, firm, "l4m3");
  const l4 = await createLead(browser, firm, "l4m4", { accept: true });
  const l5 = await createLead(browser, firm, "l4m5", { accept: true });
  fx = { firm, terminated, l1, l2, l3, l4, l5 };
});

test.afterAll(async () => {
  for (const page of visitorPages.values()) await page.context().close().catch(() => undefined);
  await adminPage?.context().close().catch(() => undefined);
  await closeSessions();
});

// ---------------------------------------------------------------------------------------------
// E-P6-06b / E-P6-06c: broker composer (lead L1)
// ---------------------------------------------------------------------------------------------

test("E-P6-06b message vide, 2001 caractères : « Saisie refusée » ; rien n'est enregistré", async ({ browser }) => {
  const page = await brokerPage(browser, fx.l1.assignmentId);
  const token = await bearerToken(page);
  const before = await brokerThreadSize(token, fx.l1.assignmentId);
  const form = brokerComposer(page);
  const body = form.locator("textarea[name='body']");

  // Empty: the browser blocks the submit (required); with the check bypassed the relay answers "invalid".
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/conversation/messages")) posts.push(request.url());
  });
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  expect(await body.evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing), "native required check").toBe(true);
  expect(posts, "no request leaves the page for an empty message").toHaveLength(0);
  await form.evaluate((el) => {
    (el as HTMLFormElement).noValidate = true;
  });
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.locator("[aria-live='polite']")).toContainText(INVALID_NOTICE);

  // 2001 characters: maxlength removed to type them, the relay refuses.
  await body.evaluate((el) => el.removeAttribute("maxlength"));
  await body.fill("a".repeat(2001));
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.locator("[aria-live='polite']")).toContainText(INVALID_NOTICE);
  await expect(body).toHaveValue("a".repeat(2001));

  // API: the same refusal, no storage.
  const api = await apiCall(token, "POST", `/broker/starter/leads/${fx.l1.assignmentId}/conversation/messages`, { body: "a".repeat(2001) });
  expect([400, 422], `API 2001 chars -> ${api.status} ${api.text.slice(0, 200)}`).toContain(api.status);
  const apiEmpty = await apiCall(token, "POST", `/broker/starter/leads/${fx.l1.assignmentId}/conversation/messages`, { body: "" });
  expect([400, 422], `API empty -> ${apiEmpty.status} ${apiEmpty.text.slice(0, 200)}`).toContain(apiEmpty.status);
  expect(await brokerThreadSize(token, fx.l1.assignmentId), "nothing stored").toBe(before);
});

test("E-P6-06b message identique envoyé deux fois en moins de 5 minutes : « Ce message vient déjà d'être envoyé... »", async ({ browser }) => {
  const page = await brokerPage(browser, fx.l1.assignmentId);
  const token = await bearerToken(page);
  const text = `Message identique de contrôle L4 ${SUFFIX}`;
  secrets.push(text);
  const before = await brokerThreadSize(token, fx.l1.assignmentId);

  const form = await sendFromBroker(page, text);
  await expect(form.locator("[aria-live='polite']")).toContainText("Message envoyé.");
  await expect(page.getByRole("list", { name: "Fil de la conversation" }).getByRole("article").filter({ hasText: text })).toHaveCount(1);

  await sendFromBroker(page, text);
  await page.waitForTimeout(4_000);
  note(`E-P6-06b doublon courtier: fil de ${await brokerThreadSize(token, fx.l1.assignmentId)} message(s) après deux envois identiques (avant: ${before})`);
  await expect(brokerComposer(page).locator("[aria-live='polite']")).toContainText(DUPLICATE_NOTICE);
  expect(await brokerThreadSize(token, fx.l1.assignmentId), "the duplicate is not stored").toBe(before + 1);
  const again = await apiCall(token, "POST", `/broker/starter/leads/${fx.l1.assignmentId}/conversation/messages`, { body: text });
  expect(again.status, `API duplicate -> ${again.text.slice(0, 200)}`).toBe(409);
  expect(again.text).toContain("DUPLICATE_MESSAGE");
  expect(await brokerThreadSize(token, fx.l1.assignmentId), "the API duplicate is not stored either").toBe(before + 1);
});

test("E-P6-06c pièces : 4 fichiers, note.txt, gros.pdf, eicar.pdf, nom « garanti à vie »", async ({ browser }) => {
  const page = await brokerPage(browser, fx.l1.assignmentId);
  const token = await bearerToken(page);
  const before = await brokerThreadSize(token, fx.l1.assignmentId);
  const text = `Pièces de contrôle L4 ${SUFFIX}`;
  secrets.push(text);

  const refused = async (files: Parameters<typeof sendFromBroker>[2], notice: string): Promise<void> => {
    const form = await sendFromBroker(page, text, files);
    await expect(form.locator("[aria-live='polite']")).toContainText(notice, { timeout: 60_000 });
  };
  await refused(pdfFiles("piece", 4), FILE_NOTICE);
  await refused(textFile("note.txt"), FILE_NOTICE);
  await refused(bigPdf("gros.pdf"), FILE_NOTICE);
  await refused(eicarFile("eicar.pdf"), AV_NOTICE);
  // ASCII spelling first (accent- and case-insensitive list), then the exact spelling of the scenario.
  await refused(pdfFile("garanti a vie.pdf", "Piece"), WORDING_NOTICE);
  const formAccent = await sendFromBroker(page, text, pdfFile("garanti à vie.pdf", "Piece"));
  await expect(formAccent.locator("[aria-live='polite']")).toContainText(WORDING_NOTICE, { timeout: 30_000 });
  await expect(formAccent.locator("[aria-live='polite'] strong")).toContainText(/garanti/iu);
  expect(await brokerThreadSize(token, fx.l1.assignmentId), "no refused send was stored").toBe(before);
});

// ---------------------------------------------------------------------------------------------
// E-P6-07a / E-P6-07b: visitor composer (lead L1)
// ---------------------------------------------------------------------------------------------

test("E-P6-07a pièces du visiteur : libellés par fichier, un fichier refusé annule tout l'envoi", async ({ browser }) => {
  ensureRateBudget("lead_message", 30, 6, "E-P6-07a");
  const visitor = await visitorPage(browser, "l1", fx.l1);
  const form = visitorForm(visitor);
  await expect(form).toBeVisible();
  const picker = form.locator("input[type='file']");
  const before = (await visitorThreadMessages(fx.l1)).length;

  const expectIssue = async (files: Parameters<Locator["setInputFiles"]>[0], text: string): Promise<void> => {
    await picker.setInputFiles(files);
    await expect(form).toContainText(text);
    await clearPicked(form);
  };
  await expectIssue(bigPdf("gros.pdf"), "Le fichier « gros.pdf » dépasse 5 Mo.");
  await expectIssue(textFile("note.txt"), "Le fichier « note.txt » n'est ni un PDF, ni un JPEG, ni un PNG.");
  await expectIssue(pdfFiles("piece", 4), "Vous pouvez joindre 3 fichiers au maximum.");
  await expectIssue(emptyPdf("vide.pdf"), "Le fichier « vide.pdf » est vide.");

  // A refused file cancels the whole send: nothing is posted (client check).
  await form.locator("textarea[name='body']").fill(`Envoi avec fichier refusé L4 ${SUFFIX}`);
  await picker.setInputFiles([pdfFile("sain.pdf", "Sain"), textFile("note.txt")]);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form).toContainText("Le fichier « note.txt » n'est ni un PDF, ni un JPEG, ni un PNG.");
  expect((await visitorThreadMessages(fx.l1)).length, "nothing sent").toBe(before);
  await clearPicked(form);

  // EICAR passes the client hints and is refused by the scan: the healthy file next to it is not kept either.
  await picker.setInputFiles([pdfFile("sain.pdf", "Sain"), eicarFile("eicar.pdf")]);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.getByRole("alert")).toContainText("Une pièce jointe n'a pas passé l'analyse de sécurité. Retirez-la ou remplacez-la : votre message n'a pas été envoyé.", { timeout: 60_000 });
  expect((await visitorThreadMessages(fx.l1)).length, "all-or-nothing: no message stored").toBe(before);
  await clearPicked(form);
  await form.locator("textarea[name='body']").fill("");
});

test("E-P6-07b message visiteur « contrat validé » non filtré (H18), doublon refusé, honeypot : succès factice", async ({ browser }) => {
  ensureRateBudget("lead_message", 30, 6, "E-P6-07b");
  const visitor = await visitorPage(browser, "l1", fx.l1);
  const form = visitorForm(visitor);
  const body = form.locator("textarea[name='body']");
  const text = `Mon contrat validé est-il disponible ? L4 ${SUFFIX}`;
  secrets.push(text);
  const before = (await visitorThreadMessages(fx.l1)).length;

  await body.fill(text);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.getByRole("status").filter({ hasText: "Message envoyé." })).toBeVisible({ timeout: 30_000 });
  expect((await visitorThreadMessages(fx.l1)).filter((message) => message.body === text), "H18: stored as typed").toHaveLength(1);

  // Same text again: duplicate.
  await body.fill(text);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.getByRole("alert")).toContainText("Ce message vient déjà d'être envoyé. Patientez quelques minutes avant de le renvoyer.");
  expect((await visitorThreadMessages(fx.l1)).filter((message) => message.body === text), "duplicate not stored").toHaveLength(1);

  // Honeypot filled: the screen shows a success, nothing is written.
  const trapped = `Texte du robot L4 ${SUFFIX}`;
  await body.fill(trapped);
  await form.locator("input[name='website']").evaluate((el) => {
    (el as HTMLInputElement).value = "http://robot.example";
  });
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(form.getByRole("status").filter({ hasText: "Message envoyé." })).toBeVisible({ timeout: 30_000 });
  const after = await visitorThreadMessages(fx.l1);
  expect(after.some((message) => message.body === trapped), "honeypot message never written").toBe(false);
  expect(after.length, "only the H18 message was added").toBeGreaterThanOrEqual(before + 1);
  expect(after.filter((message) => message.body === text)).toHaveLength(1);
});

// ---------------------------------------------------------------------------------------------
// E-P6-07c: read-only reasons
// ---------------------------------------------------------------------------------------------

test("E-P6-07c avant l'acceptation du lead : aucune zone de saisie (comportement réel : conversation absente)", async ({ browser }) => {
  expect(await visitorThreads(fx.l3), "no conversation exists before the acceptance").toHaveLength(0);
  const visitor = await visitorPage(browser, "l3", fx.l3);
  await expect(visitorForm(visitor)).toHaveCount(0);
  await expect(visitor.locator("#conversation")).toContainText("Aucune conversation pour le moment. Elle s'ouvrira ici dès qu'un courtier aura pris en charge votre demande.");
  await expect(visitor.getByText("Conversation en lecture seule")).toHaveCount(0);
});

test("E-P6-07c lead clôturé : zone de saisie masquée, « Conversation en lecture seule », envoi API refusé", async ({ browser }) => {
  const broker = await brokerPage(browser, fx.l4.assignmentId);
  // A thread only exists once a message was written (accepted leads without messages show no conversation).
  const history = `Échange avant clôture L4 ${SUFFIX}`;
  secrets.push(history);
  const opened = await apiCall(await bearerToken(broker), "POST", `/broker/starter/leads/${fx.l4.assignmentId}/conversation/messages`, { body: history });
  expect(opened.status, `broker message before closure -> ${opened.text.slice(0, 200)}`).toBe(201);
  await confirmInDialog(broker, card(broker, "Actions Starter"), "Clôturer", async (dialog) => {
    await dialog.locator("#close-outcome").selectOption("sans_suite");
    await dialog.locator("#close-comment").fill("Clôture de contrôle L4 (lecture seule côté visiteur)");
  }, "Clôturer le lead");
  await expect(broker.getByText("Lead clôturé avec son issue")).toBeVisible();

  reserveTrackingViews(1, "E-P6-07c closed");
  const visitor = await visitorPage(browser, "l4", fx.l4);
  await expect(visitorForm(visitor)).toHaveCount(0);
  await expect(visitor.locator("#conversation").getByText("Conversation en lecture seule")).toBeVisible();
  await expect(visitor.locator("#conversation")).toContainText("Cette demande est clôturée : vous pouvez relire les échanges, mais plus en envoyer.");
  const [thread] = await visitorThreads(fx.l4);
  expect(thread?.readOnlyReason).toBe("lead_closed");
  expect(thread?.canSend).toBe(false);
  ensureRateBudget("lead_message", 30, 4, "E-P6-07c closed API send");
  const forced = await publicCall("POST", `/quote-requests/${fx.l4.reference}/conversations/${thread?.conversationId}/messages`, { token: tokenOfLink(fx.l4.trackingLink), json: { body: `Envoi forcé après clôture L4 ${SUFFIX}` } });
  expect(forced.status, `forced send -> ${forced.text.slice(0, 200)}`).toBe(409);
  expect(forced.text).toContain("CONVERSATION_READ_ONLY");
  // The broker cannot write either (E-P7-01b side, API).
  const token = await tokenFor(browser, fx.firm.owner);
  const brokerForced = await apiCall(token, "POST", `/broker/starter/leads/${fx.l4.assignmentId}/conversation/messages`, { body: "Message du courtier après clôture" });
  expect(brokerForced.status).toBe(409);
  expect(brokerForced.text).toContain("LEAD_CLOSED");
});

test("E-P6-07c consentement retiré : zone de saisie masquée avec le motif (un seul retrait, 5/h)", async ({ browser }) => {
  ensureRateBudget("consent_withdrawal", 5, 1, "E-P6-07c withdrawal");
  const history = `Échange avant retrait L4 ${SUFFIX}`;
  secrets.push(history);
  const brokerToken = await tokenFor(browser, fx.firm.owner);
  const opened = await apiCall(brokerToken, "POST", `/broker/starter/leads/${fx.l5.assignmentId}/conversation/messages`, { body: history });
  expect(opened.status, `broker message before withdrawal -> ${opened.text.slice(0, 200)}`).toBe(201);
  const visitor = await visitorPage(browser, "l5", fx.l5);
  await expect(visitorForm(visitor)).toBeVisible();
  await visitor.getByRole("button", { name: "Retirer mon consentement" }).click();
  await visitor.getByRole("button", { name: "Confirmer le retrait" }).click();
  await expect(visitor.getByText("Consentement retiré")).toBeVisible({ timeout: 30_000 });

  // One more opening of the tracking page to read the conversation after the withdrawal.
  reserveTrackingViews(1, "E-P6-07c withdrawn reload");
  await visitor.reload();
  await expect(visitorForm(visitor)).toHaveCount(0);
  await expect(visitor.locator("#conversation").getByText("Conversation en lecture seule")).toBeVisible();
  await expect(visitor.locator("#conversation")).toContainText("Vous avez retiré votre consentement : la conversation reste consultable, mais plus aucun message ne peut être envoyé.");
  const [thread] = await visitorThreads(fx.l5);
  expect(thread?.readOnlyReason).toBe("consent_withdrawn");
});

test.fixme("E-P6-07d 31e message en une heure ; conversation de 300 messages", async () => {
  // NON EXECUTE, pile jetable : 31 envois dépassent le plafond lead_message (30/h par IP, bloque l'IP d'une heure pour toute la pile) ;
  // 300 messages exigent des centaines d'appels et dépasseraient aussi les plafonds par conversation (20/h).
});

// ---------------------------------------------------------------------------------------------
// E-P6-08b / A11Y-03 / E-P6-11a / E-P6-08c: document requests (lead L2)
// ---------------------------------------------------------------------------------------------

test("E-P6-08b 11e demande de document ouverte : « Limite de 10 demandes de documents ouvertes atteinte pour ce lead. »", async ({ browser }) => {
  const page = await brokerPage(browser, fx.l2.assignmentId);
  const token = await bearerToken(page);
  const base = `/broker/starter/leads/${fx.l2.assignmentId}/document-requests`;
  for (let index = 1; index <= 10; index += 1) {
    const label = `Piece L4 ${index} ${SUFFIX}`;
    const note = `Precision L4 ${index} ${SUFFIX}`;
    requestLabels.push(label);
    secrets.push(label, note);
    const created = await apiCall(token, "POST", base, { label, note });
    expect(created.status, `request ${index} -> ${created.text.slice(0, 200)}`).toBe(201);
  }
  const eleventh = await apiCall(token, "POST", base, { label: `Onzieme L4 ${SUFFIX}` });
  expect(eleventh.status, `11th -> ${eleventh.text.slice(0, 200)}`).toBe(409);
  expect(eleventh.text).toContain("DOCUMENT_REQUEST_LIMIT_REACHED");

  // Screen: the preventive blocker replaces the form; the counter is full.
  await page.reload();
  await expect(page.getByText("Demandes ouvertes : 10 / 10")).toBeVisible();
  await expect(page.getByText("10 demandes de documents ouvertes au maximum : annulez-en une avant d'en créer une nouvelle.")).toBeVisible();
  await expect(brokerRequestForm(page)).toHaveCount(0);

  // The relay (what the form posts) answers with the notice key mapped to the scenario wording.
  const relayed = await page.evaluate(async (action) => {
    const data = new FormData();
    data.set("label", "Onzieme par le relais");
    const response = await fetch(action, { method: "POST", body: data, headers: { accept: "application/json" }, credentials: "same-origin" });
    return { status: response.status, json: (await response.json()) as { ok?: boolean; outcome?: string } };
  }, `/leads/${fx.l2.assignmentId}/document-requests`);
  expect(relayed.json.outcome, JSON.stringify(relayed)).toBe("request_limit");
});

test("A11Y-03 espace de suivi au clavier : fil role=log aria-live=polite, retrait du consentement (annulé), téléversement", async ({ browser }) => {
  ensureRateBudget("document_request_upload", 20, 4, "A11Y-03");
  const visitor = await visitorPage(browser, "l2", fx.l2);
  const log = visitor.locator("#conversation [role='log']");
  await expect(log).toHaveAttribute("aria-live", "polite");
  await expect(log).toHaveAttribute("aria-label", /Messages de la conversation avec/u);

  const describeFocus = (): Promise<string> =>
    visitor.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "BODY";
      const form = el.closest("form");
      const label = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 80);
      return `${el.tagName}|${(el as HTMLInputElement).type ?? ""}|${form?.getAttribute("data-form") ?? ""}|${label}`;
    });
  const resetFocus = async (): Promise<void> => {
    await visitor.evaluate(() => {
      document.getElementById("__a11y_start")?.remove();
      const start = document.createElement("span");
      start.id = "__a11y_start";
      start.tabIndex = -1;
      document.body.prepend(start);
      start.focus();
    });
  };
  const tabUntil = async (matches: (focus: string) => boolean, label: string, max = 400): Promise<string> => {
    for (let step = 0; step < max; step += 1) {
      await visitor.keyboard.press("Tab");
      const focus = await describeFocus();
      if (matches(focus)) return focus;
    }
    throw new Error(`keyboard never reached: ${label}`);
  };

  // 1. The composer of the conversation is reachable (textarea, then the send button).
  await resetFocus();
  await tabUntil((focus) => focus.startsWith("TEXTAREA"), "message textarea");
  await tabUntil((focus) => focus.includes("|visitor-message|") && focus.startsWith("BUTTON") && focus.includes("Envoyer le message"), "send message button");

  // 2. The file input of the first requested document, then the submit button, without a mouse.
  await resetFocus();
  await tabUntil((focus) => focus.startsWith("INPUT|file|document-upload"), "document file input");
  await visitor.locator(":focus").setInputFiles(pdfFile(`a11y-${SUFFIX}.pdf`, "Piece clavier"));
  await tabUntil((focus) => focus.startsWith("BUTTON") && focus.includes("Envoyer les fichiers"), "upload submit button", 20);
  await visitor.keyboard.press("Enter");
  const fulfilled = visitor.locator("#documents-demandes article[data-request-status='fulfilled']");
  await expect(fulfilled).toHaveCount(1, { timeout: 60_000 });

  // 3. Withdrawal: the toggle, the confirmation and the cancel button are keyboard operable; Annuler keeps the consent.
  await resetFocus();
  await tabUntil((focus) => focus.startsWith("BUTTON") && focus.includes("Retirer mon consentement"), "withdraw toggle");
  await visitor.keyboard.press("Enter");
  const confirmFocus = await tabUntil((focus) => focus.includes("Confirmer le retrait"), "confirm withdrawal", 5);
  expect(confirmFocus).toContain("BUTTON");
  await tabUntil((focus) => focus.startsWith("BUTTON") && focus.includes("Annuler"), "cancel withdrawal", 5);
  await visitor.keyboard.press("Enter");
  await expect(visitor.getByRole("button", { name: "Confirmer le retrait" })).toHaveCount(0);
  await expect(visitor.getByRole("button", { name: "Retirer mon consentement" })).toBeVisible();
  await expect(visitor.getByText("Consentement retiré")).toHaveCount(0);
});

test("E-P6-08b « Annuler cette demande » puis téléversement du visiteur : « Cette demande n'est plus ouverte : vos fichiers n'ont pas été envoyés. »", async ({ browser }) => {
  const labelX = requestLabels[1] as string;
  const visitor = await visitorPage(browser, "l2", fx.l2);
  const staleRequest = visitor.locator("#documents-demandes article[data-request-id]").filter({ hasText: labelX });
  await expect(staleRequest).toHaveAttribute("data-request-status", "open");
  const upload = staleRequest.locator("form[data-form='document-upload']");
  await expect(upload).toBeVisible();

  // The broker cancels it from the lead page.
  const broker = await brokerPage(browser, fx.l2.assignmentId);
  const item = broker.locator("#conversation article").filter({ hasText: labelX });
  await confirmInDialog(broker, item, "Annuler cette demande", async () => undefined, "Annuler la demande");
  await expect(broker.locator("#conversation article").filter({ hasText: labelX }).getByText("Annulée")).toBeVisible();

  // The visitor still holds the stale form: the upload is refused and nothing is kept.
  await upload.locator("input[type='file']").setInputFiles(pdfFile(`tardif-${SUFFIX}.pdf`, "Trop tard"));
  // The refusal notice lives in the card, which is re-read and turns "cancelled" right after: record every alert shown.
  await visitor.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __alerts: string[] }).__alerts = seen;
    new MutationObserver(() => {
      document.querySelectorAll("[role='alert']").forEach((el) => {
        const text = (el.textContent ?? "").trim();
        if (text && !seen.includes(text)) seen.push(text);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await upload.getByRole("button", { name: "Envoyer les fichiers" }).click();
  await expect
    .poll(() => visitor.evaluate(() => (window as unknown as { __alerts: string[] }).__alerts), { timeout: 30_000 })
    .toEqual(expect.arrayContaining([expect.stringContaining("Cette demande n'est plus ouverte : vos fichiers n'ont pas été envoyés.")]));
  await visitor.waitForTimeout(3_000);
  note(`E-P6-08b stale upload: the refusal notice is still in the page 3 s later: ${(await upload.getByRole("alert").count()) > 0}`);
  await expect(staleRequest).toHaveAttribute("data-request-status", "cancelled", { timeout: 30_000 });
  await expect(staleRequest).toContainText("Le courtier a annulé cette demande");
  await broker.reload();
  const files = broker.locator("#conversation article").filter({ hasText: labelX }).getByRole("list", { name: "Fichiers reçus" });
  await expect(files).toHaveCount(0);
});

test("E-P6-11a précisions de 1001 caractères refusées pour « Effacer mes données » (un seul appel API)", async () => {
  ensureRateBudget("data_request", 5, 3, "E-P6-11a");
  const token = tokenOfLink(fx.l2.trackingLink);
  const tooLong = await publicCall("POST", `/quote-requests/${fx.l2.reference}/data-requests`, { token, json: { type: "erasure", detail: "d".repeat(1001) } });
  expect(tooLong.status, `1001 chars -> ${tooLong.text.slice(0, 200)}`).toBe(400);
  note(`E-P6-11a 1001-char detail -> ${tooLong.status} ${tooLong.text.slice(0, 200)}`);
  const listed = await publicCall("GET", `/quote-requests/${fx.l2.reference}/data-requests`, { token });
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body), "nothing filed by the refused call").not.toContain("DR-");

  // A valid request with a distinctive text: its acknowledgement e-mail is checked by E-P6-08c.
  const detail = `Precision effacement L4 ${SUFFIX}`;
  secrets.push(detail);
  const created = await publicCall("POST", `/quote-requests/${fx.l2.reference}/data-requests`, { token, json: { type: "erasure", detail } });
  expect(created.status, `valid request -> ${created.text.slice(0, 200)}`).toBe(201);
});

test("E-P6-08c e-mails de messagerie, de documents et de demandes de données : aucun contenu saisi, aucun intitulé, aucun nom de fichier", async () => {
  const filenames = ["precisions", `a11y-${SUFFIX}`, `tardif-${SUFFIX}`, "garanti", "gros.pdf", "eicar", "sain.pdf", "note.txt"];
  const forbidden = [...secrets, ...filenames.filter((name) => name !== "garanti" && name !== "precisions")];
  const subjects = /Nouveau message de votre courtier|documents vous sont demandés|Votre demande DR-/u;
  const l1Mail = await waitForMail({ to: fx.l1.email, subject: /Nouveau message de votre courtier/u });
  const l2Docs = await waitForMail({ to: fx.l2.email, subject: /documents vous sont demandés/u });
  const l2Data = await waitForMail({ to: fx.l2.email, subject: /Votre demande DR-/u });
  expect(l1Mail.Subject).toContain(fx.l1.reference);
  expect(l2Docs.Subject).toContain(fx.l2.reference);

  let checked = 0;
  for (const email of [fx.l1.email, fx.l2.email]) {
    for (const summary of await searchMessages(`to:"${email}"`)) {
      if (!subjects.test(summary.Subject)) continue;
      const mail = await readMessage(summary.ID);
      const content = `${mail.Subject}\n${mail.Text}\n${mail.HTML}`;
      for (const secret of forbidden) expect(content, `"${summary.Subject}" must not repeat "${secret}"`).not.toContain(secret);
      // Only a pointer to the tracking space (a tracking link), the broker named.
      expect(content).toMatch(/demandes-de-devis\/QR-/u);
      checked += 1;
    }
  }
  expect(checked, "at least the three pointer e-mails were inspected").toBeGreaterThanOrEqual(3);
  expect(extractLink(l2Data, /\/demandes-de-devis\/QR-/u)).toContain(fx.l2.reference);
});

// ---------------------------------------------------------------------------------------------
// E-P6-09a: terminated broker, then E-P6-12a: reassignment refusals
// ---------------------------------------------------------------------------------------------

test("E-P6-09a courtier résilié : le propriétaire ne peut plus se reconnecter, ses offres ne sont plus routées", async ({ browser }) => {
  const partner = fx.terminated;
  const compliance = await appPage(browser, e2eEnv.adminUrl);
  await openAs(compliance, complianceAccount(), `/partners/${partner.partnerId}`);
  if ((await compliance.getByText("Courtier résilié").count()) === 0) {
    await submitStatusTransition(compliance, "Résilier", "Résilié", true);
  }
  await compliance.goto(`/partners/${partner.partnerId}`);
  await expect(compliance.getByText("Courtier résilié : la fiche est en lecture seule et ses utilisateurs n'ont plus accès au portail.")).toBeVisible();
  await compliance.context().close();

  // The owner cannot log in any more (screen: no session, API: 401 "Account unavailable").
  const login = await appPage(browser, e2eEnv.brokerUrl);
  await login.goto("/login");
  await login.locator("#login-email").fill(partner.owner.email);
  await login.locator("#login-password").fill(partner.owner.password);
  await login.getByRole("button", { name: "Se connecter" }).click();
  await login.waitForLoadState("networkidle");
  expect(new URL(login.url()).pathname, "still on the login screen").toMatch(/^\/login/u);
  expect((await login.context().cookies()).some((cookie) => cookie.name === "assurmatch_broker_token"), "no session cookie").toBe(false);
  const screenText = (await login.locator("main, body").first().innerText()).replace(/\s+/gu, " ");
  note(`E-P6-09a login screen text after a refused login of a terminated broker: ${screenText.slice(0, 300)}`);
  await login.screenshot({ path: "test-results/edge-p5p7-03/evidence-E-P6-09a-login.png" });
  await login.context().close();
  const api = await apiCall(undefined, "POST", "/auth/login", { email: partner.owner.email, password: partner.owner.password });
  expect(api.status, `API login -> ${api.text.slice(0, 200)}`).toBe(401);
  expect(api.text).toContain("Account unavailable");
  note(`E-P6-09a API login of a terminated broker -> ${api.status} ${api.text.slice(0, 160)}`);

  // Its leads are not routed any more: the offer is no longer offered to visitors.
  const options = await readQuoteOptions([partner.offerId as string]);
  expect(options.offers.map((offer) => offer.offerId), "terminated broker's offer not available").not.toContain(partner.offerId);
});

test("E-P6-12a réaffectation refusée : même courtier, courtier inéligible, motif de 7 caractères, compliance_admin", async ({ browser }) => {
  const reassignPath = `/admin/lead-assignments/${fx.l1.assignmentId}/reassign`;
  const adminToken = await adminBearerToken(adminHeader());
  const reason = "Motif de test E2E lot 4";

  // Same broker -> conflict same_partner.
  const same = await apiCall(adminToken, "POST", reassignPath, { partnerTenantId: fx.firm.partnerId, reason });
  expect(same.status, `same partner -> ${same.text.slice(0, 300)}`).toBe(409);
  expect(same.text).toContain("same_partner");
  note(`E-P6-12a same partner -> ${same.status} ${same.text.slice(0, 160)}`);

  // Ineligible broker (terminated in E-P6-09a).
  const ineligible = await apiCall(adminToken, "POST", reassignPath, { partnerTenantId: fx.terminated.partnerId, reason });
  expect(ineligible.text, `ineligible -> ${ineligible.status}`).toContain("Partner not eligible");
  expect(ineligible.status, `ineligible status ${ineligible.text.slice(0, 300)}`).toBeLessThan(500);
  note(`E-P6-12a ineligible partner -> ${ineligible.status} ${ineligible.text.slice(0, 200)}`);

  // Screen: the form refuses a 7-character reason before any request.
  const admin = adminHeader();
  await openAs(admin, superAdminAccount(), `/lead-assignments?partnerTenantId=${fx.firm.partnerId}`);
  const row = admin.getByRole("row").filter({ hasText: fx.l1.reference });
  await row.locator("details > summary").click();
  const form = row.locator("form[data-operations-form='reassign']");
  await form.locator("input[name='partnerTenantId']").fill(fx.terminated.partnerId);
  await form.locator("input[name='reason']").fill("1234567");
  await form.getByRole("button", { name: "Réaffecter" }).click();
  expect(await form.locator("input[name='reason']").evaluate((el) => (el as HTMLInputElement).validity.tooShort), "minLength 8 on the screen").toBe(true);
  await expect(form.locator(".bo-notice")).toHaveCount(0);

  // compliance_admin: 403 (reserved to admin_pays and Super Admin).
  const complianceBrowser = await appPage(browser, e2eEnv.adminUrl);
  await openAs(complianceBrowser, complianceAccount(), "/");
  const complianceToken = await adminBearerToken(complianceBrowser);
  const forbidden = await apiCall(complianceToken, "POST", reassignPath, { partnerTenantId: fx.terminated.partnerId, reason });
  expect(forbidden.status, `compliance_admin -> ${forbidden.text.slice(0, 300)}`).toBe(403);
  note(`E-P6-12a compliance_admin -> ${forbidden.status} ${forbidden.text.slice(0, 160)}`);
  await complianceBrowser.context().close();

  // The lead stayed with its broker.
  const leadStill = await apiCall(await tokenFor(browser, fx.firm.owner), "GET", `/broker/starter/leads/${fx.l1.assignmentId}`);
  expect(leadStill.status, "lead L1 still readable by its broker").toBe(200);
  expect(publicScopeUsage("tracking_status")?.count ?? 0).toBeLessThanOrEqual(60);
});

test("E-P6-12a motif de 7 caractères refusé aussi par l'API (400 avant le contrôle d'éligibilité)", async () => {
  // The target is the terminated broker: whatever the reason check does, no lead can move.
  const adminToken = await adminBearerToken(adminHeader());
  const shortReason = await apiCall(adminToken, "POST", `/admin/lead-assignments/${fx.l1.assignmentId}/reassign`, { partnerTenantId: fx.terminated.partnerId, reason: "1234567" });
  note(`E-P6-12a 7-char reason -> ${shortReason.status} ${shortReason.text.slice(0, 200)}`);
  expect(shortReason.text, "the reason must be refused before the eligibility check").not.toContain("Partner not eligible");
  expect(shortReason.status).toBe(400);
});
