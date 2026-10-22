import { expect, test, type Locator, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { requireWorld, saveWorld, type BrokerWorld } from "./support/journey-state";
import { apiCall, asRecord, closeSessions, itemsOf, tokenFor, visit } from "./support/pro-roles";
import { card, rowWith } from "./support/ui";
import { appPage, inviteMember, superAdminAccount } from "./support/world";

// Lot 11b (spec 071 / lot 5, G-06 and add-ons) - plan change requests and add-ons, end to end:
//   - the cabinet owner creates and cancels a plan change request; a manager or an agent is refused (API) and
//     does not see the section; invalid requests (same plan, short justification, second pending) are refused;
//   - on the admin side (Finance / Super Admin) a request is refused with a reason, another one is accepted:
//     the broker sees the decision, the effect starts the first day of the next monthly cycle and the access
//     plan of the cabinet does not change (billing effect only, no online payment);
//   - add-ons are disabled by default: no price, no assignment, an assignment without an enabled price is refused.
// Runs on the "pro" world built by pro-01-setup; it invites a manager into that world (key "manager").

test.describe.configure({ mode: "serial" });

const REQUEST_PATH = "/broker/billing/plan-change-requests";
const JUSTIFICATION = "Nous ouvrons deux agences supplémentaires à Abidjan (E2E lot 5)";
const REFUSAL_REASON = "Dossier incomplet, merci de compléter la fiche cabinet (E2E)";
const ACCEPT_REASON = "Dossier complet, passage accepté pour le prochain cycle (E2E)";

let world: BrokerWorld;
let manager: BackOfficeAccount;
let agent: BackOfficeAccount;
let ownerToken = "";

test.beforeAll(() => {
  world = requireWorld("pro");
  agent = world.members.agent as BackOfficeAccount;
});

test.afterAll(async () => {
  await closeSessions();
});

function planChangeCard(page: Page): Locator {
  return card(page, "Changer de plan");
}

async function submitRequest(page: Page, plan: string, justification: string): Promise<void> {
  const form = planChangeCard(page).locator("form[data-billing-form='plan-change']");
  await form.locator("select[name='requestedPlan']").selectOption(plan);
  await form.locator("textarea[name='justification']").fill(justification);
  await form.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
}

function historyRow(page: Page, ...cells: Array<string | RegExp>): Locator {
  return rowWith(page.getByRole("table", { name: "Historique des demandes de changement de plan" }), ...cells);
}

/** Admin inbox row of a request of the world's cabinet (Finance / Super Admin, tab "modules" of /billing). */
function adminRow(admin: Page, status: string): Locator {
  return admin.getByRole("row").filter({ hasText: world.partnerName }).filter({ hasText: status }).first();
}

async function ownRequests(token: string): Promise<Array<Record<string, unknown>>> {
  const result = await apiCall(token, "GET", REQUEST_PATH);
  expect(result.status).toBe(200);
  return itemsOf(result);
}

test("PLAN-00 prérequis : un manager est invité dans l'équipe du cabinet Pro (idempotent)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  if (!world.members.manager) {
    world.members.manager = await inviteMember(browser, world.owner, { key: "manager", displayName: "Moussa Manager", emailDomain: "broker-pro.e2e.test" });
    saveWorld("pro", world);
  }
  manager = world.members.manager as BackOfficeAccount;
  ownerToken = await tokenFor(browser, world.owner);
  expect(await ownRequests(ownerToken), "no request yet for this cabinet").toEqual([]);
});

test("PLAN-01 le propriétaire demande un changement de plan puis l'annule", async ({ browser }) => {
  const page = await visit(browser, world.owner, "/billing");
  const section = planChangeCard(page);
  await expect(section).toBeVisible();
  await expect(section).toContainText("Plan actuel : Pro");
  await expect(section).toContainText("Aucun paiement en ligne");

  // The current plan is not offered as a target.
  const options = await section.locator("select[name='requestedPlan'] option").allInnerTexts();
  expect(options.map((text) => text.trim())).toEqual(expect.arrayContaining(["Starter", "Enterprise"]));
  expect(options.map((text) => text.trim())).not.toContain("Pro");

  await submitRequest(page, "enterprise", JUSTIFICATION);
  await expect(historyRow(page, "Pro vers Enterprise", "En attente")).toBeVisible();
  await expect(planChangeCard(page)).toContainText("Une demande est déjà en attente");
  await expect(planChangeCard(page).locator("select[name='requestedPlan']")).toBeDisabled();

  await test.step("règles métier côté API : plan identique, justification courte, deuxième demande en attente", async () => {
    const same = await apiCall(ownerToken, "POST", REQUEST_PATH, { requestedPlan: "pro", justification: JUSTIFICATION });
    expect(same.status, "same plan").toBe(409);
    const short = await apiCall(ownerToken, "POST", REQUEST_PATH, { requestedPlan: "enterprise", justification: "court" });
    expect(short.status, "justification too short").toBe(400);
    const second = await apiCall(ownerToken, "POST", REQUEST_PATH, { requestedPlan: "starter", justification: JUSTIFICATION });
    expect(second.status, "a second pending request").toBe(409);
    expect((await ownRequests(ownerToken)).filter((request) => request.status === "pending")).toHaveLength(1);
  });

  await planChangeCard(page).getByRole("button", { name: "Annuler la demande" }).click();
  await expect(page.getByText("Demande annulée.")).toBeVisible();
  await expect(historyRow(page, "Pro vers Enterprise", "Annulée")).toBeVisible();
  await expect(planChangeCard(page).locator("select[name='requestedPlan']")).toBeEnabled();
  expect((await ownRequests(ownerToken)).map((request) => request.status)).toEqual(["cancelled"]);
});

test("PLAN-02 un manager ou un agent ne peut ni demander ni voir la demande de changement de plan", async ({ browser }) => {
  const before = await ownRequests(ownerToken);
  for (const [label, account] of [["manager", manager], ["agent", agent]] as const) {
    const token = await tokenFor(browser, account);
    const create = await apiCall(token, "POST", REQUEST_PATH, { requestedPlan: "enterprise", justification: JUSTIFICATION });
    expect(create.status, `${label} creates a request`).toBe(403);
    // Cancelling the owner's request (even a closed one) is refused too.
    const cancel = await apiCall(token, "POST", `${REQUEST_PATH}/${String(before[0]?.id)}/cancel`, {});
    expect([403, 404], `${label} cancels a request`).toContain(cancel.status);
    const page = await visit(browser, account, "/billing");
    await expect(page.getByText("Changer de plan"), `${label} sees no plan change section`).toHaveCount(0);
  }
  expect(await ownRequests(ownerToken), "nothing created or modified by the team").toEqual(before);
});

test("PLAN-03 l'admin refuse une demande avec un motif : le courtier voit la décision, le plan d'accès ne change pas", async ({ browser }) => {
  const broker = await visit(browser, world.owner, "/billing");
  await submitRequest(broker, "enterprise", JUSTIFICATION);

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/billing?tab=modules");
  await expect(card(admin, "Demandes de changement de plan")).toBeVisible();
  const pending = adminRow(admin, "En attente");
  await expect(pending).toContainText("Pro vers Enterprise");
  await expect(pending).toContainText(JUSTIFICATION);
  // The reason is mandatory (HTML validation blocks an empty submission).
  await pending.getByRole("button", { name: "Refuser" }).click();
  await expect(adminRow(admin, "En attente"), "no decision without a reason").toBeVisible();
  await pending.getByLabel(/Motif de la décision/u).fill(REFUSAL_REASON);
  await pending.getByRole("button", { name: "Refuser" }).click();
  await expect(adminRow(admin, "Refusée")).toContainText(REFUSAL_REASON);
  await admin.context().close();

  await broker.goto("/billing");
  await expect(historyRow(broker, "Pro vers Enterprise", "Refusée")).toContainText(REFUSAL_REASON);
  const requests = await ownRequests(ownerToken);
  expect(requests.map((request) => request.status).sort()).toEqual(["cancelled", "refused"]);
  const dashboard = await apiCall(ownerToken, "GET", "/broker/dashboard");
  expect(asRecord(dashboard.body).plan, "access plan unchanged by a refusal").toBe("pro");
});

test("PLAN-04 l'admin accepte une demande : effet au prochain cycle mensuel, aucun changement d'accès ni paiement", async ({ browser }) => {
  const broker = await visit(browser, world.owner, "/billing");
  await submitRequest(broker, "enterprise", JUSTIFICATION);

  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/billing?tab=modules");
  const pending = adminRow(admin, "En attente");
  await pending.getByLabel(/Motif de la décision/u).fill(ACCEPT_REASON);
  await pending.getByRole("button", { name: "Accepter" }).click();
  const accepted = adminRow(admin, "Acceptée");
  await expect(accepted).toContainText(ACCEPT_REASON);
  await expect(accepted).toContainText("prochain cycle");
  // The inbox can be filtered on a status (query string).
  await admin.goto("/billing?tab=modules&planStatus=refused");
  await expect(adminRow(admin, "Refusée")).toBeVisible();
  await expect(adminRow(admin, "Acceptée")).toHaveCount(0);
  await admin.context().close();

  await broker.goto("/billing");
  await expect(historyRow(broker, "Pro vers Enterprise", "Acceptée")).toContainText(ACCEPT_REASON);

  const latest = (await ownRequests(ownerToken)).find((request) => request.status === "accepted");
  expect(latest, "an accepted request").toBeDefined();
  const now = new Date();
  const nextCycle = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  expect(new Date(String(latest?.effectiveAt)).toISOString(), "effective the first day of the next monthly cycle").toBe(nextCycle);

  // Billing effect only: the access plan, the roles and the CRM rights of the cabinet are untouched.
  const dashboard = await apiCall(ownerToken, "GET", "/broker/dashboard");
  expect(asRecord(dashboard.body).plan).toBe("pro");
  const agencies = await apiCall(ownerToken, "GET", "/broker/dashboard/agencies");
  expect(agencies.status, "no Enterprise feature before the effective date").toBe(403);
  // The accepted request is closed: it can be neither cancelled nor decided again.
  const cancel = await apiCall(ownerToken, "POST", `${REQUEST_PATH}/${String(latest?.id)}/cancel`, {});
  expect(cancel.status).toBe(409);
});

test("PLAN-05 les modules complémentaires sont désactivés par défaut et ne s'affectent pas sans prix activé", async ({ browser }) => {
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/billing?tab=modules");

  const prices = card(admin, "Prix des modules complémentaires");
  await expect(prices).toContainText("Tous les modules sont désactivés par défaut");
  // Nothing is offered until finance records and enables a price.
  await expect(prices.getByText("Activé", { exact: true })).toHaveCount(0);
  const priceForm = card(admin, "Enregistrer le prix d'un module");
  await expect(priceForm.getByLabel("Activé")).not.toBeChecked();

  // An assignment without an enabled price is refused and creates nothing.
  const assign = card(admin, "Affecter un module à un courtier");
  await assign.getByLabel("Courtier").selectOption({ label: world.partnerName });
  await assign.getByLabel("Type de module").selectOption("api");
  await assign.getByLabel(/Motif/u).fill("Affectation sans prix activé (E2E lot 5)");
  await assign.getByRole("button", { name: "Affecter le module" }).click();
  const refusal = assign.locator(".bo-notice[data-tone='danger']").first();
  await expect(refusal).toBeVisible();
  const assigned = card(admin, "Modules affectés aux courtiers");
  await expect(assigned).not.toContainText(world.partnerName);
  await admin.context().close();

  // Broker side: no add-on line on any statement.
  const broker = await visit(browser, world.owner, "/billing");
  await expect(broker.getByText("Module complémentaire")).toHaveCount(0);
});
