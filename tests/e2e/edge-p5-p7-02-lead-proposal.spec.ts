import { expect, test, type Browser, type Page } from "@playwright/test";
import { type BackOfficeAccount } from "./support/backoffice";
import { openAs } from "./support/edge-p5p7-login";
import {
  ensureRateBudget,
  ensureL4Firm,
  createLead,
  note,
  reserveTrackingViews,
  tokenOfLink,
  type L4Lead
} from "./support/edge-p5p7-support";
import {
  brief,
  brokerGet,
  crossTenantAuditCount,
  errorCodeOf,
  expectInert,
  expireProposalInDatabase,
  fillProposalForm,
  isoDay,
  listProposalsApi,
  forceSubmitProposal,
  proposalCard,
  proposalIdOf,
  proposalRowCount,
  proposalsOf,
  requestQuoteWithAnswers,
  sendProposalApi,
  sendProposalMultipart,
  submitProposalOnScreen,
  validPayload,
  visitorProposalCard,
  withdrawOnScreen,
  type UploadFile
} from "./support/edge-p5p7-proposal";
import { e2eEnv } from "./support/env";
import type { BrokerWorld } from "./support/journey-state";
import { readMessage, searchMessages } from "./support/mailpit";
import { apiCall, asRecord, closeSessions, itemsOf, tokenFor, visit } from "./support/pro-roles";
import { publicCall } from "./support/recos-062b";
import { eicarFile, pdfFile } from "./support/files";
import { card, uniqueSuffix } from "./support/ui";
import { findAssignmentId } from "./support/world";

// Lot 4, spec 02: phase 6 (the broker handles the lead and answers with a proposal) edge cases of
// docs/scenarios/e2e-parcours-complet.md sections 11.1 and 11.2, plus T-02 (cross-broker access to
// proposals, documents) and RSP-03 (375 px). Starter plan, throwaway stack, no rate limit is tested.
//
// Covered here (already covered elsewhere, not rewritten): E-P6-01a, E-P6-02b, P6-03, P6-04, P6-05.
// NOT EXECUTED on this stack (rate limit, would lock the IP of the whole stack for an hour):
//   E-P6-05c "rafale de reponses" (10 per IP and per hour, 5 per proposal): see the test.fixme below.

test.describe.configure({ mode: "serial" });

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
const SQL = `'; DROP TABLE "LeadProposal"; --`;
const FORMULA = `=HYPERLINK("http://x.test","a")`;

const NO_DOC_REFUSAL = "Fichier refusé : PDF de 5 Mo au maximum uniquement.";
const VIRUS_REFUSAL = "Envoi refusé : le fichier n'a pas passé l'antivirus. Il n'a pas été conservé.";
const WORDING_REFUSAL = "Envoi refusé : le texte contient une formulation interdite.";
const VALIDITY_REFUSAL = "La date de validité doit être postérieure à aujourd'hui.";
const OVERSIZE_REFUSAL = "Fichier refusé : taille maximale 5 Mo.";
const INVALID_REFUSAL = "Saisie refusée : message, prime ou fourchette, devise et date de validité future sont obligatoires.";
const SENT_NOTICE = "Proposition envoyée. Le visiteur est prévenu par e-mail et la voit dans son espace de suivi.";
const NOT_RESPONDABLE = "Cette proposition ne peut plus recevoir de réponse (retirée, expirée ou plus active). Rechargez la page pour voir son état.";

type LeadKey = "main" | "limit" | "rejected" | "fresh" | "race" | "xss" | "mobile";

const firms: { a?: BrokerWorld; b?: BrokerWorld } = {};
const leads: Partial<Record<LeadKey, L4Lead>> = {};
const cases: Record<string, string> = {};
let xssLeadMeta: { brand: string; city: string } | undefined;

async function firmA(browser: Browser): Promise<BrokerWorld> {
  firms.a ??= await ensureL4Firm(browser, "l4p", "l4p");
  return firms.a;
}

async function firmB(browser: Browser): Promise<BrokerWorld> {
  firms.b ??= await ensureL4Firm(browser, "l4pb", "l4pb");
  return firms.b;
}

/** Lazily creates the lead of a case (fresh data on every run). */
async function lead(browser: Browser, key: LeadKey): Promise<L4Lead> {
  const known = leads[key];
  if (known) return known;
  const firm = await firmA(browser);
  let created: L4Lead;
  if (key === "xss") {
    xssLeadMeta = { brand: FORMULA, city: `${XSS} ${SQL}` };
    const quote = await requestQuoteWithAnswers(browser, firm.offerTitle as string, firm.partnerName, "l4pxs", xssLeadMeta);
    const context = await browser.newContext({ baseURL: e2eEnv.brokerUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
    const page = await context.newPage();
    let assignmentId = "";
    await expect
      .poll(async () => {
        try {
          assignmentId = await findAssignmentId(page, firm.owner, quote.reference);
          return assignmentId;
        } catch {
          return "";
        }
      }, { timeout: 90_000, intervals: [2_000, 3_000] })
      .toMatch(/^[0-9a-f-]{36}$/u);
    await context.close();
    created = { ...quote, assignmentId };
  } else {
    const label = { main: "l4pa", limit: "l4plm", rejected: "l4prj", fresh: "l4pnw", race: "l4prc", mobile: "l4pmb" }[key];
    created = await createLead(browser, firm, label, { accept: key === "main" || key === "limit" || key === "mobile" });
  }
  leads[key] = created;
  return created;
}

async function ownerToken(browser: Browser): Promise<string> {
  return tokenFor(browser, (await firmA(browser)).owner);
}

async function ownerPage(browser: Browser, path: string): Promise<Page> {
  return visit(browser, (await firmA(browser)).owner, path);
}

function visitorCall(target: L4Lead, proposalId: string, json: Record<string, unknown>) {
  return publicCall("POST", `/quote-requests/${target.reference}/proposals/${proposalId}/responses`, { token: tokenOfLink(target.trackingLink), json });
}

test.afterAll(async () => {
  await closeSessions();
});

// ---------------------------------------------------------------------------------------------
// 11.1 Lead handling
// ---------------------------------------------------------------------------------------------

test("E-P6-02a « Rejeter avec motif » sans motif refusé, avec « Doublon » accepté ; l'acceptation n'est plus proposée", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "rejected");
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const actions = card(page, "Actions Starter");

  // Without a reason: the select is `required` in the browser, so its check is lifted to reach the server action.
  await actions.getByRole("button", { name: "Rejeter avec motif" }).first().click();
  let dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.locator("form").evaluate((form) => {
    (form as HTMLFormElement).noValidate = true;
  });
  await dialog.getByRole("button", { name: "Rejeter le lead" }).click();
  await expect(page.getByText("Un motif allowliste est obligatoire pour rejeter ou contester un lead.")).toBeVisible();
  await expect(card(page, "Actions Starter").getByRole("button", { name: "Accepter", exact: true })).toBeVisible();

  // With "Doublon".
  await card(page, "Actions Starter").getByRole("button", { name: "Rejeter avec motif" }).first().click();
  dialog = page.locator("dialog[open]");
  await dialog.locator("#reject-reason").selectOption({ label: "Doublon" });
  await dialog.getByRole("button", { name: "Rejeter le lead" }).click();
  await expect(page.getByText("Lead rejeté avec motif. L'action est historisée.")).toBeVisible();
  await expect(card(page, "Informations utiles")).toContainText("Rejeté");
  await expect(card(page, "Historique minimal")).toContainText("motif: Doublon");
  // "Accepter" is not offered any more.
  await expect(card(page, "Actions Starter").getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);

});

test("E-P6-02a l'acceptation d'un lead rejeté est refusée par l'API", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "rejected");
  const token = await ownerToken(browser);
  const accept = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/accept`, {});
  note(`ANOMALIE E-P6-02a accept after reject via API -> ${brief(accept)}`);
  expect(accept.status, `accept after reject must be refused: ${brief(accept)}`).toBe(409);
  expect(errorCodeOf(accept)).toBe("LEAD_STATUS_NOT_ACCEPTABLE");
});

test("E-P6-02c « Accepter » depuis deux onglets : une seule acceptation", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "race");
  const first = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const second = await first.context().newPage();
  await second.goto(`${e2eEnv.brokerUrl}/leads/${target.assignmentId}`);
  const buttonOne = card(first, "Actions Starter").getByRole("button", { name: "Accepter", exact: true });
  const buttonTwo = card(second, "Actions Starter").getByRole("button", { name: "Accepter", exact: true });
  await expect(buttonOne).toBeVisible();
  await expect(buttonTwo).toBeVisible();
  await Promise.all([buttonOne.click(), buttonTwo.click()]);
  await Promise.all([first.waitForURL(/[?&]lead=/u), second.waitForURL(/[?&]lead=/u)]);
  const outcomes = [new URL(first.url()).searchParams.get("lead"), new URL(second.url()).searchParams.get("lead")];
  note(`E-P6-02c two tabs accept -> ${outcomes.join(" / ")}`);
  cases.twoTabsOutcomes = outcomes.join(" / ");
  await second.close();

  await expect(card(first, "Informations utiles")).toContainText("Accepté");
  const token = await ownerToken(browser);
  const history = await apiCall(token, "GET", `/broker/starter/leads/${target.assignmentId}/history`);
  const events = itemsOf(history).filter((event) => event.eventType === "accepted").length;
  cases.acceptedEvents = String(events);
  note(`E-P6-02c accepted events after two simultaneous accepts: ${events}`);
  // A later call on an already accepted lead (observed, asserted in the idempotence test below).
  const third = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/accept`, {});
  cases.acceptAgain = brief(third);
  note(`E-P6-02c accept on an already accepted lead -> ${brief(third)}`);
});

test("E-P6-02c deux acceptations simultanées ou répétées ne laissent qu'un seul événement « accepted »", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "race");
  const token = await ownerToken(browser);
  const history = await apiCall(token, "GET", `/broker/starter/leads/${target.assignmentId}/history`);
  const events = itemsOf(history).filter((event) => event.eventType === "accepted").length;
  expect(events, `exactly one "accepted" event (history: ${brief(history)})`).toBe(1);
  const again = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/accept`, {});
  expect(again.status, `second accept: ${brief(again)}`).toBe(409);
  expect(errorCodeOf(again)).toBe("LEAD_ALREADY_ACCEPTED");
});

test("E-P6-02c « Clôturer » un lead non accepté : 409 LEAD_NOT_ACCEPTED, bouton absent", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "fresh");
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  await expect(card(page, "Actions Starter").getByRole("button", { name: "Clôturer" })).toHaveCount(0);
  const token = await ownerToken(browser);
  const refused = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/close`, { outcome: "perdu" });
  expect(refused.status, brief(refused)).toBe(409);
  expect(errorCodeOf(refused)).toBe("LEAD_NOT_ACCEPTED");
  // Screen label of the refusal (the notice the page shows after a refused close).
  await page.goto(`${e2eEnv.brokerUrl}/leads/${target.assignmentId}?lead=conflict`);
  await expect(page.getByText(/Clôture refusée\s?: le lead doit être accepté et ne pas être déjà clôturé\./u)).toBeVisible();
});

test("E-P6-02c « Clôturer » depuis une page périmée (déjà clôturé) : libellé « Clôture refusée »", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "race");
  const token = await ownerToken(browser);
  // A proposal now, so the visitor space has something to show once the lead is closed (E-P6-05b).
  const sent = await sendProposalApi(token, target.assignmentId, validPayload("Proposition avant clôture du lead."));
  cases.closedLeadProposal = proposalIdOf(sent);

  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  await card(page, "Actions Starter").getByRole("button", { name: "Clôturer" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#close-outcome").selectOption("sans_suite");
  // Meanwhile the lead is closed elsewhere.
  const closed = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/close`, { outcome: "perdu" });
  expect(closed.status, brief(closed)).toBe(200);
  await dialog.getByRole("button", { name: "Clôturer le lead" }).click();
  await page.waitForURL(/[?&]lead=conflict/u);
  await expect(page.getByText(/Clôture refusée\s?: le lead doit être accepté et ne pas être déjà clôturé\./u)).toBeVisible();
  const again = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/close`, { outcome: "perdu" });
  cases.closeTwice = brief(again);
  expect(again.status, brief(again)).toBe(409);
});

// ---------------------------------------------------------------------------------------------
// 11.2 Proposals
// ---------------------------------------------------------------------------------------------

test("E-P6-03a champs vides, minimum > maximum, prime négative, validité passée : « Saisie refusée », aucune proposition", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const before = proposalRowCount(target.assignmentId);
  const base = { message: "Proposition indicative pour votre véhicule.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) };
  const refused: Array<[string, Parameters<typeof submitProposalOnScreen>[3]]> = [
    ["tout vide", { message: "", min: "", max: "", valid: "" }],
    ["message vide", { ...base, message: "" }],
    ["aucune prime", { ...base, min: "", max: "" }],
    ["minimum > maximum", { ...base, min: "120000", max: "100000" }],
    ["prime négative", { ...base, min: "-5000", max: "" }],
    ["sans date de validité", { ...base, valid: "" }],
    ["validité passée", { ...base, valid: isoDay(-3) }]
  ];
  for (const [label, fields] of refused) {
    const text = await submitProposalOnScreen(page, (await firmA(browser)).owner, target.assignmentId, fields);
    // Since lot 7 a past validity has its own readable message.
    expect(text, label).toBe(label === "validité passée" ? VALIDITY_REFUSAL : INVALID_REFUSAL);
  }
  // The browser itself also blocks an empty submit (required fields): no navigation, no request.
  await openAs(page, (await firmA(browser)).owner, `/leads/${target.assignmentId}`);
  await proposalCard(page).locator("#starter-proposal-valid").fill("");
  await proposalCard(page).getByRole("button", { name: "Envoyer la proposition au visiteur" }).click();
  await expect(page).not.toHaveURL(/[?&]proposal=/u);
  expect(proposalRowCount(target.assignmentId), "no proposal created by the refused submissions").toBe(before);
});

test("E-P6-03a validité « aujourd'hui » refusée (champ « Valable jusqu'au » : minimum demain)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner = (await firmA(browser)).owner;
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const before = proposalRowCount(target.assignmentId);
  const text = await submitProposalOnScreen(page, owner, target.assignmentId, { message: "Validité aujourd'hui.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(0) });
  note(`E-P6-03a validity today -> "${text}" rows ${before} -> ${proposalRowCount(target.assignmentId)}`);
  expect(text, "a validity of today must be refused").toBe(VALIDITY_REFUSAL);
  expect(proposalRowCount(target.assignmentId)).toBe(before);
});

test("E-P6-03b formulations interdites refusées (contrat validé, garanti à vie, guaranteed) ; « garanties incluses » et « garanti » passent", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner = (await firmA(browser)).owner;
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const before = proposalRowCount(target.assignmentId);
  const filled = { min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) };
  for (const message of ["Votre contrat validé est prêt.", "Une couverture garanti à vie.", "The price is guaranteed."]) {
    const text = await submitProposalOnScreen(page, owner, target.assignmentId, { ...filled, message });
    expect(text, message).toBe(WORDING_REFUSAL);
  }
  // Also in the guarantees list.
  const inList = await submitProposalOnScreen(page, owner, target.assignmentId, { ...filled, message: "Proposition indicative.", guarantees: "Assistance\nContrat validé" });
  expect(inList).toBe(WORDING_REFUSAL);
  expect(proposalRowCount(target.assignmentId), "nothing stored for the refused wordings").toBe(before);

  for (const message of ["Les garanties incluses sont listées ci-dessous.", "Prime garanti"]) {
    const text = await submitProposalOnScreen(page, owner, target.assignmentId, { ...filled, message });
    note(`E-P6-03b "${message}" -> "${text}"`);
    expect(text, message).toBe(SENT_NOTICE);
  }
  // "garanti" on its own, as the whole message.
  const alone = await submitProposalOnScreen(page, owner, target.assignmentId, { ...filled, message: "garanti" });
  note(`E-P6-03b "garanti" alone -> "${alone}"`);
  expect(alone).toBe(SENT_NOTICE);
});

test("E-P6-03c PDF : note.txt, gros.pdf (5 Mo + 1), faux.pdf refusés ; eicar.pdf refusé par l'antivirus", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner = (await firmA(browser)).owner;
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const before = proposalRowCount(target.assignmentId);
  const fields = { message: "Proposition avec pièce jointe.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) };
  const note_: UploadFile = { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("une note") };
  const fake: UploadFile = { name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("ceci n'est pas un PDF") };

  expect(await submitProposalOnScreen(page, owner, target.assignmentId, { ...fields, file: note_ }), "note.txt").toBe(NO_DOC_REFUSAL);
  expect(await submitProposalOnScreen(page, owner, target.assignmentId, { ...fields, file: fake }), "faux.pdf").toBe(NO_DOC_REFUSAL);
  expect(await submitProposalOnScreen(page, owner, target.assignmentId, { ...fields, file: eicarFile("eicar.pdf") }), "eicar.pdf").toBe(VIRUS_REFUSAL);
  expect(proposalRowCount(target.assignmentId), "no proposal stored for a refused file").toBe(before);
  // A clean PDF is accepted (control).
  const ok = await submitProposalOnScreen(page, owner, target.assignmentId, { ...fields, file: pdfFile("proposition.pdf", "Proposition de controle") });
  expect(ok).toBe(SENT_NOTICE);
});

test("E-P6-03c gros.pdf (5 Mo + 1 octet) : libellé « Fichier refusé » plutôt que « Saisie refusée »", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner = (await firmA(browser)).owner;
  const token = await ownerToken(browser);
  const big: UploadFile = { name: "gros.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024 + 1 - 9, 0x20)]) };
  const before = proposalRowCount(target.assignmentId);
  const direct = await sendProposalMultipart(token, target.assignmentId, validPayload("Proposition avec un PDF trop gros."), big);
  note(`E-P6-03c gros.pdf direct API -> ${brief(direct)}`);
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const text = await submitProposalOnScreen(page, owner, target.assignmentId, { message: "Proposition avec un PDF trop gros.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30), file: big });
  note(`E-P6-03c gros.pdf screen -> "${text}"`);
  await page.screenshot({ path: "test-results/edge-p5p7-02/evidence-E-P6-03c-gros-pdf.png" });
  expect(proposalRowCount(target.assignmentId), "oversize file stores nothing").toBe(before);
  expect(text, "gros.pdf").toBe(OVERSIZE_REFUSAL);
  expect(direct.status, "API answers 413").toBe(413);
});

test("E-P6-03g double clic sur « Envoyer la proposition au visiteur » : une seule proposition ; XSS du message échappé côté visiteur et courtier", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const message = `Proposition XSS ${uniqueSuffix()} ${XSS} ${SQL}`;
  const panel = await fillProposalForm(page, { message, min: "90000", max: "110000", currency: "XOF", valid: isoDay(30), guarantees: `Assistance ${XSS}` });
  await panel.getByRole("button", { name: "Envoyer la proposition au visiteur" }).dblclick();
  await page.waitForURL(/[?&]proposal=/u);
  await page.waitForLoadState("networkidle");
  await expectInert(page, "broker page");
  const token = await ownerToken(browser);
  await expect
    .poll(async () => (await proposalsOf(token, target.assignmentId)).items.filter((item) => item.message === message).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const copies = (await proposalsOf(token, target.assignmentId)).items.filter((item) => item.message === message);
  cases.xssProposalId = copies[0]?.id ?? "";
  cases.doubleClickCopies = String(copies.length);
  note(`E-P6-03g double click -> ${copies.length} proposal(s) stored`);
  // The text is rendered as text on the broker page (escaped), never executed.
  await page.goto(`${e2eEnv.brokerUrl}/leads/${target.assignmentId}`);
  await expect(proposalCard(page)).toContainText(`<img src=x onerror="window.__xss=1">`);
  await expectInert(page, "broker lead page");
  expect(copies.length, "one click pair must create one proposal").toBe(1);
});

test("E-P6-03g (visiteur) le message XSS de la proposition est rendu en texte sur l'espace de suivi et absent de l'e-mail", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  expect(cases.xssProposalId, "proposal of the XSS case").toBeTruthy();
  reserveTrackingViews(2, "E-P6-03g visitor view");
  const context = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor = await context.newPage();
  await visitor.goto(target.trackingLink);
  const cardX = visitorProposalCard(visitor, cases.xssProposalId as string);
  await expect(cardX).toBeVisible();
  await expect(cardX).toContainText(`<img src=x onerror="window.__xss=1">`);
  await expect(cardX).toContainText("DROP TABLE");
  await expectInert(visitor, "tracking space");
  await context.close();
  // E-mails to the visitor never repeat the broker's text.
  await expect
    .poll(async () => (await searchMessages(`to:"${target.email}"`)).filter((mail) => /proposition/iu.test(mail.Subject)).length, { timeout: 90_000, intervals: [2_000, 3_000] })
    .toBeGreaterThan(0);
  for (const summary of await searchMessages(`to:"${target.email}"`)) {
    const mail = await readMessage(summary.ID);
    expect(`${mail.Text}\n${mail.HTML}`, `e-mail "${mail.Subject}"`).not.toMatch(/onerror|<script|DROP TABLE/iu);
  }
});

test("E-P6-03d 10 propositions actives puis la onzième : 409 PROPOSAL_LIMIT_REACHED, blocage préventif ; retrait puis nouvel envoi", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const target = await lead(browser, "limit");
  const owner = (await firmA(browser)).owner;
  const token = await ownerToken(browser);
  for (let index = 1; index <= 10; index += 1) {
    const sent = await sendProposalApi(token, target.assignmentId, validPayload(`Proposition numéro ${index} pour la demande.`));
    proposalIdOf(sent);
  }
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  await expect(proposalCard(page)).toContainText("Propositions actives : 10 / 10");
  await expect(proposalCard(page)).toContainText("10 propositions actives au maximum : retirez-en une avant d'en envoyer une nouvelle.");
  await expect(proposalCard(page).getByRole("button", { name: "Envoyer la proposition au visiteur" })).toBeDisabled();

  const eleventh = await sendProposalApi(token, target.assignmentId, validPayload("Proposition numéro 11."));
  expect(eleventh.status, brief(eleventh)).toBe(409);
  expect(errorCodeOf(eleventh)).toBe("PROPOSAL_LIMIT_REACHED");
  expect((await proposalsOf(token, target.assignmentId)).items).toHaveLength(10);
  // The same refusal through the screen route handler (the form itself is disabled).
  const forced = await forceSubmitProposal(page, { message: "Proposition numéro 11.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) });
  expect(forced).toBe("Limite de 10 propositions actives atteinte pour ce lead.");

  // Withdraw one, then send a new one through the form.
  await openAs(page, owner, `/leads/${target.assignmentId}`);
  await withdrawOnScreen(page, "Proposition numéro 3 pour la demande.");
  await expect(proposalCard(page)).toContainText("Proposition retirée. Elle n'est plus visible du visiteur ; vous pouvez en envoyer une nouvelle.");
  await expect(proposalCard(page)).toContainText("Propositions actives : 9 / 10");
  const text = await submitProposalOnScreen(page, owner, target.assignmentId, { message: "Proposition de remplacement.", min: "95000", max: "105000", currency: "XOF", valid: isoDay(30) });
  expect(text).toBe(SENT_NOTICE);
  await expect(proposalCard(page)).toContainText("Propositions actives : 10 / 10");
});

// ---------------------------------------------------------------------------------------------
// Visitor space (tracking link), expiry, retired proposals
// ---------------------------------------------------------------------------------------------

test("E-P6-03e proposition expirée : statut « Expirée », ne compte plus parmi les actives (H11)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner = (await firmA(browser)).owner;
  const token = await ownerToken(browser);
  const sent = await sendProposalApi(token, target.assignmentId, validPayload(`Proposition à expirer ${uniqueSuffix()}`));
  const proposalId = proposalIdOf(sent);
  cases.expiredProposalId = proposalId;
  const before = await proposalsOf(token, target.assignmentId);
  expect(before.items.find((item) => item.id === proposalId)?.status).not.toBe("expired");
  expireProposalInDatabase(proposalId);
  const after = await proposalsOf(token, target.assignmentId);
  expect(after.items.find((item) => item.id === proposalId)?.status).toBe("expired");
  expect(after.activeCount, "an expired proposal is no longer active").toBe(before.activeCount - 1);
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  await expect(proposalCard(page)).toContainText(`Propositions actives : ${after.activeCount} / 10`);
  const item = proposalCard(page).locator("article").filter({ hasText: "Proposition à expirer" }).first();
  await expect(item).toContainText("Expirée");
  void owner;
});

test("E-P6-03f proposer sur un lead non accepté ou clôturé : refus 409 et libellés d'écran", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const notAccepted = await lead(browser, "fresh");
  const closedLead = await lead(browser, "race");
  const token = await ownerToken(browser);

  const refused = await sendProposalApi(token, notAccepted.assignmentId, validPayload("Proposition prématurée."));
  expect(refused.status, brief(refused)).toBe(409);
  expect(errorCodeOf(refused)).toBe("LEAD_NOT_ACCEPTED");
  let page = await ownerPage(browser, `/leads/${notAccepted.assignmentId}`);
  await expect(proposalCard(page)).toContainText("Acceptez d'abord le lead pour pouvoir répondre au visiteur.");
  await expect(proposalCard(page).getByRole("button", { name: "Envoyer la proposition au visiteur" })).toBeDisabled();
  expect(await forceSubmitProposal(page, { message: "Proposition prématurée.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) })).toBe("Le lead doit être accepté avant toute proposition.");
  expect(proposalRowCount(notAccepted.assignmentId)).toBe(0);

  const closedRefusal = await sendProposalApi(token, closedLead.assignmentId, validPayload("Proposition tardive."));
  expect(closedRefusal.status, brief(closedRefusal)).toBe(409);
  expect(errorCodeOf(closedRefusal)).toBe("LEAD_CLOSED");
  page = await ownerPage(browser, `/leads/${closedLead.assignmentId}`);
  await expect(proposalCard(page)).toContainText("Ce lead est clôturé : aucune nouvelle proposition n'est possible.");
  expect(await forceSubmitProposal(page, { message: "Proposition tardive.", min: "90000", max: "110000", currency: "XOF", valid: isoDay(30) })).toBe("Ce lead est clôturé : aucune proposition ne peut être envoyée.");
  // Only the proposal sent before the closure exists.
  expect(proposalRowCount(closedLead.assignmentId)).toBe(1);
});

test("E-P6-05a « Poser une question » sans texte refusé ; 501 caractères et créneau de 101 caractères : limites 500 et 100", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const target = await lead(browser, "main");
  const token = await ownerToken(browser);
  const sent = await sendProposalApi(token, target.assignmentId, validPayload(`Proposition pour réponses ${uniqueSuffix()}`, { guarantees: ["Assistance 24h/24"] }));
  const proposalId = proposalIdOf(sent);
  cases.answeredProposalId = proposalId;
  // Withdrawn-in-between proposal for E-P6-05b (stale form).
  const stale = await sendProposalApi(token, target.assignmentId, validPayload(`Proposition à retirer ${uniqueSuffix()}`));
  cases.staleProposalId = proposalIdOf(stale);

  ensureRateBudget("proposal_response", 10, 4, "E-P6-05a/05b first block");
  reserveTrackingViews(6, "E-P6-05a/05b visitor views");
  const context = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor = await context.newPage();
  await visitor.goto(target.trackingLink);
  const cardA = visitorProposalCard(visitor, proposalId);
  await expect(cardA).toBeVisible();

  // 1. A question without text: refused on the form, nothing sent.
  await cardA.getByLabel("Poser une question").check({ force: true });
  await cardA.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(cardA.getByText("Saisissez votre question avant de l'envoyer.")).toBeVisible();
  expect((await proposalsOf(token, target.assignmentId)).items.find((item) => item.id === proposalId)?.responses).toHaveLength(0);

  // 2. 501 characters: the field caps at 500 (a script-set value is truncated to 500 before sending).
  await cardA.getByLabel("Votre question au courtier").fill("q".repeat(501));
  await cardA.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(cardA.getByText("Réponse transmise au courtier")).toBeVisible();
  const recorded = (await proposalsOf(token, target.assignmentId)).items.find((item) => item.id === proposalId)?.responses ?? [];
  expect(recorded).toHaveLength(1);
  expect(String(recorded[0]?.question).length, "question stored at 500 characters").toBe(500);

  // 3. Forced 501 and 101 through the API: refused by the schema.
  const tooLong = await visitorCall(target, proposalId, { type: "question", question: "q".repeat(501) });
  expect(tooLong.status, brief(tooLong)).toBe(400);
  const tooLongSlot = await visitorCall(target, proposalId, { type: "interested", callbackSlot: "s".repeat(101) });
  expect(tooLongSlot.status, brief(tooLongSlot)).toBe(400);
  const exactly500 = await visitorCall(target, proposalId, { type: "question", question: "q".repeat(500) });
  expect(exactly500.status, brief(exactly500)).toBe(201);
  await context.close();

  // 4. Callback slot of 101 characters on the screen: truncated to 100 (new page, the form was replaced after the first answer).
  ensureRateBudget("proposal_response", 10, 2, "E-P6-05a slot");
  const second = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor2 = await second.newPage();
  await visitor2.goto(target.trackingLink);
  const card2 = visitorProposalCard(visitor2, proposalId);
  await card2.getByLabel("Je suis intéressé, rappelez-moi").check({ force: true });
  await card2.getByLabel(/Créneau de rappel souhaité/u).fill("s".repeat(101));
  await card2.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(card2.getByText("Réponse transmise au courtier")).toBeVisible();
  const slots = ((await proposalsOf(token, target.assignmentId)).items.find((item) => item.id === proposalId)?.responses ?? []).filter((response) => response.type === "interested");
  expect(String(slots[0]?.callbackSlot).length, "callback slot stored at 100 characters").toBe(100);
  await second.close();
});

test("E-P6-05b réponse à une proposition retirée, expirée ou « Plus active » : message et 409 PROPOSAL_NOT_RESPONDABLE", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const target = await lead(browser, "main");
  const closedLead = await lead(browser, "race");
  const token = await ownerToken(browser);
  expect(cases.staleProposalId, "stale proposal of E-P6-05a").toBeTruthy();
  expect(cases.expiredProposalId, "expired proposal of E-P6-03e").toBeTruthy();
  expect(cases.closedLeadProposalId ?? cases.closedLeadProposal, "proposal of the closed lead").toBeTruthy();
  const staleId = cases.staleProposalId as string;
  const expiredId = cases.expiredProposalId as string;
  const closedId = cases.closedLeadProposal as string;

  ensureRateBudget("proposal_response", 10, 5, "E-P6-05b");
  reserveTrackingViews(4, "E-P6-05b visitor views");
  // Withdrawn: the page was opened before the broker withdrew it.
  const context = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor = await context.newPage();
  await visitor.goto(target.trackingLink);
  const staleCard = visitorProposalCard(visitor, staleId);
  await expect(staleCard).toBeVisible();
  const withdrawn = await apiCall(token, "POST", `/broker/starter/leads/${target.assignmentId}/proposals/${staleId}/withdraw`, { reason: "Retrait pour le test" });
  expect(withdrawn.status, brief(withdrawn)).toBe(200);
  await staleCard.getByLabel("Je suis intéressé, rappelez-moi").check({ force: true });
  await staleCard.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(staleCard.getByText(NOT_RESPONDABLE)).toBeVisible();
  // Forced through the API: 409 with its message.
  const forced = await visitorCall(target, staleId, { type: "interested" });
  expect(forced.status, brief(forced)).toBe(409);
  expect(errorCodeOf(forced)).toBe("PROPOSAL_NOT_RESPONDABLE");
  expect(asRecord(forced.body).message).toBe("This proposal can no longer receive a response");
  // After a reload the withdrawn proposal is gone from the visitor's space.
  await visitor.reload();
  await expect(visitorProposalCard(visitor, staleId)).toHaveCount(0);

  // Expired (date moved in the throwaway database).
  const expiredCard = visitorProposalCard(visitor, expiredId);
  await expect(expiredCard).toBeVisible();
  await expect(expiredCard).toHaveAttribute("data-proposal-status", "expired");
  await expect(expiredCard).toContainText("La date de validité de cette proposition est dépassée : vous ne pouvez plus y répondre depuis cet espace.");
  await expect(expiredCard.locator("form[data-form='proposal-response']")).toHaveCount(0);
  const forcedExpired = await visitorCall(target, expiredId, { type: "interested" });
  expect(forcedExpired.status, brief(forcedExpired)).toBe(409);
  expect(errorCodeOf(forcedExpired)).toBe("PROPOSAL_NOT_RESPONDABLE");
  await context.close();

  // "Plus active": the lead of the proposal is closed.
  const other = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor2 = await other.newPage();
  await visitor2.goto(closedLead.trackingLink);
  const closedCard = visitorProposalCard(visitor2, closedId);
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("Plus active");
  await expect(closedCard).toContainText("Cette proposition n'est plus active : vous ne pouvez plus y répondre depuis cet espace.");
  await expect(closedCard.locator("form[data-form='proposal-response']")).toHaveCount(0);
  const forcedClosed = await visitorCall(closedLead, closedId, { type: "question", question: "Toujours là ?" });
  expect(forcedClosed.status, brief(forcedClosed)).toBe(409);
  expect(errorCodeOf(forcedClosed)).toBe("PROPOSAL_NOT_RESPONDABLE");
  await other.close();
});

test("E-P6-05c XSS dans la question du visiteur : texte échappé côté visiteur et côté courtier", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const token = await ownerToken(browser);
  const owner = (await firmA(browser)).owner;
  const proposalId = cases.xssProposalId as string;
  expect(proposalId, "proposal of the XSS case").toBeTruthy();
  ensureRateBudget("proposal_response", 10, 1, "E-P6-05c XSS question");
  reserveTrackingViews(2, "E-P6-05c visitor view");
  const context = await browser.newContext({ baseURL: e2eEnv.publicUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const visitor = await context.newPage();
  await visitor.goto(target.trackingLink);
  const cardX = visitorProposalCard(visitor, proposalId);
  await expect(cardX).toBeVisible();
  await cardX.getByLabel("Poser une question").check({ force: true });
  const question = `${XSS} ${SQL}`.slice(0, 480);
  await cardX.getByLabel("Votre question au courtier").fill(question);
  await cardX.getByRole("button", { name: "Envoyer ma réponse au courtier" }).click();
  await expect(cardX.getByText("Réponse transmise au courtier")).toBeVisible();
  await expectInert(visitor, "tracking space after the answer");
  await context.close();

  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  await expect(proposalCard(page)).toContainText(`<img src=x onerror="window.__xss=1">`);
  await expectInert(page, "broker lead page with the visitor question");
  void token;
  void owner;
});

test.fixme("E-P6-05c rafale de réponses (10 par IP et par heure, 5 par proposition) : NON EXÉCUTÉ, pile jetable partagée (blocage IP d'une heure pour tous les lots)", () => {
  // Rate limits are never exercised by this lot (hard rule 1 of the brief).
});

// ---------------------------------------------------------------------------------------------
// 11.1 E-P6-01c: free-text answers (XSS / SQL / formula) and the CSV export
// ---------------------------------------------------------------------------------------------

test("E-P6-01c réponses du devis avec XSS/SQL : texte échappé dans la fiche ; export CSV sans contact ni formule active", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const target = await lead(browser, "xss");
  const owner = (await firmA(browser)).owner;
  const page = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const answers = card(page, "Réponses consenties");
  await expect(answers).toBeVisible();
  await expect(answers).toContainText(`<img src=x onerror="window.__xss=1">`);
  await expect(answers).toContainText("DROP TABLE");
  await expect(answers).toContainText(FORMULA);
  await expectInert(page, "lead sheet");

  // The list stays healthy (no 500) and the export is fetched with the broker's session.
  await openAs(page, owner, "/leads");
  await expect(page.getByRole("table", { name: "Leads assignés" })).toContainText(target.reference);
  const response = await brokerGet(page, "/leads/export");
  expect(response.status, `export: ${response.text.slice(0, 120)}`).toBe(200);
  expect(response.headers["content-type"]).toContain("text/csv");
  expect(response.headers["content-disposition"]).toContain("attachment");
  const csv = response.text;
  const rows = csv.trim().split(/\r?\n/u).map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/gu, "")));
  expect(rows[0]).toEqual(["leadAssignmentId", "publicReference", "countryCode", "productKey", "status", "assignedAt", "seen"]);
  expect(rows.some((row) => row.includes(target.reference)), "the lead is in the export").toBe(true);
  // No contact data and no answer text (the export has no answer column), no cell that a spreadsheet would read as a formula.
  for (const secret of [target.email, target.phone, "Mariam", "Traoré", "HYPERLINK", "onerror", "DROP TABLE"]) expect(csv, `export must not contain ${secret}`).not.toContain(secret);
  for (const row of rows) for (const cell of row) expect(cell, `cell ${cell}`).not.toMatch(/^[=+\-@\t\r]/u);
  note("E-P6-01c the starter export has no answer column: the quote-prefix neutralisation of a free answer cannot be observed in it (csv-cell.ts unit-level only)");
  void xssLeadMeta;
});

// ---------------------------------------------------------------------------------------------
// T-02 cross-broker access
// ---------------------------------------------------------------------------------------------

test("T-02 le courtier B n'accède ni aux propositions, ni aux PDF, ni aux documents du lead de A (403/404 sans donnée, incident audité)", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  const target = await lead(browser, "main");
  const ownerA = (await firmA(browser)).owner;
  const ownerB = (await firmB(browser)).owner;
  const tokenA = await ownerToken(browser);
  const tokenB = await tokenFor(browser, ownerB);

  // A sends a proposal with a PDF (the document B must not read).
  const pdfPage = await ownerPage(browser, `/leads/${target.assignmentId}`);
  const message = `Proposition avec PDF ${uniqueSuffix()}`;
  const notice = await submitProposalOnScreen(pdfPage, ownerA, target.assignmentId, { message, min: "90000", max: "110000", currency: "XOF", valid: isoDay(30), file: pdfFile("proposition-a.pdf", `Proposition ${target.reference}`) });
  expect(notice).toBe(SENT_NOTICE);
  const mine = (await proposalsOf(tokenA, target.assignmentId)).items.find((item) => item.message === message);
  expect(mine, "A's proposal with a PDF").toBeDefined();
  const proposalId = (mine as { id: string }).id;
  // Control: A downloads its own PDF.
  const own = await brokerGet(pdfPage, `/leads/${target.assignmentId}/proposals/${proposalId}/document`);
  expect(own.status).toBe(200);
  expect(own.body.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const countBefore = proposalRowCount(target.assignmentId);

  const secrets = [target.email, target.phone, target.reference, message, "Mariam"];
  const leadId = target.assignmentId;
  const auditBefore = crossTenantAuditCount(leadId);
  const calls: Array<[string, Promise<{ status: number; text: string }>]> = [
    ["GET lead (control)", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}`)],
    ["GET proposals", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}/proposals`)],
    ["POST proposal", apiCall(tokenB, "POST", `/broker/starter/leads/${leadId}/proposals`, validPayload("Proposition de B sur le lead de A."))],
    ["POST withdraw", apiCall(tokenB, "POST", `/broker/starter/leads/${leadId}/proposals/${proposalId}/withdraw`, {})],
    ["GET proposal document", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}/proposals/${proposalId}/document`)],
    ["GET history", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}/history`)],
    ["GET conversation", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}/conversation`)],
    ["GET document requests", apiCall(tokenB, "GET", `/broker/starter/leads/${leadId}/document-requests`)]
  ];
  const results = await Promise.all(calls.map(async ([label, promise]) => [label, await promise] as const));
  const summary: string[] = [];
  for (const [label, result] of results) {
    summary.push(`${label} -> ${result.status}`);
    expect([403, 404], `${label}: ${result.status} ${result.text.slice(0, 160)}`).toContain(result.status);
    for (const secret of secrets) expect(result.text, `${label} leaks ${secret}`).not.toContain(secret);
    expect(result.text.startsWith("%PDF"), `${label} returned a PDF`).toBe(false);
  }
  note(`T-02 B on A's lead: ${summary.join("; ")}`);
  expect(proposalRowCount(target.assignmentId), "B created no proposal on A's lead").toBe(countBefore);
  expect((await proposalsOf(tokenA, target.assignmentId)).items.find((item) => item.id === proposalId)?.status, "B did not withdraw A's proposal").not.toBe("withdrawn");

  // The refusals are audited as cross_tenant_access incidents on A's lead.
  await expect
    .poll(() => crossTenantAuditCount(leadId) - auditBefore, { timeout: 20_000, intervals: [1_000, 2_000], message: "cross_tenant_access audit rows" })
    .toBeGreaterThanOrEqual(4);
  note(`T-02 cross_tenant_access audit rows added: ${crossTenantAuditCount(leadId) - auditBefore} for ${calls.length} calls`);

  // Screens of B: lead page and proposal PDF URL of A.
  const pageB = await visit(browser, ownerB, `/leads/${leadId}`);
  await expect(pageB.getByText("Accès refusé").first()).toBeVisible();
  await expect(pageB.getByText("Ce lead n'est pas accessible avec votre tenant, vos permissions ou votre MFA. Aucune donnée protégée n'est affichée.")).toBeVisible();
  for (const secret of secrets) await expect(pageB.locator("body")).not.toContainText(secret);
  const pdfB = await brokerGet(pageB, `/leads/${leadId}/proposals/${proposalId}/document`);
  expect([403, 404], `B on the PDF URL of A: ${pdfB.status}`).toContain(pdfB.status);
  expect(pdfB.body.subarray(0, 4).toString("latin1")).not.toBe("%PDF");
  for (const secret of secrets) expect(pdfB.text, `PDF URL leaks ${secret}`).not.toContain(secret);
  // B's list holds no lead of A.
  await pageB.goto(`${e2eEnv.brokerUrl}/leads`);
  await expect(pageB.locator("body")).not.toContainText(target.reference);
  const listed = await listProposalsApi(tokenB, leadId);
  expect(listed.status).not.toBe(200);
  // The control: the owner of A still sees its own proposal.
  const stillThere = await proposalsOf(tokenA, target.assignmentId);
  expect(stillThere.items.some((item) => item.id === proposalId)).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// RSP-03 375 px
// ---------------------------------------------------------------------------------------------

test("RSP-03 largeur 375 px : /leads, fiche du lead et panneau de proposition sans défilement horizontal, formulaire utilisable", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "mobile");
  const owner: BackOfficeAccount = (await firmA(browser)).owner;
  const context = await browser.newContext({ baseURL: e2eEnv.brokerUrl, viewport: { width: 375, height: 812 }, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const page = await context.newPage();
  const overflow = async (label: string): Promise<void> => {
    const metrics = await page.evaluate(() => {
      const width = window.innerWidth;
      const wide = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => element.getBoundingClientRect().right > width + 1 && getComputedStyle(element).position !== "fixed")
        .slice(0, 5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 40)}`);
      return { scroll: document.documentElement.scrollWidth, inner: width, wide };
    });
    if (metrics.scroll > metrics.inner + 1) {
      await page.screenshot({ path: `test-results/edge-p5p7-02/evidence-RSP-03-${label.replace(/\W+/gu, "-")}.png`, fullPage: true });
      note(`RSP-03 ${label}: page scrollWidth ${metrics.scroll} > ${metrics.inner}; widest: ${metrics.wide.join(", ")}`);
    }
    expect(metrics.scroll, `${label}: horizontal page scroll (wide elements: ${metrics.wide.join(", ")})`).toBeLessThanOrEqual(metrics.inner + 1);
  };

  await openAs(page, owner, "/leads");
  await expect(page.getByRole("table", { name: "Leads assignés" })).toBeVisible();
  await overflow("/leads");
  await openAs(page, owner, `/leads/${target.assignmentId}`);
  await expect(card(page, "Informations utiles")).toBeVisible();
  await overflow("fiche du lead");
  const panel = proposalCard(page);
  await panel.scrollIntoViewIfNeeded();
  for (const selector of ["#starter-proposal-message", "#starter-proposal-min", "#starter-proposal-max", "#starter-proposal-valid", "#starter-proposal-guarantees", "#starter-proposal-file"]) {
    const field = panel.locator(selector);
    await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box ? box.x : -1, `${selector} left edge`).toBeGreaterThanOrEqual(0);
    expect(box ? box.x + box.width : 999, `${selector} right edge`).toBeLessThanOrEqual(376);
  }
  await panel.locator("#starter-proposal-message").fill("Message saisi sur mobile.");
  await panel.locator("#starter-proposal-min").fill("90000");
  await expect(panel.locator("#starter-proposal-message")).toHaveValue("Message saisi sur mobile.");
  const submit = panel.getByRole("button", { name: "Envoyer la proposition au visiteur" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeEnabled();
  await overflow("panneau de proposition");
  await context.close();
});

test("RSP-03 une réponse du visiteur d'un seul mot de 500 caractères ne fait pas défiler horizontalement la fiche du lead à 375 px", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const target = await lead(browser, "main");
  const owner: BackOfficeAccount = (await firmA(browser)).owner;
  const context = await browser.newContext({ baseURL: e2eEnv.brokerUrl, viewport: { width: 375, height: 812 }, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const page = await context.newPage();
  await openAs(page, owner, `/leads/${target.assignmentId}`);
  await expect(proposalCard(page)).toBeVisible();
  const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  note(`ANOMALIE RSP-03 lead page with a 500-character visitor question: scrollWidth ${metrics.scroll} for a ${metrics.inner} px screen`);
  await page.screenshot({ path: "test-results/edge-p5p7-02/evidence-RSP-03-long-visitor-answer.png", fullPage: true });
  await context.close();
  expect(metrics.scroll, "page scrollWidth").toBeLessThanOrEqual(metrics.inner + 1);
});
