import { expect, test, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { loadJourneyState, requireState, requireWorld, type BrokerWorld } from "./support/journey-state";
import {
  apiCall,
  asRecord,
  assignmentIds,
  closeSessions,
  idOf,
  itemsOf,
  leadFootprint,
  referenceOf,
  tokenFor,
  visit
} from "./support/pro-roles";

// Spec 065 - PRO-ROLES: role-based access of the Pro CRM (PRD 32.1 / 32.2).
// Matrix under test (apps/broker/app/lib/broker-permissions.ts, backend BrokerCrmAccessPolicy):
//   - broker_agent sees and updates only the leads assigned to them, cannot assign;
//   - broker_read_only reads the whole CRM and writes nothing (screen and API);
//   - a Starter owner has no CRM at all (screen, navigation and API);
//   - the Pro owner sees every lead and holds every write control.
// The journey never changes a lead status: the only write is the assignment of lead2 to the agent,
// done only when it is not already the case (pro-02-crm may have done it).

test.describe.configure({ mode: "serial" });

// Loaded in beforeAll so that listing the tests never needs the world built by pro-01-setup.
let world: BrokerWorld;
let agent: BackOfficeAccount;
let readOnly: BackOfficeAccount;
let refs: { lead1: string; lead2: string; lead3: string; lead4: string };
let lead4Email = "";

let ids: Record<string, string> = {};
let agentActorId = "";

test.beforeAll(() => {
  world = requireWorld("pro");
  agent = world.members.agent as BackOfficeAccount;
  readOnly = world.members.readOnly as BackOfficeAccount;
  refs = { lead1: world.data.lead1Ref as string, lead2: world.data.lead2Ref as string, lead3: world.data.lead3Ref as string, lead4: world.data.lead4Ref as string };
  lead4Email = world.data.lead4Email as string;
});

test.afterAll(async () => {
  await closeSessions();
});

/** Waits for the lead list table and returns the references it shows. */
async function listedReferences(page: Page): Promise<string[]> {
  const table = page.getByRole("table", { name: "Leads CRM" });
  await expect(table).toBeVisible();
  const text = await table.innerText();
  return Object.values(refs).filter((reference) => text.includes(reference));
}

const WRITE_CONTROLS = {
  status: "Enregistrer le statut",
  assign: "Assigner au conseiller",
  note: "Ajouter une note",
  task: "Ajouter une tache",
  reminder: "Ajouter un rappel",
  document: "Televerser le document interne",
  proposal: "Envoyer la proposition au visiteur"
} as const;

test("PRO-ROLES-00 les comptes de l'équipe existent et le lead 2 est assigné à l'agent (idempotent)", async ({ browser }) => {
  expect(agent, "pro world: agent account").toBeDefined();
  expect(readOnly, "pro world: read-only account").toBeDefined();
  expect(refs.lead4, "pro world: four leads created by pro-01-setup").toBeTruthy();

  // The agent's user id is what the assignment form expects ("Identifiant du conseiller").
  const agentToken = await tokenFor(browser, agent);
  const me = await apiCall(agentToken, "GET", "/auth/me");
  expect(me.status).toBe(200);
  agentActorId = String(asRecord(me.body).actorId ?? "");
  expect(agentActorId, "agent actor id from /auth/me").not.toBe("");
  expect(asRecord(me.body).roles).toEqual(expect.arrayContaining(["broker_agent"]));

  const ownerToken = await tokenFor(browser, world.owner);
  ids = await assignmentIds(ownerToken, refs);
  const before = await leadFootprint(ownerToken, ids.lead2 as string);
  if (before.advisorId === agentActorId) return; // already assigned (pro-02-crm or an earlier run)

  const owner = await visit(browser, world.owner, `/crm/leads/${ids.lead2}`);
  const assign = owner.locator("form").filter({ has: owner.locator("#crm-advisor-id") });
  await assign.locator("#crm-advisor-id").fill(agentActorId);
  await assign.getByRole("button", { name: WRITE_CONTROLS.assign }).click();
  await expect(owner.getByText("Lead assigne au conseiller.")).toBeVisible();
  expect((await leadFootprint(ownerToken, ids.lead2 as string)).advisorId).toBe(agentActorId);
});

test("PRO-ROLES-01 l'agent ne voit et ne modifie que ses leads assignés", async ({ browser }) => {
  const agentAccount = agent;

  await test.step("la liste CRM ne montre que le lead assigné", async () => {
    const page = await visit(browser, agentAccount, "/crm/leads");
    await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
    expect(await listedReferences(page)).toEqual([refs.lead2]);
    await expect(page.getByRole("table", { name: "Leads CRM" })).not.toContainText(lead4Email);
  });

  await test.step("le Kanban non plus ne montre que le lead assigné", async () => {
    const page = await visit(browser, agentAccount, "/crm/kanban");
    await expect(page.getByLabel("Colonnes du pipeline CRM")).toContainText(refs.lead2);
    for (const reference of [refs.lead1, refs.lead3, refs.lead4]) {
      await expect(page.getByLabel("Colonnes du pipeline CRM")).not.toContainText(reference);
    }
  });

  await test.step("la fiche d'un lead non assigné est refusée sans fuite de données", async () => {
    const page = await visit(browser, agentAccount, `/crm/leads/${ids.lead4}`);
    await expect(page.getByText(/Acces refuse|Lead introuvable/u).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(refs.lead4);
    expect(body).not.toContain(lead4Email);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.status })).toHaveCount(0);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.assign })).toHaveCount(0);
  });

  await test.step("la fiche du lead assigné offre statut, note, tâche, rappel mais pas l'assignation", async () => {
    const page = await visit(browser, agentAccount, `/crm/leads/${ids.lead2}`);
    await expect(page.getByText("CRM autorise")).toBeVisible();
    await expect(page.locator("#crm-new-status")).toBeEnabled();
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.status })).toBeEnabled();
    // canAssignCrmLead is false for an agent: the card explains it and offers no form.
    await expect(page.getByText("Votre role ne permet pas d'assigner ce lead.")).toBeVisible();
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.assign })).toHaveCount(0);
    await expect(page.locator("#crm-advisor-id")).toHaveCount(0);

    await page.goto(`/crm/leads/${ids.lead2}?tab=activite`);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.note })).toBeEnabled();
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.task })).toBeEnabled();
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.reminder })).toBeEnabled();
  });

  await test.step("l'API refuse à l'agent le lead d'un autre conseiller (aucune donnée, aucune écriture)", async () => {
    const ownerToken = await tokenFor(browser, world.owner);
    const before = await leadFootprint(ownerToken, ids.lead4 as string);
    const token = await tokenFor(browser, agentAccount);

    const list = await apiCall(token, "GET", "/broker/crm/leads");
    expect(list.status).toBe(200);
    expect(itemsOf(list).map(referenceOf)).toEqual([refs.lead2]);
    expect(list.text).not.toContain(lead4Email);

    for (const path of [`/broker/crm/leads/${ids.lead4}`, `/broker/crm/leads/${ids.lead4}/ai`, `/broker/crm/leads/${ids.lead4}/proposals`]) {
      const read = await apiCall(token, "GET", path);
      expect([403, 404], `GET ${path} as the agent`).toContain(read.status);
      expect(read.text).not.toContain(refs.lead4);
      expect(read.text).not.toContain(lead4Email);
    }

    const writes: Array<[string, Record<string, unknown>]> = [
      [`/broker/crm/leads/${ids.lead4}/notes`, { body: "Note interdite de l'agent (E2E)" }],
      [`/broker/crm/leads/${ids.lead4}/tasks`, { title: "Tâche interdite de l'agent (E2E)" }],
      [`/broker/crm/leads/${ids.lead4}/reminders`, { remindAt: new Date(Date.now() + 86_400_000).toISOString() }],
      [`/broker/crm/leads/${ids.lead4}/status`, { status: "contacte" }],
      [`/broker/crm/leads/${ids.lead4}/assign`, { advisorId: agentActorId, advisorPartnerTenantId: world.partnerId }]
    ];
    for (const [path, data] of writes) {
      const write = await apiCall(token, "POST", path, data);
      expect([403, 404], `POST ${path} as the agent`).toContain(write.status);
    }

    // An agent holds no export permission at all.
    expect((await apiCall(token, "GET", "/broker/crm/leads/export.csv")).status).toBe(403);

    expect(await leadFootprint(ownerToken, ids.lead4 as string), "lead4 unchanged after the agent's attempts").toEqual(before);
  });
});

test("PRO-ROLES-02 le lecteur seul consulte tout le CRM mais ne peut rien écrire", async ({ browser }) => {
  const readOnlyAccount = readOnly;

  await test.step("la liste montre les quatre leads", async () => {
    const page = await visit(browser, readOnlyAccount, "/crm/leads");
    expect((await listedReferences(page)).sort()).toEqual(Object.values(refs).sort());
  });

  await test.step("la fiche est lisible, sans aucun contrôle d'écriture", async () => {
    const page = await visit(browser, readOnlyAccount, `/crm/leads/${ids.lead4}`);
    await expect(page.getByRole("heading", { name: refs.lead4 })).toBeVisible();
    await expect(page.getByText("Lecture seule").first()).toBeVisible();
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.status })).toHaveCount(0);
    await expect(page.locator("#crm-new-status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.assign })).toHaveCount(0);
    await expect(page.getByText("Votre role ne permet pas d'assigner ce lead.")).toBeVisible();

    await page.goto(`/crm/leads/${ids.lead4}?tab=activite`);
    await expect(page.getByRole("heading", { name: "Notes internes" })).toBeVisible();
    for (const control of [WRITE_CONTROLS.note, WRITE_CONTROLS.task, WRITE_CONTROLS.reminder]) {
      await expect(page.getByRole("button", { name: control })).toHaveCount(0);
    }

    await page.goto(`/crm/leads/${ids.lead4}?tab=propositions`);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.proposal })).toHaveCount(0);

    await page.goto(`/crm/leads/${ids.lead4}?tab=historique`);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.document })).toHaveCount(0);
  });

  await test.step("l'API refuse chaque écriture du lecteur seul (403) et rien ne change", async () => {
    const ownerToken = await tokenFor(browser, world.owner);
    const before = await leadFootprint(ownerToken, ids.lead4 as string);
    const token = await tokenFor(browser, readOnlyAccount);

    const read = await apiCall(token, "GET", `/broker/crm/leads/${ids.lead4}`);
    expect(read.status, "the read-only role may read").toBe(200);
    expect(itemsOf(await apiCall(token, "GET", "/broker/crm/leads")).length).toBeGreaterThanOrEqual(4);

    const writes: Array<[string, Record<string, unknown>]> = [
      [`/broker/crm/leads/${ids.lead4}/notes`, { body: "Note interdite du lecteur seul (E2E)" }],
      [`/broker/crm/leads/${ids.lead4}/tasks`, { title: "Tâche interdite du lecteur seul (E2E)" }],
      [`/broker/crm/leads/${ids.lead4}/reminders`, { remindAt: new Date(Date.now() + 86_400_000).toISOString() }],
      [`/broker/crm/leads/${ids.lead4}/status`, { status: "contacte" }],
      [`/broker/crm/leads/${ids.lead4}/assign`, { advisorId: agentActorId, advisorPartnerTenantId: world.partnerId }]
    ];
    for (const [path, data] of writes) {
      const write = await apiCall(token, "POST", path, data);
      expect(write.status, `POST ${path} as read-only`).toBe(403);
    }
    expect((await apiCall(token, "GET", "/broker/crm/leads/export.csv")).status, "no export for read-only").toBe(403);

    expect(await leadFootprint(ownerToken, ids.lead4 as string), "lead4 unchanged after the read-only attempts").toEqual(before);
  });
});

test("PRO-ROLES-03 le propriétaire Starter n'a aucun accès au CRM complet", async ({ browser }) => {
  const state = loadJourneyState();
  const starter = requireState(state, "brokerOwner");

  await test.step("le tableau de bord CRM annonce l'indisponibilité du module", async () => {
    const page = await visit(browser, starter, "/crm");
    await expect(page.getByRole("heading", { name: "CRM complet indisponible" })).toBeVisible();
    await expect(page.getByText("Le CRM complet est disponible avec le plan Pro.").first()).toBeVisible();
    await expect(page.getByText("Module indisponible").first()).toBeVisible();
  });

  await test.step("le Kanban, la liste et la fiche CRM sont refusés", async () => {
    // Spec 066 F4: the broker middleware keeps the Starter session and sends every /crm/* page (except
    // the /crm dashboard) to the broker dashboard with an explanatory notice.
    const page = await visit(browser, starter, "/crm/kanban");
    for (const path of ["/crm/kanban", "/crm/leads", `/crm/leads/${requireState(state, "leadAssignmentId")}`]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/\?notice=crm_requires_pro$/u);
      await expect(page.getByText("Le CRM est réservé aux formules Pro et Enterprise.")).toBeVisible();
    }
    await expect(page.getByLabel("Colonnes du pipeline CRM")).toHaveCount(0);
    await expect(page.getByRole("button", { name: WRITE_CONTROLS.status })).toHaveCount(0);
  });

  await test.step("la navigation ne propose pas l'entrée CRM (désactivée, badge Pro)", async () => {
    const page = await visit(browser, starter, "/leads");
    const nav = page.getByRole("navigation", { name: "Navigation courtier principale" });
    await expect(nav.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
    for (const href of ["/crm", "/crm/leads", "/crm/kanban"]) {
      await expect(nav.locator(`a[href='${href}']`), `link ${href}`).toHaveCount(0);
    }
    await expect(nav.locator("[aria-disabled='true']").filter({ hasText: "Pipeline" })).toHaveCount(1);
    await expect(nav.locator("[aria-disabled='true']").filter({ hasText: "Vue Kanban" })).toHaveCount(1);
  });

  await test.step("les leads Starter restent utilisables en lecture", async () => {
    const page = await visit(browser, starter, "/leads");
    await expect(page.getByRole("heading", { name: "Leads assignes" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: requireState(state, "quoteReference") }).first()).toBeVisible();
  });

  await test.step("l'API CRM refuse le Starter (403, aucune donnée, aucune écriture)", async () => {
    const token = await tokenFor(browser, starter);
    const leadId = requireState(state, "leadAssignmentId");
    for (const path of ["/broker/crm/leads", "/broker/crm/leads/kanban", "/broker/crm/dashboard", "/broker/crm/leads/export.csv", `/broker/crm/leads/${leadId}`, "/broker/crm/ai-assistance"]) {
      const read = await apiCall(token, "GET", path);
      expect(read.status, `GET ${path} as Starter`).toBe(403);
      expect(read.text).not.toContain(requireState(state, "quoteReference"));
    }
    const note = await apiCall(token, "POST", `/broker/crm/leads/${leadId}/notes`, { body: "Note CRM interdite au Starter (E2E)" });
    expect(note.status, "POST note as Starter").toBe(403);
    // The Starter API of the same owner keeps working.
    const starterLeads = await apiCall(token, "GET", "/broker/starter/leads");
    expect(starterLeads.status).toBe(200);
  });
});

test("PRO-ROLES-04 le propriétaire Pro voit les quatre leads et dispose de tous les contrôles", async ({ browser }) => {
  const page = await visit(browser, world.owner, "/crm/leads");
  expect((await listedReferences(page)).sort()).toEqual(Object.values(refs).sort());

  const nav = page.getByRole("navigation", { name: "Navigation courtier principale" });
  for (const href of ["/crm", "/crm/leads", "/crm/kanban"]) {
    await expect(nav.locator(`a[href='${href}']`), `link ${href}`).toBeVisible();
  }

  await page.goto(`/crm/leads/${ids.lead4}`);
  await expect(page.getByText("CRM autorise")).toBeVisible();
  await expect(page.getByRole("button", { name: WRITE_CONTROLS.status })).toBeEnabled();
  await expect(page.locator("#crm-advisor-id")).toBeEnabled();
  await expect(page.getByRole("button", { name: WRITE_CONTROLS.assign })).toBeEnabled();
  await page.goto(`/crm/leads/${ids.lead4}?tab=activite`);
  for (const control of [WRITE_CONTROLS.note, WRITE_CONTROLS.task, WRITE_CONTROLS.reminder]) {
    await expect(page.getByRole("button", { name: control })).toBeEnabled();
  }

  const token = await tokenFor(browser, world.owner);
  const list = await apiCall(token, "GET", "/broker/crm/leads");
  expect(itemsOf(list).map(idOf)).toEqual(expect.arrayContaining(Object.values(ids)));
  expect(itemsOf(list).map(referenceOf)).toEqual(expect.arrayContaining(Object.values(refs)));
});
