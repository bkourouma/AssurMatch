import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectMfaPromptOnLogin, login, loginExpectingNoMfa, newAppContext, openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadWorld, saveWorld } from "./support/journey-state";
import { searchMessages, readMessage } from "./support/mailpit";
import { apiCall, asRecord, itemsOf } from "./support/pro-roles";
import { ensureFirm } from "./support/recos-062";
import {
  cookieValue,
  decideDispute,
  deviceCookieName,
  disputeDetailCard,
  expectWrongPasswordRefused,
  logoutFromShell,
  openDisputeDetail,
  sessionToken,
  trustedDeviceRows
} from "./support/recos-063";
import { card } from "./support/ui";
import { provisionBroker, superAdminAccount } from "./support/world";
import type { BrokerWorld } from "./support/journey-state";

// Spec 065 phase B / lot 063 - critical fixes, scenarios A (MFA + trusted devices) and B (lead disputes).
//   MFA-01  after logout, a fresh login always asks the TOTP (verification only, no enrolment);
//   MFA-02  "trust this device": same context skips the code, a new context does not, the password is still required;
//   MFA-03  "Sécurité du compte" lists the trusted device, "revoke all" removes it (broker, then admin);
//   MFA-04  API: a password-only token is refused on protected routes and on /auth/mfa/enroll (MFA_REQUIRED);
//   DSP-00  a Starter and a Pro firm, each with an offer and two accepted leads;
//   DSP-01  Starter owner contests a lead; second dispute refused (UI + API 409); dispute window open;
//   DSP-02  Pro owner contests from the CRM detail; second refused; a broker cannot decide (403);
//   DSP-03  finance prepares the credit paths (tariffs, drafts, invoice of the Pro firm);
//   DSP-04  finance rejects (short reason refused first) and accepts (draft credit, then partial credit note);
//   DSP-05  brokers see status, decision, credit, in-app notification and a pointer e-mail; replay is idempotent.
// Gap: the 30-day expiry (409 DISPUTE_WINDOW_EXPIRED) cannot be exercised through the screens (no clock control).

test.describe.configure({ mode: "serial" });

const MFA_KEY = "m063mfa";
const STARTER_BASE = "m063s";
const PRO_BASE = "m063p";
const REJECT_REASON = "Lead conforme: coordonnées valides et joignables, la facturation est maintenue.";
const ACCEPT_REASON = "Prospect injoignable confirmé par nos contrôles, crédit accordé au cabinet.";
const DECISION_MAIL = /Décision sur votre contestation/u;
const CREDIT_NOTE_NUMBER = /CI-AV-\d{4}-\d{5,}/u;

async function brokerPage(browser: Browser): Promise<Page> {
  return (await newAppContext(browser, e2eEnv.brokerUrl)).newPage();
}

async function adminPage(browser: Browser): Promise<Page> {
  return (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
}

// A dispute is decided once per lead: a firm whose disputes were decided (data.started) cannot serve a second run,
// so DSP-00 moves to a fresh firm ("<base>-N") on a re-run against the same stack. Later tests reuse the choice.
let chosen: { starter: string; pro: string } | undefined;

function latestKey(base: string): string {
  let latest = `${base}-0`;
  for (let index = 0; loadWorld(`${base}-${index}`); index += 1) latest = `${base}-${index}`;
  return latest;
}

function freshKey(base: string): string {
  const latest = latestKey(base);
  return loadWorld(latest)?.data.started === "1" ? `${base}-${Number(latest.split("-").pop()) + 1}` : latest;
}

function firms(): { starter: string; pro: string } {
  chosen ??= { starter: latestKey(STARTER_BASE), pro: latestKey(PRO_BASE) };
  return chosen;
}

function requireWorldOf(key: string): BrokerWorld {
  const world = loadWorld(key);
  if (!world) throw new Error(`world ${key} is missing: run the earlier tests of the file first`);
  return world;
}

function leadIds(world: BrokerWorld): { a: string; b: string; refA: string; refB: string } {
  const { leadAId, leadBId, leadARef, leadBRef } = world.data;
  if (!leadAId || !leadBId || !leadARef || !leadBRef) throw new Error(`leads of ${world.partnerName} are not set up: run DSP-00 first`);
  return { a: leadAId, b: leadBId, refA: leadARef, refB: leadBRef };
}

/** Trusted-device journey on one app: tick "trust", skip the code on the next login, then list and revoke the device. */
async function trustSkipRevoke(browser: Browser, account: BackOfficeAccount): Promise<void> {
  const page = await (await newAppContext(browser, account.app === "admin" ? e2eEnv.adminUrl : e2eEnv.brokerUrl)).newPage();
  const cookie = deviceCookieName(account.app);

  await login(page, account, "/", { trustDevice: true });
  expect(await cookieValue(page.context(), cookie), "trusted-device cookie set at verification").toBeTruthy();
  await logoutFromShell(page);
  await loginExpectingNoMfa(page, account, "/account/security");

  // The security page lists the device and offers "revoke all".
  await page.goto(`${appUrl(account)}/account/security`);
  await expect(page.getByRole("heading", { name: "Sécurité du compte" })).toBeVisible();
  // The broker also holds the device trusted by MFA-02: at least this context's device is listed.
  await expect(trustedDeviceRows(page).first()).toBeVisible();
  await page.getByRole("button", { name: "Révoquer tous les appareils de confiance" }).click();
  await expect(page.getByText(/\d+ appareils? de confiance révoqués?/u)).toBeVisible();
  await expect(page.getByText("Aucun appareil de confiance actif")).toBeVisible();
  expect(await cookieValue(page.context(), cookie), "the cookie is cleared with the revocation").toBeUndefined();

  // Back to the code on the next login.
  await logoutFromShell(page);
  await expectMfaPromptOnLogin(page, account);
  await page.context().close();
}

function appUrl(account: BackOfficeAccount): string {
  return account.app === "admin" ? e2eEnv.adminUrl : e2eEnv.brokerUrl;
}

// ---------------------------------------------------------------------------------------------
// Part 1 - MFA
// ---------------------------------------------------------------------------------------------

test("MFA-01 après déconnexion, une nouvelle connexion exige toujours le code MFA (vérification seule, sans ré-enrôlement)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  let world = loadWorld(MFA_KEY);
  if (!world) {
    world = await provisionBroker(browser, { plan: "starter", label: "mfa" });
    saveWorld(MFA_KEY, world);
  }
  const owner = world.owner;

  const first = await brokerPage(browser);
  await login(first, owner);
  await logoutFromShell(first);
  await expectMfaPromptOnLogin(first, owner);
  // The password-only session opens no protected page: it is sent back to the code.
  await first.goto(`${e2eEnv.brokerUrl}/leads`);
  await expect(first).toHaveURL(/\/mfa|\/login\?reason=mfa_required/u);
  await expect(first.locator("#mfa-code").or(first.locator("#login-email"))).toBeVisible();
  await first.context().close();

  // A fresh browser context behaves the same.
  const fresh = await brokerPage(browser);
  await expectMfaPromptOnLogin(fresh, owner, "/leads");
  await fresh.context().close();
});

test("MFA-02 « Faire confiance à cet appareil » : même contexte sans code, nouveau contexte avec code, mot de passe toujours exigé", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const owner = requireWorldOf(MFA_KEY).owner;

  const trusted = await brokerPage(browser);
  await login(trusted, owner, "/", { trustDevice: true });
  expect(await cookieValue(trusted.context(), deviceCookieName("broker")), "device cookie").toBeTruthy();
  await logoutFromShell(trusted);
  await loginExpectingNoMfa(trusted, owner, "/leads");
  await expect(trusted).toHaveURL(/\/leads/u);

  // A new context holds no cookie: the code is asked again.
  const other = await brokerPage(browser);
  await expectMfaPromptOnLogin(other, owner);
  await other.context().close();

  // The password is always required, even with the cookie.
  await logoutFromShell(trusted);
  await expectWrongPasswordRefused(trusted, owner);
  await loginExpectingNoMfa(trusted, owner);
  await trusted.context().close();
});

test("MFA-03 la page « Sécurité du compte » liste l'appareil de confiance ; « tout révoquer » rétablit le code (courtier puis Super Admin)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  await trustSkipRevoke(browser, requireWorldOf(MFA_KEY).owner);
  // Same on the admin app with the Super Admin (its password and MFA are left untouched).
  await trustSkipRevoke(browser, superAdminAccount());
});

test("MFA-04 API : un jeton obtenu avec le seul mot de passe est refusé (403) sur une route protégée et sur /auth/mfa/enroll", async () => {
  const owner = requireWorldOf(MFA_KEY).owner;
  const session = await apiCall(undefined, "POST", "/auth/login", { email: owner.email, password: owner.password });
  expect([200, 201]).toContain(session.status);
  const body = asRecord(session.body);
  expect(body.mfaRequired, "login without trusted device").toBe(true);
  const token = String(body.accessToken ?? "");
  expect(token.length).toBeGreaterThan(20);
  expect(session.text, "the login answer never carries the MFA secret").not.toContain(owner.totpSecret);

  const protectedRoute = await apiCall(token, "GET", "/auth/trusted-devices");
  expect(protectedRoute.status, "protected route with a password-only token").toBe(403);
  const billing = await apiCall(token, "GET", "/broker/billing/disputes");
  expect(billing.status, "broker billing with a password-only token").toBe(403);

  const enroll = await apiCall(token, "POST", "/auth/mfa/enroll");
  expect(enroll.status, "no re-enrolment without the second factor").toBe(403);
  expect(enroll.text).toContain("MFA_REQUIRED");
  expect(enroll.text, "the existing secret is never returned").not.toContain(owner.totpSecret);
});

// ---------------------------------------------------------------------------------------------
// Part 2 - lead disputes
// ---------------------------------------------------------------------------------------------

test("DSP-00 un cabinet Starter et un cabinet Pro ont chacun une offre publiée et deux leads acceptés", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  chosen = { starter: freshKey(STARTER_BASE), pro: freshKey(PRO_BASE) };
  await ensureFirm(browser, firms().starter, "starter", "disps");
  await ensureFirm(browser, firms().pro, "pro", "dispp");
  leadIds(requireWorldOf(firms().starter));
  leadIds(requireWorldOf(firms().pro));
});

test("DSP-01 Starter : le titulaire conteste un lead depuis sa fiche ; statut « Ouverte », seconde contestation refusée", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const world = requireWorldOf(firms().starter);
  const { a, b } = leadIds(world);
  const page = await brokerPage(browser);

  await openAs(page, world.owner, `/leads/${a}`);
  const actions = card(page, "Actions Starter");
  // The window is open: the deadline is announced and the action is offered.
  await expect(actions).toContainText(/Contestation possible jusqu'au/u);
  await expect(actions.getByRole("button", { name: "Contester avec motif" })).toBeVisible();
  const token = await sessionToken(page, "broker");

  await actions.getByRole("button", { name: "Contester avec motif" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#dispute-reason").selectOption("lead_quality");
  await dialog.locator("#dispute-comment").fill("Coordonnées incohérentes (E2E 063)");
  await dialog.getByRole("button", { name: "Contester le lead" }).last().click();
  await expect(page.getByText("Contestation enregistree et historisee")).toBeVisible();

  const status = card(page, "Contestation de ce lead");
  await expect(status).toContainText("Ouverte");
  await expect(status).toContainText("Qualité du lead insuffisante");
  await expect(status).toContainText(/en attente de la décision de la finance/u);
  // Second dispute: no button, and the API refuses with 409 DISPUTE_ALREADY_EXISTS.
  await expect(page.getByRole("button", { name: "Contester avec motif" })).toHaveCount(0);
  await expect(page.getByText("Contestation indisponible")).toBeVisible();
  const again = await apiCall(token, "POST", `/broker/starter/leads/${a}/dispute`, { reason: "duplicate" });
  expect(again.status).toBe(409);
  expect(again.text).toContain("DISPUTE_ALREADY_EXISTS");

  // Lead B is contested too (finance will accept this one).
  await openAs(page, world.owner, `/leads/${b}`);
  const actionsB = card(page, "Actions Starter");
  await actionsB.getByRole("button", { name: "Contester avec motif" }).click();
  const dialogB = page.locator("dialog[open]");
  await dialogB.locator("#dispute-reason").selectOption("unreachable_prospect");
  await dialogB.getByRole("button", { name: "Contester le lead" }).last().click();
  await expect(card(page, "Contestation de ce lead")).toContainText("Ouverte");
  await page.context().close();
});

test("DSP-02 Pro : le titulaire conteste depuis le détail CRM (motif dans une liste) ; seconde contestation refusée ; un courtier ne peut pas statuer", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const world = requireWorldOf(firms().pro);
  const { a } = leadIds(world);
  const page = await brokerPage(browser);

  await openAs(page, world.owner, `/crm/leads/${a}`);
  const contest = card(page, "Contester ce lead");
  await expect(contest).toContainText(/Contestation possible jusqu'au/u);
  const token = await sessionToken(page, "broker");
  // The window is exposed by the API (open state).
  const detail = asRecord((await apiCall(token, "GET", `/broker/crm/leads/${a}`)).body);
  expect(asRecord(detail.disputeWindow).open, "disputeWindow.open").toBe(true);

  await contest.getByRole("button", { name: "Contester", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#crm-dispute-reason").selectOption("invalid_lead");
  await dialog.locator("#crm-dispute-comment").fill("Numéro invalide (E2E 063)");
  await dialog.getByRole("button", { name: "Contester le lead" }).last().click();
  await expect(page.getByText("Contestation enregistrée et historisée")).toBeVisible();

  const status = card(page, "Contestation de ce lead");
  await expect(status).toContainText("Ouverte");
  await expect(status).toContainText("Lead invalide");
  await expect(card(page, "Contester ce lead").getByRole("button", { name: "Contester", exact: true })).toHaveCount(0);
  const again = await apiCall(token, "POST", `/broker/crm/leads/${a}/disputes`, { reason: "invalid_lead" });
  expect(again.status).toBe(409);
  expect(again.text).toContain("DISPUTE_ALREADY_EXISTS");

  // Only finance decides: a broker token is refused on both admin routes.
  const list = await apiCall(token, "GET", "/admin/billing/disputes");
  expect(list.status, "a broker cannot list the finance disputes").toBe(403);
  const own = itemsOf(await apiCall(token, "GET", "/broker/billing/disputes"));
  expect(own.length, "the broker sees its own dispute").toBe(1);
  const decide = await apiCall(token, "POST", `/admin/billing/disputes/${String(own[0]?.id)}/decision`, { decision: "accept", reason: "Tentative de décision par un courtier" });
  expect(decide.status, "a broker cannot decide").toBe(403);
  await page.context().close();
});

test("DSP-03 la finance prépare les voies de crédit : tarifs Starter et Pro, brouillons, facture du mois du cabinet Pro", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const pro = requireWorldOf(firms().pro);
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/billing?tab=tarifs");
  for (const price of [
    { plan: "starter", subscription: "25000", perLead: "5000" },
    { plan: "pro", subscription: "60000", perLead: "8000" }
  ]) {
    await admin.goto(`${e2eEnv.adminUrl}/billing?tab=tarifs`);
    const tariff = card(admin, "Tarifs par plan et pays");
    await tariff.locator("#billing-plan").selectOption(price.plan);
    await tariff.locator("#billing-country").fill("CI");
    await tariff.locator("#billing-subscription").fill(price.subscription);
    await tariff.locator("#billing-per-lead").fill(price.perLead);
    await tariff.locator("#billing-plan-reason").fill(`Tarif ${price.plan} CI (E2E 063)`);
    await tariff.getByRole("button", { name: "Enregistrer le tarif" }).click();
    await expect(admin.getByText("Tarif de plan enregistre et audite.")).toBeVisible();
  }

  await admin.goto(`${e2eEnv.adminUrl}/billing?tab=brouillons`);
  const drafts = card(admin, "Brouillons mensuels non facturables");
  await drafts.locator("#billing-draft-reason").fill("Brouillons avant décisions de contestation (E2E 063)");
  await drafts.getByRole("button", { name: "Recalculer les brouillons" }).click();
  await expect(admin.getByText(/Brouillons recalcules/u)).toBeVisible();

  // Pro firm: the month is invoiced BEFORE its dispute is decided -> partial credit note path.
  await admin.goto(`${e2eEnv.adminUrl}/billing?tab=factures`);
  const issue = card(admin, "Emettre la facture d'un brouillon");
  const option = issue.locator("#invoice-draft option").filter({ hasText: pro.partnerName }).first();
  await expect(option).toHaveCount(1);
  await issue.locator("#invoice-draft").selectOption((await option.getAttribute("value")) as string);
  await issue.locator("#invoice-reason").fill("Facture mensuelle avant avoir de contestation (E2E 063)");
  await issue.getByRole("button", { name: "Emettre la facture" }).click();
  await expect(admin.getByText("Facture numerotee emise, PDF archive et courtier notifie.")).toBeVisible();
  const row = card(admin, "Factures B2B numerotees").getByRole("row").filter({ hasText: pro.partnerName }).first();
  const invoiceNumber = ((await row.innerText()).match(/CI-\d{4}-\d{6}/u) ?? [])[0] as string;
  expect(invoiceNumber, "numbered invoice of the Pro firm").toBeTruthy();
  pro.data.invoiceNumber = invoiceNumber;
  saveWorld(firms().pro, pro);
  await admin.context().close();
});

test("DSP-04 la finance lit la liste et le détail, refuse un motif trop court, REJETTE un lead puis ACCEPTE les deux autres (brouillon, avoir partiel)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const starter = requireWorldOf(firms().starter);
  const pro = requireWorldOf(firms().pro);
  const s = leadIds(starter);
  const p = leadIds(pro);
  // From here the disputes of these firms are consumed: a re-run of the file builds fresh firms (DSP-00).
  for (const [key, world] of [[firms().starter, starter], [firms().pro, pro]] as const) {
    world.data.started = "1";
    saveWorld(key, world);
  }
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/billing?tab=contestations");

  // List: the three opened disputes, with firm, reason and status; no visitor data.
  const list = card(admin, "Contestations de leads");
  for (const [reference, partnerName] of [[s.refA, starter.partnerName], [s.refB, starter.partnerName], [p.refA, pro.partnerName]]) {
    const row = list.getByRole("row").filter({ hasText: reference as string }).filter({ hasText: partnerName as string });
    await expect(row).toContainText("Ouverte");
    await expect(row).toContainText("En attente");
  }
  await openDisputeDetail(admin, s.refA, starter.partnerName);
  const detail = disputeDetailCard(admin, s.refA);
  await expect(detail).toContainText("Portail Starter");
  await expect(detail).toContainText("Qualité du lead insuffisante");
  await expect(detail).toContainText("Coordonnées incohérentes (E2E 063)");
  const detailUrl = admin.url();

  // A too-short reason is refused (browser validation or "Décision incomplète"): the dispute stays opened.
  await detail.getByRole("button", { name: "Statuer sur la contestation" }).click();
  const dialog = admin.locator("dialog[open]");
  await dialog.getByRole("radio", { name: /Rejeter la contestation/u }).check({ force: true });
  await dialog.getByLabel("Motif de la décision").fill("court");
  await dialog.getByRole("button", { name: "Enregistrer la décision" }).last().click();
  await admin.waitForTimeout(1_500);
  expect(admin.url(), "no decision was recorded").not.toMatch(/billing=dispute_(rejected|accepted)/u);
  await admin.goto(detailUrl);
  await expect(disputeDetailCard(admin, s.refA)).toContainText("Ouverte");

  // REJECT Starter lead A.
  await decideDispute(admin, s.refA, "reject", REJECT_REASON);
  await expect(admin.getByText("Contestation rejetée et auditée")).toBeVisible();
  const rejected = disputeDetailCard(admin, s.refA);
  await expect(rejected).toContainText("Rejetée");
  await expect(rejected).toContainText(REJECT_REASON);
  await expect(rejected).toContainText(/Le rejet est définitif/u);
  await expect(rejected.getByRole("button", { name: "Statuer sur la contestation" })).toHaveCount(0);

  // ACCEPT Starter lead B: the month is not invoiced -> credited on the draft.
  await openDisputeDetail(admin, s.refB, starter.partnerName);
  await decideDispute(admin, s.refB, "accept", ACCEPT_REASON);
  await expect(admin.getByText("Contestation acceptée et auditée")).toBeVisible();
  await expect(disputeDetailCard(admin, s.refB)).toContainText("Crédité sur le prochain brouillon");
  await admin.goto(`${e2eEnv.adminUrl}/billing?tab=brouillons`);
  const draftTable = card(admin, "Brouillons mensuels non facturables").getByRole("table");
  const columns = await draftTable.getByRole("columnheader").allInnerTexts();
  const creditedColumn = columns.findIndex((header) => /Contestations creditees/iu.test(header));
  expect(creditedColumn, "column of credited disputes").toBeGreaterThanOrEqual(0);
  const draftCells = await draftTable.getByRole("row").filter({ hasText: starter.partnerName }).first().getByRole("cell").allInnerTexts();
  expect(draftCells[creditedColumn]?.trim(), "the refreshed draft credits the accepted dispute").toBe("1");

  // ACCEPT Pro lead A: the month is invoiced -> automatic partial credit note.
  await openDisputeDetail(admin, p.refA, pro.partnerName);
  await decideDispute(admin, p.refA, "accept", ACCEPT_REASON);
  const accepted = disputeDetailCard(admin, p.refA);
  await expect(accepted).toContainText("Acceptée");
  await expect(accepted).toContainText("Origine");
  await expect(accepted).toContainText(CREDIT_NOTE_NUMBER);
  const creditNote = ((await accepted.innerText()).match(CREDIT_NOTE_NUMBER) ?? [])[0] as string;
  pro.data.creditNote = creditNote;
  saveWorld(firms().pro, pro);
  await expect(accepted.getByRole("link", { name: "Télécharger le PDF de l'avoir" })).toBeVisible();

  // The credit note is part of the firm's account statement seen by finance.
  await admin.goto(`${e2eEnv.adminUrl}/billing?tab=comptes&partner=${pro.partnerId}`);
  await expect(admin.getByText(creditNote).first()).toBeVisible();
  await admin.context().close();
});

test("DSP-05 les courtiers voient statut, motif de décision et crédit, la notification in-app et un e-mail pointeur ; la décision rejouée est idempotente", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const starter = requireWorldOf(firms().starter);
  const pro = requireWorldOf(firms().pro);
  const s = leadIds(starter);
  const p = leadIds(pro);
  const creditNote = pro.data.creditNote;
  expect(creditNote, "credit note recorded by DSP-04").toMatch(CREDIT_NOTE_NUMBER);
  const broker = await brokerPage(browser);

  // Starter: lead page and /billing "Contestations".
  await openAs(broker, starter.owner, `/leads/${s.a}`);
  const rejected = card(broker, "Contestation de ce lead");
  await expect(rejected).toContainText("Rejetée");
  await expect(rejected).toContainText(REJECT_REASON);
  await expect(rejected).toContainText(/le lead reste facturable/u);
  await broker.goto(`${e2eEnv.brokerUrl}/leads/${s.b}`);
  const draftCredit = card(broker, "Contestation de ce lead");
  await expect(draftCredit).toContainText("Acceptée");
  await expect(draftCredit).toContainText(ACCEPT_REASON);
  await expect(draftCredit).toContainText("Crédité sur le prochain brouillon de facture");

  await broker.goto(`${e2eEnv.brokerUrl}/billing`);
  const disputes = card(broker, "Contestations");
  await expect(disputes.getByRole("row").filter({ hasText: s.refA })).toContainText("Rejetée");
  await expect(disputes.getByRole("row").filter({ hasText: s.refA })).toContainText(REJECT_REASON);
  await expect(disputes.getByRole("row").filter({ hasText: s.refB })).toContainText("Acceptée");
  await expect(disputes.getByRole("row").filter({ hasText: s.refB })).toContainText("Crédité sur le prochain brouillon");

  // In-app notification (both decisions) without lead content.
  await broker.goto(`${e2eEnv.brokerUrl}/notifications`);
  await expect(broker.getByText("Décision sur votre contestation").first()).toBeVisible();
  await expect(broker.getByText("Facturation > Contestations").first()).toBeVisible();
  await expect(broker.getByText(s.refA)).toHaveCount(0);

  // Pointer e-mails: one per decision, no lead content, no reason.
  for (const [firm, expected, leadRefs] of [[starter, 2, [s.refA, s.refB]], [pro, 1, [p.refA]]] as const) {
    await expect
      .poll(async () => (await searchMessages(`to:"${firm.owner.email}"`)).filter((mail) => DECISION_MAIL.test(mail.Subject)).length, { timeout: 120_000, intervals: [2_000, 3_000] })
      .toBe(expected);
    for (const summary of (await searchMessages(`to:"${firm.owner.email}"`)).filter((mail) => DECISION_MAIL.test(mail.Subject))) {
      const mail = await readMessage(summary.ID);
      const content = `${mail.Subject}\n${mail.Text}\n${mail.HTML}`;
      expect(content).toMatch(/Facturation\s*(>|&gt;)\s*Contestations/u);
      for (const secret of [...leadRefs, REJECT_REASON, ACCEPT_REASON, "Mariam", "visitor.e2e.test", "Qualité du lead"]) {
        expect(content, `the pointer e-mail must not carry "${secret}"`).not.toContain(secret);
      }
    }
  }

  // Pro: status, credit note and account statement.
  // A Starter session stays logged in on /crm/* (spec 066 F4 redirects to the dashboard), so the Pro owner gets a fresh context.
  await broker.context().close();
  const proPage = await brokerPage(browser);
  await openAs(proPage, pro.owner, `/crm/leads/${p.a}`);
  const proStatus = card(proPage, "Contestation de ce lead");
  await expect(proStatus).toContainText("Acceptée");
  await expect(proStatus).toContainText(ACCEPT_REASON);
  await expect(proStatus).toContainText(`Avoir partiel émis ${creditNote}`);
  await expect(proStatus.getByRole("link", { name: "Télécharger l'avoir (PDF)" })).toBeVisible();
  await proPage.goto(`${e2eEnv.brokerUrl}/billing`);
  await expect(card(proPage, "Contestations").getByRole("row").filter({ hasText: p.refA })).toContainText(`Avoir partiel émis`);
  await expect(card(proPage, "Releve de compte")).toContainText(`Avoir ${creditNote} (contestation, facture ${pro.data.invoiceNumber})`);
  await expect(card(proPage, "Releve de compte")).not.toContainText(/Avoir CI-AV-\d{4}-\d{5,} \(annule/u);
  await proPage.context().close();

  // Idempotence (finance token): same decision -> same credit note; the other decision -> 409; no second note.
  const admin = await adminPage(browser);
  await openAs(admin, superAdminAccount(), "/billing?tab=contestations");
  const token = await sessionToken(admin, "admin");
  const found = itemsOf(await apiCall(token, "GET", `/admin/billing/disputes?partnerId=${pro.partnerId}`));
  const dispute = found.find((item) => item.leadAssignmentId === p.a);
  expect(dispute, "the Pro dispute is listed for finance").toBeDefined();
  const id = String(dispute?.id);
  const replay = await apiCall(token, "POST", `/admin/billing/disputes/${id}/decision`, { decision: "accept", reason: ACCEPT_REASON });
  expect([200, 201], `replay of the same decision: ${replay.text}`).toContain(replay.status);
  expect(asRecord(replay.body).creditNoteNumber).toBe(creditNote);
  const other = await apiCall(token, "POST", `/admin/billing/disputes/${id}/decision`, { decision: "reject", reason: "Décision contraire rejouée (E2E 063)" });
  expect(other.status).toBe(409);
  expect(other.text).toContain("DISPUTE_ALREADY_DECIDED");

  const proBroker = await brokerPage(browser);
  await openAs(proBroker, pro.owner, "/billing");
  const statement = await card(proBroker, "Releve de compte").innerText();
  expect(new Set(statement.match(/CI-AV-\d{4}-\d{5,}/gu) ?? []).size, "exactly one credit note after the replay").toBe(1);
  await proBroker.context().close();
  await admin.context().close();
});
