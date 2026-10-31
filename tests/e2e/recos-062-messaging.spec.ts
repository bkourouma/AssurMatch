import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { setGlobalFlag } from "./support/admin";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { eicarFile, pdfFile } from "./support/files";
import { requireWorld } from "./support/journey-state";
import { extractLink, messageIdsTo, searchMessages, waitForMail } from "./support/mailpit";
import { apiCall, bearerToken } from "./support/pro-roles";
import {
  MESSAGING_FLAG,
  activeRun,
  ensureFirm,
  leadOf,
  mailpitAttachmentCount,
  markRunDone,
  tokenOf,
  uploadFiles,
  visitorConversationId,
  visitorConversations,
  type FirmLead
} from "./support/recos-062";
import { escapeRegExp, uniqueSuffix } from "./support/ui";
import { WORLD_REASON, appPage, superAdminAccount } from "./support/world";
import type { BackOfficeAccount } from "./support/backoffice";
import type { BrokerWorld } from "./support/journey-state";

// Spec 065 phase B / lot 062 - broker <-> visitor messaging (steps 28a-28i of the scenario).
//   MSG-00  the flag is opened by the Super Admin; a Starter firm and a Pro firm, each with a published
//           offer and two accepted leads (A and B), are built;
//   MSG-01  Starter: message with a PDF -> pointer e-mail without content -> magic link -> the visitor
//           reads, downloads, replies -> the broker reads the reply, the "Lu" marker, the notification;
//   MSG-02  the same on the CRM side (Pro owner, /crm/leads/[id]?tab=conversation);
//   MSG-03  forbidden wording is refused (expression shown, draft kept, nothing stored nor sent);
//   MSG-04  document request fulfilled by the visitor (PDF); an EICAR upload is refused, request open;
//   MSG-05  flag OFF: writes are blocked on both sides, reads still work; flag back ON at the end.

test.describe.configure({ mode: "serial" });

type Channel = "starter" | "crm";

const STARTER_LABEL = "m062s";
const PRO_LABEL = "m062p";

// ---------------------------------------------------------------------------------------------
// Broker-side helpers
// ---------------------------------------------------------------------------------------------

function conversationPath(channel: Channel, assignmentId: string): string {
  return channel === "crm" ? `/crm/leads/${assignmentId}?tab=conversation` : `/leads/${assignmentId}`;
}

async function openConversation(page: Page, owner: BackOfficeAccount, channel: Channel, assignmentId: string): Promise<void> {
  await openAs(page, owner, conversationPath(channel, assignmentId));
  await expect(page.locator("#conversation").getByRole("heading", { name: "Échanger avec le visiteur" })).toBeVisible();
}

function thread(page: Page): Locator {
  return page.getByRole("list", { name: "Fil de la conversation" });
}

function brokerMessage(page: Page, text: string): Locator {
  return thread(page).getByRole("article").filter({ hasText: text });
}

function composer(page: Page): Locator {
  return page.locator("form[aria-label='Nouveau message au visiteur']");
}

function documentRequestForm(page: Page): Locator {
  return page.locator("form[aria-label='Nouvelle demande de document']");
}

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

async function sendFromBroker(page: Page, text: string, file?: UploadFile): Promise<Locator> {
  const form = composer(page);
  await form.locator("textarea[name='body']").fill(text);
  if (file) await form.locator("input[name='files']").setInputFiles(file);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  return form;
}

/**
 * Downloads a file served by a same-origin relay with the page session and compares it with `expected`.
 * The fetch runs IN the page: the session cookie is Secure, so Playwright's own request context would not send it over http.
 */
async function expectDownloadMatches(page: Page, href: string, expected: Buffer): Promise<void> {
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin", redirect: "manual" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      status: response.status,
      type: response.type,
      disposition: response.headers.get("content-disposition") ?? "",
      cache: response.headers.get("cache-control") ?? "",
      sniff: response.headers.get("x-content-type-options") ?? "",
      contentType: response.headers.get("content-type") ?? "",
      base64: btoa(binary)
    };
  }, href);
  expect(result.status, `download ${href} (${result.type})`).toBe(200);
  expect(result.contentType, "served as a PDF").toContain("application/pdf");
  expect(result.disposition, "served as an attachment").toMatch(/attachment/iu);
  expect(result.cache).toContain("no-store");
  expect(result.sniff).toBe("nosniff");
  expect(Buffer.compare(Buffer.from(result.base64, "base64"), expected), "downloaded bytes equal the uploaded file").toBe(0);
}

async function hrefOf(link: Locator): Promise<string> {
  const href = await link.getAttribute("href");
  if (!href) throw new Error("link without href");
  return href;
}

// ---------------------------------------------------------------------------------------------
// Visitor-side helpers
// ---------------------------------------------------------------------------------------------

async function openTracking(browser: Browser, link: string): Promise<Page> {
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(link);
  return visitor;
}

/** The visitor's conversations section of the tracking space. */
function visitorConversation(visitor: Page): Locator {
  return visitor.locator("#conversation");
}

async function visitorDownload(page: Page, link: Locator): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** The e-mail must be a pointer: nothing of the message, no attachment, the broker named. */
async function expectPointerMail(
  mail: { ID: string; Text: string; HTML: string; Subject: string },
  options: { partnerName: string; forbidden: string[] }
): Promise<void> {
  const content = `${mail.Subject}\n${mail.Text}\n${mail.HTML}`;
  expect(content, "the broker is named").toContain(options.partnerName);
  for (const secret of options.forbidden) expect(content, `the e-mail must not repeat "${secret}"`).not.toContain(secret);
  expect(await mailpitAttachmentCount(mail.ID), "a pointer e-mail carries no attachment").toBe(0);
}

/** E-mails to `to` that are not in `seen` and whose subject matches `subject`. */
async function newMails(to: string, seen: ReadonlySet<string>, subject: RegExp): Promise<string[]> {
  return (await searchMessages(`to:"${to}"`)).filter((mail) => !seen.has(mail.ID) && subject.test(mail.Subject)).map((mail) => mail.Subject);
}

const MESSAGE_MAIL = /Nouveau message de votre courtier/u;
const DOCUMENTS_MAIL = /documents vous sont demandés/u;

// ---------------------------------------------------------------------------------------------
// MSG-00
// ---------------------------------------------------------------------------------------------

test("MSG-00 le Super Admin ouvre la messagerie courtier-visiteur ; un cabinet Starter et un cabinet Pro ont chacun une offre publiée et deux leads acceptés", async ({ browser }) => {
  test.setTimeout(30 * 60_000);

  // 28a: the flag is closed by default; opened through the audited flags screen (idempotent).
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  await setGlobalFlag(admin, MESSAGING_FLAG, true, WORLD_REASON);
  await expect(admin.getByRole("row").filter({ hasText: MESSAGING_FLAG }).getByRole("button", { name: "Désactiver", exact: true })).toBeVisible();
  await admin.context().close();

  const starter = await ensureFirm(browser, activeRun().starter, "starter", STARTER_LABEL);
  const pro = await ensureFirm(browser, activeRun().pro, "pro", PRO_LABEL);
  for (const world of [starter, pro]) {
    for (const lead of ["A", "B"] as const) expect(leadOf(world, lead).assignmentId).toMatch(/^[0-9a-f-]{36}$/u);
  }
});

// ---------------------------------------------------------------------------------------------
// MSG-01 / MSG-02: the full exchange, Starter then CRM
// ---------------------------------------------------------------------------------------------

async function exchangeJourney(browser: Browser, channel: Channel, world: BrokerWorld, lead: FirmLead): Promise<void> {
  const owner = world.owner;
  const suffix = uniqueSuffix();
  const brokerText = `Bonjour, pouvez-vous préciser l'année du véhicule ? Réf. ${suffix}`;
  const visitorText = `Bonjour, il s'agit d'un véhicule de 2019. Réf. ${suffix}`;
  const brokerPdf = pdfFile(`precisions-${suffix}.pdf`, `Precisions ${lead.reference}`);
  const visitorPdf = pdfFile(`reponse-${suffix}.pdf`, `Reponse ${lead.reference}`);

  // 28b: the broker writes with a PDF attachment.
  const visitorMailsBefore = await messageIdsTo(lead.email);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openConversation(broker, owner, channel, lead.assignmentId);
  // The fixed non-contractual mention (constitution I) frames the exchange.
  await expect(broker.locator("#conversation")).toContainText("plateforme technique");
  const form = await sendFromBroker(broker, brokerText, brokerPdf);
  await expect(form.getByText(/Message envoyé/u)).toBeVisible();
  const sent = brokerMessage(broker, brokerText);
  await expect(sent).toBeVisible();
  await expect(sent.getByRole("link", { name: brokerPdf.name })).toBeVisible();
  await expect(sent).toContainText("Non lu");

  // The visitor gets a POINTER e-mail: no text of the message, no file name, no attachment.
  const pointer = await waitForMail({ to: lead.email, exclude: visitorMailsBefore, subject: MESSAGE_MAIL });
  expect(pointer.Subject).toContain(lead.reference);
  await expectPointerMail(pointer, { partnerName: world.partnerName, forbidden: [brokerText, suffix, brokerPdf.name, "précisions"] });
  const magicLink = extractLink(pointer, new RegExp(`/demandes-de-devis/${lead.reference}\\?token=`, "u"));

  // 28d: the visitor opens the tracking space with the magic link of the e-mail, reads and downloads.
  const visitor = await openTracking(browser, magicLink);
  const conversation = visitorConversation(visitor);
  await expect(conversation).toBeVisible();
  await expect(conversation).toContainText(world.partnerName);
  await expect(conversation).toContainText("plateforme technique");
  const received = conversation.locator(".am-msg__item").filter({ hasText: brokerText });
  await expect(received).toBeVisible();
  const attachmentLink = received.getByRole("link", { name: new RegExp(escapeRegExp(brokerPdf.name), "u") });
  const downloaded = await visitorDownload(visitor, attachmentLink);
  expect(Buffer.compare(downloaded, brokerPdf.buffer), "the visitor downloads the broker's PDF unchanged").toBe(0);

  // The thread being shown marks the broker's message as read (best effort, a few seconds).
  await expect
    .poll(
      async () => {
        await openConversation(broker, owner, channel, lead.assignmentId);
        return (await brokerMessage(broker, brokerText).innerText()).replace(/\s+/gu, " ");
      },
      { timeout: 60_000, intervals: [2_000, 3_000], message: "the broker's message is marked 'Lu' once the visitor opened it" }
    )
    .toMatch(/Lu le \d{4}-\d{2}-\d{2}/u);

  // The visitor replies, with a PDF.
  const brokerMailsBefore = await messageIdsTo(owner.email);
  const reply = conversation.locator("form[data-form='visitor-message']");
  await reply.locator("textarea[name='body']").fill(visitorText);
  await reply.locator("input[type='file']").setInputFiles(visitorPdf);
  await reply.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(reply.getByText("Message envoyé.")).toBeVisible();
  await expect(conversation.locator(".am-msg__item").filter({ hasText: visitorText })).toBeVisible();

  // 28d/28e: the broker gets a pointer e-mail and an in-app notification that opens the conversation.
  const brokerMail = await waitForMail({ to: owner.email, exclude: brokerMailsBefore, subject: /Nouveau message d'un visiteur/u });
  const brokerMailContent = `${brokerMail.Subject}\n${brokerMail.Text}\n${brokerMail.HTML}`;
  expect(brokerMailContent, "the broker e-mail does not repeat the visitor's text").not.toContain(visitorText);
  expect(brokerMailContent).not.toContain(visitorPdf.name);
  expect(await mailpitAttachmentCount(brokerMail.ID)).toBe(0);

  await openAs(broker, owner, "/notifications");
  const open = broker.locator(`a[href*='${lead.assignmentId}']`).filter({ hasText: "Ouvrir la conversation" }).first();
  await expect(open).toBeVisible();
  expect(await hrefOf(open)).toContain(channel === "crm" ? `/crm/leads/${lead.assignmentId}?tab=conversation` : `/leads/${lead.assignmentId}#conversation`);
  await open.click();
  await broker.waitForURL(channel === "crm" ? /\/crm\/leads\/[0-9a-f-]{36}\?tab=conversation/u : /\/leads\/[0-9a-f-]{36}#conversation/u);
  await expect(broker.locator("#conversation").getByRole("heading", { name: "Échanger avec le visiteur" })).toBeVisible();

  // The reply is in the thread, its file downloads and the visitor is marked as read.
  const answer = brokerMessage(broker, visitorText);
  await expect(answer).toBeVisible();
  await expect(answer.locator("[data-message-sender='visitor']")).toBeVisible();
  const replyLink = answer.getByRole("link", { name: visitorPdf.name });
  await expectDownloadMatches(broker, await hrefOf(replyLink), visitorPdf.buffer);

  // The broker opening the thread leaves a read receipt on the visitor's message: "Lu" in the visitor's space.
  await visitor.goto(magicLink);
  await expect(visitorConversation(visitor).locator("[data-from='visitor'] .am-msg__receipt")).toBeVisible({ timeout: 30_000 });
  await expect(visitorConversation(visitor).locator("[data-from='visitor'] .am-msg__receipt")).toContainText("Lu");

  await visitor.context().close();
  await broker.context().close();
}

test("MSG-01 le propriétaire Starter écrit au visiteur avec un PDF ; e-mail pointeur sans contenu ; le visiteur lit, télécharge, répond ; accusé « Lu » et notification côté courtier", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const world = requireWorld(activeRun().starter);
  await exchangeJourney(browser, "starter", world, leadOf(world, "A"));
});

test("MSG-02 le propriétaire Pro fait de même depuis la fiche CRM (onglet Conversation)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const world = requireWorld(activeRun().pro);
  await exchangeJourney(browser, "crm", world, leadOf(world, "A"));
});

// ---------------------------------------------------------------------------------------------
// MSG-03: forbidden wording (constitution I)
// ---------------------------------------------------------------------------------------------

async function expectWordingRefused(browser: Browser, channel: Channel, world: BrokerWorld, lead: FirmLead, text: string, expression: RegExp): Promise<void> {
  const seen = await messageIdsTo(lead.email);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openConversation(broker, world.owner, channel, lead.assignmentId);
  const form = await sendFromBroker(broker, text);
  // 28c: the offending expression is displayed and the draft stays in the field.
  await expect(form.getByText(/Expression\(s\) refusée\(s\)/u)).toBeVisible();
  await expect(form.locator("[aria-live='polite'] strong")).toHaveText(expression);
  await expect(form.locator("textarea[name='body']")).toHaveValue(text);
  await broker.reload();
  await expect(broker.getByText("Aucun message échangé avec le visiteur pour ce lead.")).toBeVisible();

  // The API refuses it as well (422 FORBIDDEN_WORDING) and nothing is stored.
  const token = await bearerToken(broker);
  const api = `/broker/${channel}/leads/${lead.assignmentId}`;
  const refused = await apiCall(token, "POST", `${api}/conversation/messages`, { body: text });
  expect(refused.status).toBe(422);
  expect(refused.text).toContain("FORBIDDEN_WORDING");
  const stored = await apiCall(token, "GET", `${api}/conversation`);
  expect(stored.status).toBe(200);
  expect(((stored.body as { messages?: unknown[] }).messages ?? []).length, "no message stored").toBe(0);

  // Nothing is sent to the visitor.
  await broker.waitForTimeout(8_000);
  expect(await newMails(lead.email, seen, /message|documents/iu), "no pointer e-mail for a refused message").toEqual([]);
  await broker.context().close();
}

test("MSG-03 une formulation interdite (« contrat validé », « guaranteed ») est refusée à l'envoi : l'expression est citée, le brouillon reste, rien n'est enregistré ni envoyé", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const starter = requireWorld(activeRun().starter);
  await expectWordingRefused(browser, "starter", starter, leadOf(starter, "B"), "Bonjour, votre contrat validé est disponible chez nous.", /«\s*contrat valid[ée]\s*»/u);

  const pro = requireWorld(activeRun().pro);
  await expectWordingRefused(browser, "crm", pro, leadOf(pro, "B"), "Hello, the price is guaranteed for you.", /«\s*guaranteed\s*»/u);

  // The document-request note is guarded too (Starter lead B): refused, no request created, no e-mail.
  const lead = leadOf(starter, "B");
  const seen = await messageIdsTo(lead.email);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openConversation(broker, starter.owner, "starter", lead.assignmentId);
  const form = documentRequestForm(broker);
  await form.locator("input[name='label']").fill("Carte grise");
  await form.locator("textarea[name='note']").fill("Envoyez-la pour obtenir un devis garanti.");
  await form.getByRole("button", { name: "Demander le document au visiteur" }).click();
  await expect(form.getByText(/Expression\(s\) refusée\(s\)/u)).toBeVisible();
  await expect(form.locator("[aria-live='polite'] strong")).toHaveText(/«\s*devis garanti\s*»/u);
  await broker.reload();
  await expect(broker.getByText("Aucune demande de document pour ce lead.")).toBeVisible();
  await broker.waitForTimeout(8_000);
  expect(await newMails(lead.email, seen, /message|documents/iu)).toEqual([]);
  await broker.context().close();
});

// ---------------------------------------------------------------------------------------------
// MSG-04: document request (Starter lead B)
// ---------------------------------------------------------------------------------------------

test("MSG-04 le courtier demande une « Carte grise » : l'EICAR du visiteur est refusé (demande ouverte), puis son PDF sain l'honore ; le courtier télécharge le fichier", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const world = requireWorld(activeRun().starter);
  const lead = leadOf(world, "B");
  const suffix = uniqueSuffix();
  const label = "Carte grise";
  const note = `Photo ou scan lisible, réf. ${suffix}`;
  const secondLabel = "Attestation de domicile";
  const healthy = pdfFile(`carte-grise-${suffix}.pdf`, `Carte grise ${lead.reference}`);
  const infected = eicarFile(`eicar-${suffix}.pdf`);

  // 28f: the broker asks for two documents (the second one stays open for MSG-05).
  const seen = await messageIdsTo(lead.email);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  await openConversation(broker, world.owner, "starter", lead.assignmentId);
  const form = documentRequestForm(broker);
  await form.locator("input[name='label']").fill(label);
  await form.locator("textarea[name='note']").fill(note);
  await form.locator("input[name='dueAt']").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Demander le document au visiteur" }).click();
  await expect(form.getByText(/Demande de document créée/u)).toBeVisible();
  const requested = broker.locator("#conversation article").filter({ hasText: label }).first();
  await expect(requested).toContainText("Ouverte");
  await expect(requested).toContainText("Aucun fichier reçu pour l'instant");
  await form.locator("input[name='label']").fill(secondLabel);
  await form.getByRole("button", { name: "Demander le document au visiteur" }).click();
  await expect(broker.locator("#conversation article").filter({ hasText: secondLabel }).first()).toContainText("Ouverte");

  // The visitor gets a pointer e-mail that does not repeat the label nor the note.
  const mail = await waitForMail({ to: lead.email, exclude: seen, subject: DOCUMENTS_MAIL });
  await expectPointerMail(mail, { partnerName: world.partnerName, forbidden: [label, note, suffix, secondLabel] });
  const magicLink = extractLink(mail, new RegExp(`/demandes-de-devis/${lead.reference}\\?token=`, "u"));

  // 28g: the visitor sees the request and tries an infected file first.
  const visitor = await openTracking(browser, magicLink);
  const request = visitor.locator("#documents-demandes article[data-request-id]").filter({ hasText: label });
  await expect(request).toBeVisible();
  await expect(request).toHaveAttribute("data-request-status", "open");
  await expect(request).toContainText(note);
  const upload = request.locator("form[data-form='document-upload']");
  await upload.locator("input[type='file']").setInputFiles(infected);
  await upload.getByRole("button", { name: "Envoyer les fichiers" }).click();
  await expect(upload.getByRole("alert")).toContainText("n'a pas passé l'analyse de sécurité");
  await expect(request).toHaveAttribute("data-request-status", "open");
  // After a reload the request is still open and nothing was received.
  await visitor.reload();
  const reloaded = visitor.locator("#documents-demandes article[data-request-id]").filter({ hasText: label });
  await expect(reloaded).toHaveAttribute("data-request-status", "open");
  await expect(reloaded).not.toContainText("fichier transmis");

  // Then a healthy PDF fulfils it.
  const retry = reloaded.locator("form[data-form='document-upload']");
  await retry.locator("input[type='file']").setInputFiles(healthy);
  await retry.getByRole("button", { name: "Envoyer les fichiers" }).click();
  await expect(reloaded).toHaveAttribute("data-request-status", "fulfilled", { timeout: 60_000 });
  await expect(reloaded).toContainText("Fournie");
  // The second request is untouched.
  await expect(visitor.locator("#documents-demandes article[data-request-id]").filter({ hasText: secondLabel })).toHaveAttribute("data-request-status", "open");
  await visitor.context().close();

  // 28h: the broker sees it received and downloads the file; the infected file was never kept.
  await openConversation(broker, world.owner, "starter", lead.assignmentId);
  const fulfilled = broker.locator("#conversation article").filter({ hasText: label }).first();
  await expect(fulfilled).toContainText("Reçue");
  const files = fulfilled.getByRole("list", { name: "Fichiers reçus" });
  await expect(files).toContainText(healthy.name);
  await expect(broker.locator("#conversation")).not.toContainText("eicar");
  await expectDownloadMatches(broker, await hrefOf(files.getByRole("link", { name: healthy.name })), healthy.buffer);
  await expect(broker.locator("#conversation article").filter({ hasText: secondLabel }).first()).toContainText("Ouverte");

  // The broker is notified ("Document reçu").
  await expect
    .poll(
      async () => {
        await openAs(broker, world.owner, "/notifications");
        return broker.locator(`a[href*='${lead.assignmentId}']`).filter({ hasText: "Ouvrir la conversation" }).count();
      },
      { timeout: 60_000, intervals: [2_000, 3_000], message: "in-app notification for the document received" }
    )
    .toBeGreaterThan(0);
  await expect(broker.getByText("Document reçu", { exact: true }).first()).toBeVisible();
  await broker.context().close();
});

// ---------------------------------------------------------------------------------------------
// MSG-05: flag off (28i), then on again
// ---------------------------------------------------------------------------------------------

test("MSG-05 messagerie coupée par l'admin : plus aucune écriture (courtier, visiteur, téléversement), l'historique reste lisible ; puis rétablie", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const world = requireWorld(activeRun().starter);
  const leadA = leadOf(world, "A");
  const leadB = leadOf(world, "B");
  const admin = await appPage(browser, e2eEnv.adminUrl);
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  const visitorA = await appPage(browser, e2eEnv.publicUrl);
  const visitorB = await appPage(browser, e2eEnv.publicUrl);

  try {
    // Lead A has history (MSG-01): two messages at least. Lead B has an open request (MSG-04).
    await openConversation(broker, world.owner, "starter", leadA.assignmentId);
    const historyBefore = await thread(broker).getByRole("article").count();
    expect(historyBefore, "history of MSG-01").toBeGreaterThanOrEqual(2);
    await expect(composer(broker)).toBeVisible();

    await openAs(admin, superAdminAccount(), "/feature-flags");
    await setGlobalFlag(admin, MESSAGING_FLAG, false, WORLD_REASON);
    await expect(admin.getByRole("row").filter({ hasText: MESSAGING_FLAG }).getByRole("button", { name: "Activer", exact: true })).toBeVisible();

    // Broker: history readable, no composer, no request form, and the API refuses the writes (409).
    await expect
      .poll(async () => {
        await openConversation(broker, world.owner, "starter", leadA.assignmentId);
        return composer(broker).count();
      }, { timeout: 60_000, intervals: [2_000, 3_000], message: "the broker composer disappears once the flag is off" })
      .toBe(0);
    await expect(broker.locator("#conversation")).toContainText("temporairement désactivée par AssurMatch");
    expect(await thread(broker).getByRole("article").count(), "history still readable").toBe(historyBefore);
    await expect(documentRequestForm(broker)).toHaveCount(0);
    const token = await bearerToken(broker);
    const apiA = `/broker/starter/leads/${leadA.assignmentId}`;
    const send = await apiCall(token, "POST", `${apiA}/conversation/messages`, { body: "Message envoyé alors que la messagerie est coupée." });
    expect(send.status).toBe(409);
    expect(send.text).toContain("MESSAGING_DISABLED");
    const create = await apiCall(token, "POST", `${apiA}/document-requests`, { label: "Permis de conduire" });
    expect(create.status).toBe(409);
    expect(create.text).toContain("MESSAGING_DISABLED");
    const read = await apiCall(token, "GET", `${apiA}/conversation`);
    expect(read.status, "reading the thread still works").toBe(200);
    expect(((read.body as { messages?: unknown[] }).messages ?? []).length).toBe(historyBefore);
    const listed = await apiCall(token, "GET", `/broker/starter/leads/${leadB.assignmentId}/document-requests`);
    expect(listed.status, "reading the requests still works").toBe(200);
    const open = ((listed.body as { items?: Array<{ id: string; status: string }> }).items ?? []).find((item) => item.status === "open");
    expect(open, "the second request of MSG-04 is still open").toBeDefined();
    const cancel = await apiCall(token, "POST", `/broker/starter/leads/${leadB.assignmentId}/document-requests/${open?.id}/cancel`, {});
    expect(cancel.status).toBe(409);
    expect(cancel.text).toContain("MESSAGING_DISABLED");

    // Visitor A: the history is readable, no form, the API refuses a reply.
    await visitorA.goto(leadA.trackingLink);
    const conversation = visitorConversation(visitorA);
    await expect(conversation).toContainText("La messagerie est suspendue pour le moment");
    expect(await conversation.locator(".am-msg__item").count(), "the visitor still reads the exchange").toBe(historyBefore);
    await expect(conversation.locator("form[data-form='visitor-message']")).toHaveCount(0);
    const conversationId = await visitorConversationId(leadA);
    const reply = await apiCall(undefined, "POST", `/quote-requests/${leadA.reference}/conversations/${conversationId}/messages?token=${encodeURIComponent(tokenOf(leadA.trackingLink))}`, { body: "Réponse envoyée alors que la messagerie est coupée." });
    expect(reply.status).toBe(409);
    expect(reply.text).toContain("MESSAGING_DISABLED");
    const summary = await visitorConversations(leadA);
    expect(summary.status).toBe(200);
    expect(summary.body.messagingEnabled).toBe(false);

    // Visitor B: the open request cannot receive files while the messaging is off.
    await visitorB.goto(leadB.trackingLink);
    const pending = visitorB.locator("#documents-demandes article[data-request-id]").filter({ hasText: "Attestation de domicile" });
    await expect(pending).toContainText("L'envoi de documents est suspendu pour le moment");
    await expect(pending.locator("form[data-form='document-upload']")).toHaveCount(0);
    const upload = await uploadFiles(
      `/quote-requests/${leadB.reference}/document-requests/${open?.id}/documents?token=${encodeURIComponent(tokenOf(leadB.trackingLink))}`,
      [pdfFile("attestation.pdf", "Attestation")]
    );
    expect(upload.status).toBe(409);
    expect(upload.text).toContain("MESSAGING_DISABLED");
  } finally {
    // Whatever happened above, the flag is left ON for the next journeys.
    await openAs(admin, superAdminAccount(), "/feature-flags");
    await setGlobalFlag(admin, MESSAGING_FLAG, true, WORLD_REASON);
  }

  // Back ON: the broker can write again and the visitor sees the form again.
  await expect(admin.getByRole("row").filter({ hasText: MESSAGING_FLAG }).getByRole("button", { name: "Désactiver", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      await openConversation(broker, world.owner, "starter", leadA.assignmentId);
      return composer(broker).count();
    }, { timeout: 60_000, intervals: [2_000, 3_000], message: "the broker composer is back once the flag is on" })
    .toBe(1);
  await visitorA.goto(leadA.trackingLink);
  await expect(visitorConversation(visitorA).locator("form[data-form='visitor-message']")).toBeVisible();

  for (const page of [admin, broker, visitorA, visitorB]) await page.context().close();
  markRunDone();
});
