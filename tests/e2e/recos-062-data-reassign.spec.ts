import { expect, test } from "@playwright/test";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { pdfFile } from "./support/files";
import { loadWorld, saveWorld, type BrokerWorld } from "./support/journey-state";
import { messageIdsTo, readMessage, searchMessages, waitForMail } from "./support/mailpit";
import { apiCall, asRecord, closeSessions, itemsOf, tokenFor, visit } from "./support/pro-roles";
import { adminBearerToken, MESSAGING_FLAG, publicCall, tokenOfLink } from "./support/recos-062b";
import { card, escapeRegExp, uniqueSuffix } from "./support/ui";
import { setGlobalFlag } from "./support/admin";
import { appPage, complianceAccount, findAssignmentId, provisionBroker, publishOffer, requestQuote, superAdminAccount, WORLD_REASON } from "./support/world";

// Lot 062, part 2 (spec 065 phase B): the visitor's data-subject request (D-10) and the reassignment of a
// lead between two brokers (E-07, scenario steps 28j-28n).
//   DR-01..DR-05  the visitor files an erasure request from the tracking space; nothing is erased; a second open
//                 request is refused; the compliance admin processes it; the closing e-mail is a pointer.
//   DR-06..DR-12  the admin reassigns the lead from firm 1 to firm 2: the old broker loses everything, the new one
//                 starts from an empty conversation, the visitor keeps reading the old thread (read-only).
// Re-run budget: the API limits the creation of data requests to 5 attempts per IP and per hour (every attempt counts,
// refused ones too, and the e2e stack sees one address). One run of this file uses 4: a second run within the hour
// fails on the "trop de demandes" notice of DR-02/DR-03 until the window (key rl:public:data_request:*) expires.
// Two Starter firms, one lead (on firm 1's offer). The messaging set-up (message, document request, reply) goes
// through the API: that feature is the object of another journey (recos-062-messaging).

test.describe.configure({ mode: "serial" });

const WORLD_1 = "recos062b-dr1";
const WORLD_2 = "recos062b-dr2";
const REASSIGN_REASON = "Réaffectation demandée par le parcours E2E 062";

let firm1: BrokerWorld;
let firm2: BrokerWorld;

const suffix = uniqueSuffix();
const ERASURE_DETAIL = `Merci d'effacer mes données personnelles (détail visiteur ${suffix}).`;
const ACCESS_DETAIL = `Je souhaite recevoir une copie de mes données (détail visiteur ${suffix}).`;
const DECISION_NOTE = `Note interne de conformité ${suffix}: dossier examiné.`;
const REJECT_NOTE = `Motif interne de rejet ${suffix}: demande d'accès traitée hors plateforme.`;
const BROKER_MESSAGE = `Bonjour, pouvez-vous préciser le modèle de votre véhicule ? (réf. ${suffix})`;
const VISITOR_REPLY = `C'est une Toyota Yaris de 2019, merci. (réf. ${suffix})`;
const DOCUMENT_LABEL = `Carte grise ${suffix}`;

let drReference = "";
let accessReference = "";
let documentRequestId = "";

function lead(): Record<string, string> {
  return firm1.data;
}

function visitorToken(): string {
  return tokenOfLink(lead().trackingLink as string);
}

function quotePath(suffixPath: string): string {
  return `/quote-requests/${lead().reference}${suffixPath}`;
}

test.beforeAll(() => {
  firm1 = loadWorld(WORLD_1) ?? ({} as BrokerWorld);
  firm2 = loadWorld(WORLD_2) ?? ({} as BrokerWorld);
});

test.afterAll(async () => {
  await closeSessions();
});

test("DR-01 préparation : deux cabinets Starter, la messagerie ouverte, une demande de devis sur le cabinet 1", async ({ browser }) => {
  test.setTimeout(20 * 60_000);

  // The firms are expensive to build: kept from an earlier run of this file. The lead is always new.
  if (!firm1.partnerId) {
    firm1 = await provisionBroker(browser, { plan: "starter", label: "dr1" });
    const offer = await publishOffer(browser, firm1, "dr1");
    firm1 = { ...firm1, offerId: offer.offerId, offerTitle: offer.offerTitle };
    saveWorld(WORLD_1, firm1);
  }
  if (!firm2.partnerId) {
    firm2 = await provisionBroker(browser, { plan: "starter", label: "dr2" });
    const offer = await publishOffer(browser, firm2, "dr2");
    firm2 = { ...firm2, offerId: offer.offerId, offerTitle: offer.offerTitle };
    saveWorld(WORLD_2, firm2);
  }

  // The data requests do not need it; the conversation set-up of the reassignment part does.
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  await setGlobalFlag(admin, MESSAGING_FLAG, true, WORLD_REASON);
  await admin.context().close();

  const quote = await requestQuote(browser, firm1.offerTitle as string, firm1.partnerName, "dr1");
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  const assignmentId = await findAssignmentId(broker, firm1.owner, quote.reference);
  await broker.context().close();
  firm1 = {
    ...firm1,
    data: { reference: quote.reference, email: quote.email, name: quote.name, phone: quote.phone, trackingLink: quote.trackingLink, assignmentId }
  };
  saveWorld(WORLD_1, firm1);
  expect(assignmentId).toMatch(/^[0-9a-f-]{36}$/u);
});

test("DR-02 le visiteur dépose une demande d'effacement : référence DR- à l'écran et par e-mail, rien n'est effacé", async ({ browser }) => {
  const seen = await messageIdsTo(lead().email as string);
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(lead().trackingLink as string);
  const section = visitor.locator("#mes-donnees");
  await expect(section).toBeVisible();

  await section.getByRole("radio", { name: /Effacer mes données/u }).check();
  await section.getByLabel(/Précisions/u).fill(ERASURE_DETAIL);
  await section.getByRole("button", { name: "Déposer ma demande" }).click();

  // Screen: confirmation with the reference, then the request listed as "Reçue".
  const confirmation = section.getByRole("status").filter({ hasText: "Demande enregistrée" });
  await expect(confirmation).toBeVisible();
  drReference = (await confirmation.innerText()).match(/DR-[A-Z0-9]+/u)?.[0] ?? "";
  expect(drReference, "reference shown on screen").toMatch(/^DR-[A-Z0-9]{4,}$/u);
  const listed = section.locator("li[data-request-status='received']").filter({ hasText: drReference });
  await expect(listed).toBeVisible();
  await expect(listed).toContainText("Reçue");
  await expect(listed).toContainText("Réponse attendue avant le");

  // E-mail: acknowledgement with the same reference; the visitor's own text never travels by e-mail.
  const mail = await waitForMail({ to: lead().email as string, exclude: seen, subject: /est bien reçue/u, body: new RegExp(drReference, "u") });
  expect(mail.Subject).toContain(drReference);
  expect(mail.Text).toContain(`Référence de la demande: ${drReference}`);
  expect(mail.Text).toContain("d'effacement de vos données personnelles");
  expect(mail.Text).toContain("Aucune donnée n'est modifiée ni effacée automatiquement");
  expect(`${mail.Text}\n${mail.HTML}`).not.toContain(ERASURE_DETAIL);

  // Nothing is erased: the tracking space still opens with the same link, and shows the request.
  await visitor.goto(lead().trackingLink as string);
  await expect(visitor.getByText(lead().reference as string).first()).toBeVisible();
  await expect(visitor.getByText(firm1.partnerName).first()).toBeVisible();
  await expect(visitor.locator("#mes-donnees li[data-request-status='received']").filter({ hasText: drReference })).toBeVisible();
  await visitor.context().close();

  // ... and the broker still sees the lead and the contact data.
  const brokerPage = await visit(browser, firm1.owner, `/leads/${lead().assignmentId}`);
  const contact = card(brokerPage, "Contact consenti");
  await expect(contact).toContainText(lead().email as string);
  await expect(contact).toContainText(lead().phone as string);
  await expect(brokerPage.getByText(/introuvable|Accès refusé|masquées/u)).toHaveCount(0);
});

test("DR-03 une seconde demande d'effacement ouverte est refusée avec la référence existante (écran et API)", async ({ browser }) => {
  // Screen.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(lead().trackingLink as string);
  const section = visitor.locator("#mes-donnees");
  await section.getByRole("radio", { name: /Effacer mes données/u }).check();
  await section.getByLabel(/Précisions/u).fill("Seconde demande identique.");
  await section.getByRole("button", { name: "Déposer ma demande" }).click();
  const refusal = section.getByRole("alert").filter({ hasText: "Une demande de ce type est déjà en cours" });
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(drReference);
  await expect(section.locator("li[data-request-status]")).toHaveCount(1);
  await visitor.context().close();

  // API: 409 DATA_REQUEST_ALREADY_OPEN with the existing reference at the first level of the body.
  const again = await publicCall("POST", quotePath("/data-requests"), { token: visitorToken(), json: { type: "erasure" } });
  expect(again.status).toBe(409);
  expect(asRecord(again.body).code).toBe("DATA_REQUEST_ALREADY_OPEN");
  expect(asRecord(again.body).reference).toBe(drReference);

  // The list of the visitor still holds one request (no duplicate was written).
  const list = await publicCall("GET", quotePath("/data-requests"), { token: visitorToken() });
  expect(list.status).toBe(200);
  const items = itemsOf(list);
  expect(items).toHaveLength(1);
  expect(items[0]?.reference).toBe(drReference);
  expect(items[0]?.status).toBe("received");

  // A forged or foreign token reveals nothing and files nothing.
  const forged = await publicCall("GET", quotePath("/data-requests"), { token: "A".repeat(43) });
  expect(forged.status).toBe(404);
  expect(asRecord(forged.body).code).toBe("VISITOR_ACCESS_DENIED");
  expect(forged.text).not.toContain(drReference);
});

test("DR-04 la conformité retrouve la demande, la prend en charge, prépare l'aperçu d'effacement et la clôture avec une note", async ({ browser }) => {
  const page = await appPage(browser, e2eEnv.adminUrl);
  await openAs(page, complianceAccount(), "/compliance/data-requests");
  const queue = page.getByRole("table", { name: "Demandes de données des visiteurs" });
  const row = queue.getByRole("row").filter({ hasText: drReference });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Effacement");
  await expect(row).toContainText("Reçue");
  await row.getByRole("link", { name: drReference }).click();
  await page.waitForURL(/\/compliance\/data-requests\/[0-9a-f-]{36}/u);

  // Detail: the visitor's text is shown to the compliance role, the deadline is indicative.
  await expect(page.getByRole("heading", { name: `Demande ${drReference}` })).toBeVisible();
  await expect(page.getByText(ERASURE_DETAIL)).toBeVisible();
  await expect(page.getByText("Échéance indicative").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Prendre en charge" })).toBeVisible();

  // Take charge: received -> in review.
  await page.getByRole("button", { name: "Prendre en charge" }).click();
  await expect(page.getByText("Demande prise en charge : elle est maintenant en cours d'examen.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prendre en charge" })).toHaveCount(0);

  // Erasure preview only (spec 046): the screen says nothing is erased; the batch is linked.
  await expect(page.getByText(/Cette action crée un aperçu d'effacement.*Rien n'est effacé/u)).toBeVisible();
  await page.locator("#dr-erasure-ack").check();
  await page.getByRole("button", { name: /Créer l.aperçu d.effacement/u }).click();
  await expect(page.getByText(/Aperçu d'effacement créé \(spec 046\) : rien n'a été effacé/u)).toBeVisible();
  await expect(page.getByText("Lot d'effacement lié")).toBeVisible();
  await expect(page.getByRole("table", { name: "Historique de la demande" })).toContainText("Aperçu d'effacement créé");

  // Closing: the internal note is optional, never sent to the visitor.
  await page.locator("#dr-complete-note").fill(DECISION_NOTE);
  await page.getByRole("button", { name: "Clôturer comme traitée" }).click();
  await expect(page.getByText(/Demande clôturée comme traitée\. Le visiteur reçoit un e-mail de clôture/u)).toBeVisible();
  await expect(page.getByText("Traitée").first()).toBeVisible();
  await expect(page.getByText(DECISION_NOTE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Clôturer comme traitée" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rejeter la demande" })).toHaveCount(0);
  const history = page.getByRole("table", { name: "Historique de la demande" });
  for (const event of ["Demande reçue", "Prise en charge", "Clôturée (traitée)"]) await expect(history).toContainText(event);

  // The queue shows the final status; the retention screen holds an erasure batch, none executed from here.
  await page.goto("/compliance/data-requests");
  await expect(page.getByRole("table", { name: "Demandes de données des visiteurs" }).getByRole("row").filter({ hasText: drReference })).toContainText("Traitée");
  await page.goto("/compliance/retention");
  await expect(page.getByText(/Effacement \(par référence\)/u).first()).toBeVisible();
  await page.context().close();
});

test("DR-05 après la clôture : e-mail pointeur sans note ni détail, statut final dans l'espace, aucune donnée effacée", async ({ browser }) => {
  const mail = await waitForMail({ to: lead().email as string, subject: new RegExp(`Votre demande ${drReference} a été traitée`, "u") });
  expect(mail.Text).toContain(`Le traitement de votre demande ${drReference} est terminé.`);
  expect(mail.Text).toMatch(/espace de suivi/u);
  for (const secret of [DECISION_NOTE, ERASURE_DETAIL, "Note interne"]) {
    expect(`${mail.Text}\n${mail.HTML}`, `closing e-mail must not carry "${secret}"`).not.toContain(secret);
  }

  // The visitor reads the final status in the same tracking space (same link).
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(lead().trackingLink as string);
  const closed = visitor.locator("#mes-donnees li[data-request-status='completed']").filter({ hasText: drReference });
  await expect(closed).toBeVisible();
  await expect(closed).toContainText("Traitée");
  await expect(closed).toContainText("Clôturée le");
  await expect(closed).not.toContainText(DECISION_NOTE);
  await expect(visitor.getByText(firm1.partnerName).first()).toBeVisible();
  await expect(visitor.getByText(DECISION_NOTE)).toHaveCount(0);
  await visitor.context().close();

  // Closing a request does not erase anything: the erasure batch was only previewed (retention_purge_enabled is off).
  const token = await tokenFor(browser, firm1.owner);
  const detail = await apiCall(token, "GET", `/broker/starter/leads/${lead().assignmentId}`);
  expect(detail.status).toBe(200);
  expect(detail.text).toContain(lead().email as string);
  expect(asRecord(detail.body).contactVisibility).not.toBe("masked");
  const brokerPage = await visit(browser, firm1.owner, `/leads/${lead().assignmentId}`);
  await expect(card(brokerPage, "Contact consenti")).toContainText(lead().email as string);
});

test("DR-06 une demande d'accès rejetée : note obligatoire, statut « Refusée » côté visiteur ; un autre rôle n'accède pas à la file", async ({ browser }) => {
  // A closed request frees the type: the visitor files an access request (different type, same lead).
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(lead().trackingLink as string);
  const section = visitor.locator("#mes-donnees");
  await section.getByRole("radio", { name: /Accéder à mes données/u }).check();
  await section.getByLabel(/Précisions/u).fill(ACCESS_DETAIL);
  await section.getByRole("button", { name: "Déposer ma demande" }).click();
  const confirmation = section.getByRole("status").filter({ hasText: "Demande enregistrée" });
  await expect(confirmation).toBeVisible();
  accessReference = (await confirmation.innerText()).match(/DR-[A-Z0-9]+/u)?.[0] ?? "";
  expect(accessReference).toMatch(/^DR-[A-Z0-9]{4,}$/u);
  expect(accessReference).not.toBe(drReference);

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, complianceAccount(), "/compliance/data-requests?type=access");
  await admin.getByRole("table", { name: "Demandes de données des visiteurs" }).getByRole("row").filter({ hasText: accessReference }).getByRole("link", { name: accessReference }).click();
  await admin.waitForURL(/\/compliance\/data-requests\/[0-9a-f-]{36}/u);
  const requestId = new URL(admin.url()).pathname.split("/").pop() as string;
  // An access request has no erasure card; rejecting needs a note (server-side too).
  await expect(admin.getByRole("button", { name: /Créer l.aperçu d.effacement/u })).toHaveCount(0);
  const adminToken = await adminBearerToken(admin);
  const noNote = await apiCall(adminToken, "POST", `/admin/data-requests/${requestId}/reject`, {});
  expect(noNote.status, "reject without a note").toBeGreaterThanOrEqual(400);
  expect(noNote.status).toBeLessThan(500);
  await expect(admin.locator("#dr-reject-note")).toHaveAttribute("required", "");
  await admin.locator("#dr-reject-note").fill(REJECT_NOTE);
  await admin.getByRole("button", { name: "Rejeter la demande" }).click();
  await expect(admin.getByText(/Demande rejetée avec une note interne/u)).toBeVisible();
  await expect(admin.getByText("Rejetée").first()).toBeVisible();

  // A request already closed cannot be processed again (409 DATA_REQUEST_INVALID_TRANSITION).
  const again = await apiCall(adminToken, "POST", `/admin/data-requests/${requestId}/take`, {});
  expect(again.status).toBe(409);
  expect(asRecord(again.body).code).toBe("DATA_REQUEST_INVALID_TRANSITION");
  await admin.context().close();

  // Visitor: final status "Refusée", no internal note; the closing e-mail is again a pointer.
  await visitor.goto(lead().trackingLink as string);
  const rejected = visitor.locator("#mes-donnees li[data-request-status='rejected']").filter({ hasText: accessReference });
  await expect(rejected).toContainText("Refusée");
  await expect(visitor.getByText(REJECT_NOTE)).toHaveCount(0);
  await visitor.context().close();
  const mail = await waitForMail({ to: lead().email as string, subject: new RegExp(`Votre demande ${accessReference} a été traitée`, "u") });
  expect(`${mail.Text}\n${mail.HTML}`).not.toContain(REJECT_NOTE);

  // Other roles: the queue is closed to a broker (403, refusal audited) and to an anonymous caller.
  const brokerToken = await tokenFor(browser, firm1.owner);
  for (const path of ["/admin/data-requests", `/admin/data-requests/${requestId}`]) {
    const refused = await apiCall(brokerToken, "GET", path);
    expect(refused.status, `broker on ${path}`).toBe(403);
    expect(refused.text).not.toContain(accessReference);
    expect(refused.text).not.toContain(ACCESS_DETAIL);
  }
  expect((await apiCall(undefined, "GET", "/admin/data-requests")).status).toBe(401);
});

test("DR-07 préparation de la réaffectation : le courtier 1 accepte, écrit, demande un document ; le visiteur répond", async ({ browser }) => {
  const assignmentId = lead().assignmentId as string;
  const owner = await visit(browser, firm1.owner, `/leads/${assignmentId}`);
  await card(owner, "Actions Starter").getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(owner.getByText("Lead accepté.")).toBeVisible();

  const token = await tokenFor(browser, firm1.owner);
  const sent = await apiCall(token, "POST", `/broker/starter/leads/${assignmentId}/conversation/messages`, { body: BROKER_MESSAGE, clientRequestId: `dr-${suffix}` });
  expect(sent.status, `broker message: ${sent.text}`).toBe(201);
  const request = await apiCall(token, "POST", `/broker/starter/leads/${assignmentId}/document-requests`, { label: DOCUMENT_LABEL, note: "Recto et verso, lisible." });
  expect(request.status, `document request: ${request.text}`).toBe(201);
  documentRequestId = String(asRecord(request.body).id ?? "");
  expect(documentRequestId).toMatch(/^[0-9a-f-]{36}$/u);

  // The visitor reads the broker message and answers (public routes, token 054).
  const conversations = await publicCall("GET", quotePath("/conversations"), { token: visitorToken() });
  expect(conversations.status).toBe(200);
  expect(asRecord(conversations.body).messagingEnabled).toBe(true);
  const thread = asRecord((asRecord(conversations.body).conversations as unknown[])[0]);
  expect(thread.partnerName).toBe(firm1.partnerName);
  expect(thread.state).toBe("open");
  const reply = await publicCall("POST", quotePath(`/conversations/${thread.conversationId as string}/messages`), { token: visitorToken(), json: { body: VISITOR_REPLY } });
  expect(reply.status, `visitor reply: ${reply.text}`).toBe(201);

  // The broker sees both messages and the open document request on the lead page.
  const page = await visit(browser, firm1.owner, `/leads/${assignmentId}`);
  const conversation = page.locator("#conversation");
  await expect(conversation).toContainText(BROKER_MESSAGE);
  await expect(conversation).toContainText(VISITOR_REPLY);
  await expect(conversation).toContainText(DOCUMENT_LABEL);
});

test("DR-08 l'admin réaffecte le lead du cabinet 1 au cabinet 2 avec un motif", async ({ browser }) => {
  const seenByOldOwner = await messageIdsTo(firm1.owner.email);
  const page = await appPage(browser, e2eEnv.adminUrl);
  await openAs(page, superAdminAccount(), `/lead-assignments?partnerTenantId=${firm1.partnerId}`);
  const row = page.getByRole("row").filter({ hasText: lead().reference as string });
  await expect(row).toContainText(firm1.partnerName);
  const href = await row.locator("a[href^='/quote-requests/']").first().getAttribute("href");
  const quoteRequestId = href?.split("/").pop() ?? "";
  expect(quoteRequestId).toMatch(/^[0-9a-f-]{36}$/u);

  await row.locator("details > summary").click();
  const form = row.locator("form[data-operations-form='reassign']");
  await form.locator("input[name='partnerTenantId']").fill(firm2.partnerId);
  await form.locator("input[name='reason']").fill(REASSIGN_REASON);
  await form.getByRole("button", { name: "Réaffecter" }).click();
  // The list is filtered on firm 1: once reassigned, the row (and its success notice) leaves it.
  await expect(page.getByRole("row").filter({ hasText: lead().reference as string })).toHaveCount(0);

  // The same assignment now belongs to firm 2.
  await page.goto(`/lead-assignments?partnerTenantId=${firm2.partnerId}`);
  await expect(page.getByRole("row").filter({ hasText: lead().reference as string })).toContainText(firm2.partnerName);
  await page.context().close();

  firm1 = { ...firm1, data: { ...firm1.data, quoteRequestId } };
  saveWorld(WORLD_1, firm1);
  firm2 = { ...firm2, data: { ...firm2.data, seenByOldOwner: JSON.stringify([...seenByOldOwner]) } };
  saveWorld(WORLD_2, firm2);
});

test("DR-09 l'ancien courtier ne voit plus rien : écran et API refusés, aucune donnée de contact ni message", async ({ browser }) => {
  const assignmentId = lead().assignmentId as string;
  const leaks = [lead().email as string, lead().phone as string, lead().name as string, BROKER_MESSAGE, VISITOR_REPLY, DOCUMENT_LABEL];

  // Screen: the lead page is a refusal, the list does not hold the lead any more.
  const page = await visit(browser, firm1.owner, `/leads/${assignmentId}`);
  await expect(page.getByText(/Accès refusé|Lead introuvable|n.existe pas ou ne vous est pas assigné/u).first()).toBeVisible();
  const body = await page.locator("body").innerText();
  for (const secret of leaks) expect(body, `old broker's page must not show "${secret}"`).not.toContain(secret);
  await expect(card(page, "Contact consenti")).toHaveCount(0);
  await expect(page.locator("#conversation")).toHaveCount(0);
  await visit(browser, firm1.owner, "/leads");
  await expect(page.getByRole("row").filter({ hasText: lead().reference as string })).toHaveCount(0);

  // API: every conversation / document request route refuses; nothing is written.
  const token = await tokenFor(browser, firm1.owner);
  const base = `/broker/starter/leads/${assignmentId}`;
  const probes: Array<{ method: "GET" | "POST"; path: string; data?: Record<string, unknown> }> = [
    { method: "GET", path: base },
    { method: "GET", path: `${base}/history` },
    { method: "GET", path: `${base}/conversation` },
    { method: "GET", path: `${base}/document-requests` },
    { method: "POST", path: `${base}/conversation/messages`, data: { body: "Message de l'ancien courtier, ne doit jamais être écrit." } },
    { method: "POST", path: `${base}/conversation/read`, data: {} },
    { method: "POST", path: `${base}/document-requests`, data: { label: "Document de l'ancien courtier" } },
    { method: "POST", path: `${base}/document-requests/${documentRequestId}/cancel`, data: {} }
  ];
  for (const probe of probes) {
    const result = await apiCall(token, probe.method, probe.path, probe.data);
    expect([403, 404], `${probe.method} ${probe.path} -> ${result.status}`).toContain(result.status);
    for (const secret of leaks) expect(result.text, `${probe.method} ${probe.path} must not leak "${secret}"`).not.toContain(secret);
  }
});

test("DR-10 le nouveau courtier voit le lead, repart d'une conversation vide, puis accepte sans hériter de l'échange", async ({ browser }) => {
  const assignmentId = lead().assignmentId as string;
  const history = [BROKER_MESSAGE, VISITOR_REPLY, DOCUMENT_LABEL];

  const list = await visit(browser, firm2.owner, "/leads");
  const row = list.getByRole("row").filter({ hasText: lead().reference as string });
  await expect(row).toBeVisible();

  const page = await visit(browser, firm2.owner, `/leads/${assignmentId}`);
  await expect(card(page, "Contact consenti")).toContainText(lead().email as string);
  await expect(page.getByText(/Accès refusé|Lead introuvable/u)).toHaveCount(0);
  // Not accepted yet: no conversation to write in, and nothing of the previous broker's.
  const bodyBefore = await page.locator("body").innerText();
  for (const secret of history) expect(bodyBefore, `new broker's page must not show "${secret}"`).not.toContain(secret);
  await card(page, "Actions Starter").getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(page.getByText("Lead accepté.")).toBeVisible();

  const conversation = page.locator("#conversation");
  await expect(conversation).toContainText("Aucun message échangé avec le visiteur pour ce lead.");
  await expect(conversation).toContainText("Aucune demande de document pour ce lead.");
  await expect(conversation).toContainText("Demandes ouvertes : 0 /");
  for (const secret of history) await expect(conversation).not.toContainText(secret);

  // API: an empty thread, an empty list of document requests, writing allowed (new key = assignment + broker).
  const token = await tokenFor(browser, firm2.owner);
  const thread = await apiCall(token, "GET", `/broker/starter/leads/${assignmentId}/conversation?limit=300`);
  expect(thread.status).toBe(200);
  expect(asRecord(thread.body).messages).toEqual([]);
  expect(asRecord(thread.body).state).toBe("open");
  expect(asRecord(thread.body).canSend).toBe(true);
  for (const secret of history) expect(thread.text).not.toContain(secret);
  const requests = await apiCall(token, "GET", `/broker/starter/leads/${assignmentId}/document-requests`);
  expect(requests.status).toBe(200);
  expect(itemsOf(requests)).toEqual([]);
  expect(asRecord(requests.body).openCount).toBe(0);
  expect(requests.text).not.toContain(DOCUMENT_LABEL);
});

test("DR-11 la demande de documents du cabinet 1 est close par la réaffectation ; plus aucun téléversement", async () => {
  const requests = await publicCall("GET", quotePath("/document-requests"), { token: visitorToken() });
  expect(requests.status).toBe(200);
  const item = itemsOf(requests).find((entry) => entry.id === documentRequestId);
  expect(item, "the previous broker's document request is still listed to the visitor").toBeDefined();
  expect(item?.status).toBe("cancelled");
  expect(item?.canUpload).toBe(false);
  expect(item?.partnerName).toBe(firm1.partnerName);
  // The new broker has no document request: the visitor sees only the old, closed one.
  expect(itemsOf(requests).filter((entry) => entry.status === "open")).toEqual([]);

  const upload = await publicCall("POST", quotePath(`/document-requests/${documentRequestId}/documents`), {
    token: visitorToken(),
    multipart: { files: pdfFile("carte-grise.pdf", "Carte grise E2E") }
  });
  expect(upload.status).toBe(409);
  expect(asRecord(upload.body).code).toBe("DOCUMENT_REQUEST_NOT_OPEN");
});

test("DR-12 l'espace de suivi du visiteur : nouveau courtier, ancienne conversation clôturée en lecture seule, nouvelle conversation vide", async ({ browser }) => {
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(lead().trackingLink as string);
  await expect(visitor.getByText(firm2.partnerName).first()).toBeVisible();
  await expect(visitor.getByText("Demande confiée à un autre courtier partenaire").first()).toBeVisible();

  const section = visitor.locator("#conversation");
  await expect(section).toContainText(`Échange avec ${firm1.partnerName}`);
  await expect(section).toContainText(`Échange avec ${firm2.partnerName}`);
  await expect(section).toContainText("Votre demande a été confiée à un autre courtier : cette conversation est conservée en lecture seule.");
  await expect(section).toContainText(BROKER_MESSAGE);
  await expect(section).toContainText(VISITOR_REPLY);
  await expect(section).toContainText("Aucun message pour le moment. Vous pouvez écrire le premier ci-dessous.");

  // The documents section shows the old request as cancelled, with no upload form.
  const documents = visitor.locator("#documents-demandes");
  await expect(documents).toContainText(DOCUMENT_LABEL);
  await expect(documents).toContainText("Annulée");
  await expect(documents.getByRole("button", { name: "Envoyer les fichiers" })).toHaveCount(0);
  await visitor.context().close();

  // API: the old thread is closed (reassigned) and refuses a new message; the new one is open and empty.
  const list = await publicCall("GET", quotePath("/conversations"), { token: visitorToken() });
  expect(list.status).toBe(200);
  const threads = (asRecord(list.body).conversations as Array<Record<string, unknown>>) ?? [];
  const oldThread = threads.find((entry) => entry.partnerName === firm1.partnerName);
  const newThread = threads.find((entry) => entry.partnerName === firm2.partnerName);
  expect(oldThread, "old conversation still listed to the visitor").toBeDefined();
  expect(newThread, "new conversation listed to the visitor").toBeDefined();
  expect(oldThread?.state).toBe("read_only");
  expect(oldThread?.readOnlyReason).toBe("reassigned");
  expect(oldThread?.canSend).toBe(false);
  expect(oldThread?.conversationId).not.toBe(newThread?.conversationId);

  const refused = await publicCall("POST", quotePath(`/conversations/${oldThread?.conversationId as string}/messages`), {
    token: visitorToken(),
    json: { body: `Nouveau message vers l'ancien courtier ${suffix}` }
  });
  expect(refused.status).toBe(409);
  expect(asRecord(refused.body).code).toBe("CONVERSATION_READ_ONLY");
  expect(asRecord(asRecord(refused.body).details).reason).toBe("reassigned");

  const fresh = await publicCall("GET", quotePath(`/conversations/${newThread?.conversationId as string}`), { token: visitorToken() });
  expect(fresh.status).toBe(200);
  expect(asRecord(fresh.body).messages).toEqual([]);
  expect(asRecord(fresh.body).canSend).toBe(true);
  expect(fresh.text).not.toContain(BROKER_MESSAGE);
  const old = await publicCall("GET", quotePath(`/conversations/${oldThread?.conversationId as string}`), { token: visitorToken() });
  expect(old.status).toBe(200);
  expect(old.text).toContain(BROKER_MESSAGE);
  expect(old.text).toContain(VISITOR_REPLY);
});

test("DR-13 e-mails de la réaffectation : visiteur et nouveau cabinet prévenus sans contenu d'échange, ancien cabinet non notifié", async () => {
  // Visitor: the reassignment e-mail names the new broker and says the previous one lost access.
  const visitorMail = await waitForMail({
    to: lead().email as string,
    subject: new RegExp(`${escapeRegExp(lead().reference as string)} a été réaffectée`, "u")
  });
  expect(visitorMail.Text).toContain(firm2.partnerName);
  expect(visitorMail.Text).toContain("Le courtier précédent n'a plus accès à votre demande.");

  // New firm: a pointer, never the lead (no contact data) and nothing of the previous exchange.
  const brokerMail = await waitForMail({ to: firm2.owner.email, subject: new RegExp(`Lead réaffecté ${escapeRegExp(lead().reference as string)}`, "u") });
  const brokerContent = `${brokerMail.Text}\n${brokerMail.HTML}`;
  for (const secret of [lead().email as string, lead().phone as string, BROKER_MESSAGE, VISITOR_REPLY, DOCUMENT_LABEL]) {
    expect(brokerContent, `reassignment e-mail must not carry "${secret}"`).not.toContain(secret);
  }

  // Old firm: no reassignment e-mail.
  const seen = new Set<string>(JSON.parse(firm2.data.seenByOldOwner ?? "[]") as string[]);
  const oldFirmMails = (await searchMessages(`to:"${firm1.owner.email}"`)).filter((mail) => !seen.has(mail.ID));
  for (const mail of oldFirmMails) {
    const message = await readMessage(mail.ID);
    expect(`${message.Subject}\n${message.Text}`, "the previous firm is not told about the reassignment").not.toMatch(/réaffect/iu);
  }

  // No e-mail to the visitor ever carries a message text, an attachment name or the document request title.
  for (const summary of await searchMessages(`to:"${lead().email}"`)) {
    const message = await readMessage(summary.ID);
    const content = `${message.Subject}\n${message.Text}\n${message.HTML}`;
    for (const secret of [BROKER_MESSAGE, VISITOR_REPLY, DOCUMENT_LABEL]) {
      expect(content, `e-mail "${message.Subject}" must not carry "${secret}"`).not.toContain(secret);
    }
  }
});

test("DR-14 la conformité relit les deux conversations en lecture seule ; l'ancien échange n'est pas dans celle du nouveau cabinet", async ({ browser }) => {
  const page = await appPage(browser, e2eEnv.adminUrl);
  await openAs(page, complianceAccount(), `/quote-requests/${lead().quoteRequestId}`);
  // The content is loaded only on an explicit, audited action.
  await expect(page.getByText(BROKER_MESSAGE)).toHaveCount(0);
  await page.locator("[data-conversation-marker='load-audited']").click();
  await page.waitForURL(/conversations=1/u);

  const oldBlock = page.locator(`section[aria-label="Conversation avec ${firm1.partnerName}"]`);
  await expect(oldBlock).toContainText("Lecture seule : demande réaffectée");
  await expect(oldBlock).toContainText(BROKER_MESSAGE);
  await expect(oldBlock).toContainText(VISITOR_REPLY);
  const newBlock = page.locator(`section[aria-label="Conversation avec ${firm2.partnerName}"]`);
  await expect(newBlock).toContainText("Aucun message dans cette conversation.");
  await expect(newBlock).not.toContainText(BROKER_MESSAGE);
  // Read-only: no input in the card.
  await expect(card(page, "Échanges courtier / visiteur").locator("textarea, input[type='text']")).toHaveCount(0);
  await page.context().close();
});
