import { expect, test, type Page } from "@playwright/test";
import { setGlobalFlag } from "./support/admin";
import { openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadJourneyState, loadWorld, requireState, requireWorld, saveWorld, type BrokerWorld } from "./support/journey-state";
import {
  apiCall,
  asRecord,
  assignmentIds,
  closeSessions,
  itemsOf,
  leadFootprint,
  referenceOf,
  tokenFor,
  visit
} from "./support/pro-roles";
import { WORLD_REASON, appPage, provisionBroker, superAdminAccount } from "./support/world";

// Lot 11b (spec 069 / lot 3) - broker dashboard and CRM gaps, end to end on the real stack:
//   - PRD §20 KPI of the dashboard (conversion = won / received, contact, qualification, quotes sent, sources, cost);
//   - Kanban drag and drop (status change persisted, same history as the sheet form, reason for exit statuses);
//   - assignment to a team advisor picked by name (an advisor outside the cabinet is refused by the API);
//   - server-side filters, sort and pagination of the CRM list;
//   - the consolidated multi-agency view (Enterprise only) and the dashboard CSV export (no prospect identity);
//   - every AI flag stays closed: no AI panel, no priority column, no usable suggestion.
// Runs on the "pro" world built by pro-01-setup (four leads, an agent, a read-only member) and provisions
// its own Enterprise cabinet. It opens no feature flag except the (non AI) CRM module flag, like pro-01.
// The Kanban moves lead "nouveau" -> accepte -> contacte -> perdu: it runs after pro-02..04, which never rely on it.

test.describe.configure({ mode: "serial" });

const ENTERPRISE_KEY = "ent-lot11b";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;

let world: BrokerWorld;
let enterprise: BrokerWorld;
let agent: BackOfficeAccount;
let readOnly: BackOfficeAccount;
let refs: Record<string, string> = {};
let ids: Record<string, string> = {};
let ownerToken = "";
let agentActorId = "";
/** The lead moved by the Kanban test and assigned by the assignment test. */
let movedLeadKey = "";

test.beforeAll(() => {
  world = requireWorld("pro");
  agent = world.members.agent as BackOfficeAccount;
  readOnly = world.members.readOnly as BackOfficeAccount;
  refs = {
    lead1: world.data.lead1Ref as string,
    lead2: world.data.lead2Ref as string,
    lead3: world.data.lead3Ref as string,
    lead4: world.data.lead4Ref as string
  };
});

test.afterAll(async () => {
  await closeSessions();
});

const AI_PANEL_TEXTS = ["Résumé IA de performance", "Assistant manager", "Assistance IA - suggestion à valider", "Assistance IA du tableau de bord"];

async function expectNoAiPanel(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  for (const text of AI_PANEL_TEXTS) await expect(page.getByText(text, { exact: false }), `"${text}" is hidden`).toHaveCount(0);
  await expect(page.locator("section[aria-label='Assistance IA du tableau de bord']")).toHaveCount(0);
}

function column(page: Page, status: string) {
  return page.locator(`[data-kanban-column='${status}']`);
}

function kanbanCard(page: Page, leadId: string) {
  return page.locator(`[data-kanban-card='${leadId}']`);
}

async function accountActorId(browser: Parameters<typeof tokenFor>[0], account: BackOfficeAccount): Promise<string> {
  const me = await apiCall(await tokenFor(browser, account), "GET", "/auth/me");
  expect(me.status).toBe(200);
  const actorId = String(asRecord(me.body).actorId ?? "");
  expect(actorId, "actor id from /auth/me").toMatch(UUID);
  return actorId;
}

test("LOT3-00 prérequis : module CRM ouvert (idempotent), cabinet Enterprise dédié, identifiants des leads", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  await setGlobalFlag(admin, "broker_crm_enabled", true, WORLD_REASON);
  await admin.context().close();

  const existing = loadWorld(ENTERPRISE_KEY);
  enterprise = existing ?? (await provisionBroker(browser, { plan: "enterprise", label: "ent11b" }));
  if (!existing) saveWorld(ENTERPRISE_KEY, enterprise);

  ownerToken = await tokenFor(browser, world.owner);
  ids = await assignmentIds(ownerToken, refs);
  agentActorId = await accountActorId(browser, agent);
});

test("LOT3-01 le tableau de bord Pro affiche les KPI du PRD §20 et la conversion gagnés / reçus", async ({ browser }) => {
  const dashboard = await apiCall(ownerToken, "GET", "/broker/dashboard");
  expect(dashboard.status).toBe(200);
  const crm = asRecord(asRecord(dashboard.body).crm);
  expect(Object.keys(crm).length, "the crm section exists for a Pro cabinet").toBeGreaterThan(0);
  const kpis = asRecord(crm.kpis);
  for (const key of ["contactRate", "averageFirstContactMinutes", "qualificationRate", "quotesSent", "topSources"]) {
    expect(Object.keys(kpis), `kpis.${key}`).toContain(key);
  }
  expect(Array.isArray(kpis.topSources)).toBe(true);

  // Conversion = leads won / leads received (not accepted / received).
  const byProduct = (Array.isArray(crm.conversionByProduct) ? crm.conversionByProduct : []) as Array<Record<string, unknown>>;
  const received = byProduct.reduce((sum, row) => sum + Number(row.received ?? 0), 0);
  const won = byProduct.reduce((sum, row) => sum + Number(row.won ?? 0), 0);
  expect(received, "the four leads of the world are received").toBeGreaterThanOrEqual(4);
  const conversionRate = Number(crm.conversionRate);
  expect(conversionRate).toBeCloseTo(won / received, 2);

  const page = await visit(browser, world.owner, "/");
  const section = page.getByLabel("Indicateurs de performance commerciale");
  await expect(section).toBeVisible();
  for (const label of ["Gagnés / reçus", "Taux de contact", "Délai moyen de premier contact", "Taux de qualification", "Devis / propositions envoyés"]) {
    await expect(section, label).toContainText(label);
  }
  await expect(section).toContainText(new RegExp(`Gagnés / reçus[\\s\\S]*${Math.round(conversionRate * 100)} %`, "u"));

  // Cost per lead: an estimate, labelled as such, only when the billing tariff gives one.
  const leadCost = kpis.leadCost;
  if (leadCost) {
    await expect(section).toContainText("Coût par lead (estimation)");
    await expect(page.getByText("ce n'est pas une facture", { exact: false })).toBeVisible();
  } else {
    await expect(section).not.toContainText("Coût par lead");
  }

  // Performing sources come from the lead source (quote requests), never from marketing data.
  const sources = kpis.topSources as Array<Record<string, unknown>>;
  if (sources.length > 0) {
    await expect(page.getByRole("table", { name: "Sources performantes" })).toBeVisible();
    expect(sources.map((row) => row.source)).toContain("quote_request");
  }
});

test("LOT3-02 Kanban : glisser-déposer persistant, menu clavier, motif exigé pour une sortie, historique complet", async ({ browser }) => {
  // Pick a lead still in "nouveau" (pro-02 leaves lead4 untouched; fall back to any other untouched lead).
  for (const key of ["lead4", "lead3", "lead2", "lead1"]) {
    if ((await leadFootprint(ownerToken, ids[key] as string)).status === "nouveau") {
      movedLeadKey = key;
      break;
    }
  }
  expect(movedLeadKey, "a lead is still in the status nouveau").not.toBe("");
  const leadId = ids[movedLeadKey] as string;
  const before = await leadFootprint(ownerToken, leadId);

  const page = await visit(browser, world.owner, "/crm/kanban");
  await expect(page.getByLabel("Colonnes du pipeline CRM")).toBeVisible();
  await expect(column(page, "nouveau").locator(`[data-kanban-card='${leadId}']`)).toBeVisible();

  await test.step("glisser la carte de Nouveau vers Accepte", async () => {
    await kanbanCard(page, leadId).dragTo(column(page, "accepte"), { sourcePosition: { x: 4, y: 4 } });
    await expect(column(page, "accepte").locator(`[data-kanban-card='${leadId}']`)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Lead déplacé vers");
    await expect.poll(async () => (await leadFootprint(ownerToken, leadId)).status).toBe("accepte");
    // Persistent: a fresh page load still shows the card in the new column.
    await page.goto("/crm/kanban");
    await expect(column(page, "accepte").locator(`[data-kanban-card='${leadId}']`)).toBeVisible();
    await expect(column(page, "nouveau").locator(`[data-kanban-card='${leadId}']`)).toHaveCount(0);
  });

  await test.step("menu clavier « Déplacer vers » : Accepte vers Contacte", async () => {
    await page.locator(`#kanban-move-${leadId}`).selectOption("contacte");
    await kanbanCard(page, leadId).getByRole("button", { name: "Déplacer", exact: true }).click();
    await expect(column(page, "contacte").locator(`[data-kanban-card='${leadId}']`)).toBeVisible();
    await expect.poll(async () => (await leadFootprint(ownerToken, leadId)).status).toBe("contacte");
  });

  await test.step("une sortie (Perdu) exige un motif : rien n'est écrit avant la confirmation", async () => {
    await kanbanCard(page, leadId).dragTo(column(page, "perdu"), { sourcePosition: { x: 4, y: 4 } });
    const form = page.getByRole("group", { name: "Motif du changement de statut" });
    await expect(form).toBeVisible();
    await expect(form.getByRole("button", { name: "Confirmer le déplacement" })).toBeDisabled();
    expect((await leadFootprint(ownerToken, leadId)).status, "no write before the reason").toBe("contacte");
    await form.locator("#kanban-reason").selectOption("price");
    await form.getByRole("button", { name: "Confirmer le déplacement" }).click();
    await expect(column(page, "perdu").locator(`[data-kanban-card='${leadId}']`)).toBeVisible();
    await expect.poll(async () => (await leadFootprint(ownerToken, leadId)).status).toBe("perdu");
  });

  await test.step("le même historique que le formulaire de la fiche : trois changements de statut", async () => {
    const after = await leadFootprint(ownerToken, leadId);
    expect(after.history, "three status changes recorded in the lead history").toBeGreaterThanOrEqual(before.history + 3);
    const sheet = await visit(browser, world.owner, `/crm/leads/${leadId}?tab=historique`);
    const body = await sheet.locator("main").innerText();
    expect(body.toLowerCase()).toContain("perdu");
  });
});

test("LOT3-03 Kanban : le lecteur seul ne peut rien déplacer (écran et API), l'agent ne voit que son lead", async ({ browser }) => {
  const leadId = ids[movedLeadKey] as string;
  const page = await visit(browser, readOnly, "/crm/kanban");
  await expect(page.getByLabel("Colonnes du pipeline CRM")).toBeVisible();
  await expect(page.getByText("Lecture seule : votre rôle ne permet pas de modifier le statut")).toBeVisible();
  await expect(page.getByRole("button", { name: "Déplacer", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-kanban-card][draggable='true']")).toHaveCount(0);

  const before = await leadFootprint(ownerToken, leadId);
  const readOnlyToken = await tokenFor(browser, readOnly);
  const refusal = await apiCall(readOnlyToken, "POST", `/broker/crm/leads/${leadId}/status`, { status: "gagne" });
  expect([403, 404], "read-only status write").toContain(refusal.status);
  expect(await leadFootprint(ownerToken, leadId), "nothing written by the read-only member").toEqual(before);
});

test("LOT3-04 assignation : le sélecteur propose l'équipe du cabinet par noms, l'API refuse un conseiller hors annuaire", async ({ browser }) => {
  const leadId = ids[movedLeadKey] as string;
  enterprise = requireWorld(ENTERPRISE_KEY);
  const foreignActorId = await accountActorId(browser, enterprise.owner);

  const team = await apiCall(ownerToken, "GET", "/broker/team");
  expect(team.status).toBe(200);
  const members = itemsOf(team);
  expect(members.map((member) => member.id), "the agent belongs to the cabinet team").toContain(agentActorId);
  expect(members.map((member) => member.id), "no member of another cabinet in the team").not.toContain(foreignActorId);
  expect(team.text).not.toContain(enterprise.owner.email);

  await test.step("sélecteur nominatif : aucun identifiant brut ni membre d'un autre cabinet", async () => {
    const page = await visit(browser, world.owner, `/crm/leads/${leadId}`);
    const select = page.locator("#crm-advisor-id");
    await expect(select).toBeVisible();
    const labels = (await select.locator("option").allInnerTexts()).map((text) => text.trim());
    expect(labels.some((label) => /Aya Agent/u.test(label)), `options: ${labels.join(" | ")}`).toBe(true);
    for (const label of labels) expect(label, "no raw id in the picker").not.toMatch(UUID);
    expect(labels.join(" ")).not.toContain(enterprise.owner.email);
    await select.selectOption({ label: labels.find((label) => /Aya Agent/u.test(label)) as string });
    await page.getByRole("button", { name: "Assigner au conseiller" }).click();
    await expect(page.getByText("Lead assigne au conseiller.")).toBeVisible();
    await expect(page.getByText(/Conseiller actuel : Aya Agent/u)).toBeVisible();
    expect((await leadFootprint(ownerToken, leadId)).advisorId).toBe(agentActorId);
  });

  await test.step("l'API refuse un conseiller d'un autre cabinet ou inconnu, sans rien modifier", async () => {
    const before = await leadFootprint(ownerToken, leadId);
    const attempts: Array<Record<string, unknown>> = [
      { advisorId: foreignActorId, advisorPartnerTenantId: world.partnerId },
      { advisorId: foreignActorId, advisorPartnerTenantId: enterprise.partnerId },
      { advisorId: "00000000-0000-4000-8000-000000000001", advisorPartnerTenantId: world.partnerId }
    ];
    for (const body of attempts) {
      const result = await apiCall(ownerToken, "POST", `/broker/crm/leads/${leadId}/assign`, body);
      expect(result.status, `assign ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
      expect(result.text).not.toContain(enterprise.owner.email);
    }
    expect(await leadFootprint(ownerToken, leadId), "advisor unchanged after the refusals").toEqual(before);
  });
});

test("LOT3-05 liste CRM : filtres, tri et pagination sont appliqués par l'API (et par l'écran)", async ({ browser }) => {
  const movedRef = refs[movedLeadKey] as string;
  const list = (query: string) => apiCall(ownerToken, "GET", `/broker/crm/leads?${query}`);

  const all = await list("page=1&pageSize=25");
  expect(all.status).toBe(200);
  const allItems = itemsOf(all);
  expect(allItems.length).toBeGreaterThanOrEqual(4);
  expect(Number(asRecord(all.body).total)).toBeGreaterThanOrEqual(allItems.length);

  await test.step("filtre de statut : seul le statut demandé revient, le total suit", async () => {
    const lost = await list("status=perdu&page=1&pageSize=25");
    expect(lost.status).toBe(200);
    const lostItems = itemsOf(lost);
    expect(lostItems.map(referenceOf)).toContain(movedRef);
    for (const item of lostItems) expect(item.status).toBe("perdu");
    expect(Number(asRecord(lost.body).total)).toBe(lostItems.length);
    const nouveau = await list("status=nouveau&page=1&pageSize=25");
    expect(itemsOf(nouveau).map(referenceOf)).not.toContain(movedRef);
  });

  await test.step("recherche et conseiller : filtrés côté serveur", async () => {
    const search = await list(`search=${encodeURIComponent(movedRef)}&page=1&pageSize=25`);
    expect(itemsOf(search).map(referenceOf)).toEqual([movedRef]);
    const byAdvisor = await list(`advisorId=${agentActorId}&page=1&pageSize=25`);
    expect(itemsOf(byAdvisor).map(referenceOf)).toContain(movedRef);
    expect(itemsOf(byAdvisor).length).toBeLessThan(allItems.length + 1);
    const none = await list("productKey=produit-inexistant&page=1&pageSize=25");
    expect(itemsOf(none)).toEqual([]);
  });

  await test.step("tri par date sur tout le jeu filtré, dans les deux sens", async () => {
    const dates = async (direction: "asc" | "desc") =>
      itemsOf(await list(`sort=assignedAt&sortDirection=${direction}&page=1&pageSize=25`)).map((item) => Date.parse(String(item.assignedAt)));
    const ascending = await dates("asc");
    const descending = await dates("desc");
    expect(ascending).toEqual([...ascending].sort((left, right) => left - right));
    expect(descending).toEqual([...descending].sort((left, right) => right - left));
    const statusSorted = itemsOf(await list("sort=status&sortDirection=asc&page=1&pageSize=25")).map((item) => String(item.status));
    expect(statusSorted).toEqual([...statusSorted].sort());
  });

  await test.step("pagination : deux pages disjointes, le total reste celui du jeu filtré", async () => {
    const first = await list("sort=assignedAt&sortDirection=asc&page=1&pageSize=2");
    const second = await list("sort=assignedAt&sortDirection=asc&page=2&pageSize=2");
    const firstItems = itemsOf(first);
    const secondItems = itemsOf(second);
    expect(firstItems).toHaveLength(2);
    expect(secondItems.length).toBeGreaterThan(0);
    const firstRefs = firstItems.map(referenceOf);
    for (const reference of secondItems.map(referenceOf)) expect(firstRefs).not.toContain(reference);
    expect(Number(asRecord(first.body).total)).toBe(Number(asRecord(second.body).total));
    expect(Number(asRecord(first.body).total)).toBeGreaterThanOrEqual(4);
  });

  await test.step("écran : l'URL pilote les filtres (statut, recherche) et la table reflète l'API", async () => {
    const page = await visit(browser, world.owner, "/crm/leads?status=perdu");
    const table = page.getByRole("table", { name: "Leads CRM" });
    await expect(table).toContainText(movedRef);
    for (const [key, reference] of Object.entries(refs)) {
      if (reference === movedRef) continue;
      if ((await leadFootprint(ownerToken, ids[key] as string)).status !== "perdu") await expect(table).not.toContainText(reference);
    }
    await page.goto(`/crm/leads?q=${encodeURIComponent(movedRef)}`);
    await expect(page.getByRole("table", { name: "Leads CRM" }).getByRole("row").filter({ hasText: /QR-/u })).toHaveCount(1);
    await page.goto(`/crm/leads?sort=status&dir=asc`);
    await expect(page.getByRole("table", { name: "Leads CRM" }).getByRole("columnheader", { name: /Statut/u })).toHaveAttribute("aria-sort", "ascending");
  });
});

test("LOT3-06 vue multi-agences : Enterprise seulement, absente (lien, écran, API) pour Starter et Pro", async ({ browser }) => {
  enterprise = requireWorld(ENTERPRISE_KEY);
  const starter = requireState(loadJourneyState(), "brokerOwner");

  await test.step("Enterprise : lien de navigation, tableau des agences, API 200", async () => {
    const page = await visit(browser, enterprise.owner, "/");
    await expect(page.getByRole("link", { name: "Vue multi-agences" }).first()).toBeVisible();
    await page.goto("/enterprise/agencies");
    await expect(page.getByRole("heading", { name: "Vue multi-agences" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Comparaison des agences" })).toBeVisible();
    await expect(page.getByText("Plan Enterprise requis")).toHaveCount(0);
    const api = await apiCall(await tokenFor(browser, enterprise.owner), "GET", "/broker/dashboard/agencies");
    expect(api.status).toBe(200);
    expect(Array.isArray(api.body)).toBe(true);
    expect(api.text).not.toContain("@");
  });

  for (const [label, account] of [["Pro", world.owner], ["Starter", starter]] as const) {
    await test.step(`${label} : ni lien, ni données, API refusée`, async () => {
      const page = await visit(browser, account, "/");
      await expect(page.getByRole("link", { name: "Vue multi-agences" }), `${label} navigation`).toHaveCount(0);
      await page.goto("/enterprise/agencies");
      await expect(page.getByText("Plan Enterprise requis").first()).toBeVisible();
      await expect(page.getByRole("table", { name: "Comparaison des agences" })).toHaveCount(0);
      const api = await apiCall(await tokenFor(browser, account), "GET", "/broker/dashboard/agencies");
      expect(api.status, `${label} agencies API`).toBe(403);
    });
  }
});

test("LOT3-07 export CSV du tableau de bord : KPI pour le Pro, rien pour le Starter, aucune identité de prospect", async ({ browser }) => {
  enterprise = requireWorld(ENTERPRISE_KEY);
  const starter = requireState(loadJourneyState(), "brokerOwner");
  const visitorEmails = [1, 2, 3, 4].map((index) => world.data[`lead${index}Email`] as string);

  const assertNoIdentity = (csv: string) => {
    for (const email of visitorEmails) expect(csv, "visitor e-mail").not.toContain(email);
    expect(csv).not.toContain("visitor.e2e.test");
    expect(csv).not.toContain("Mariam");
    expect(csv).not.toMatch(/\+225\d{6,}/u);
    expect(csv).not.toMatch(/[\w.-]+@[\w-]+\.\w+/u);
  };

  const pro = await apiCall(ownerToken, "GET", "/broker/dashboard/export.csv");
  expect(pro.status).toBe(200);
  expect(pro.text.split("\n")[0]).toBe("section,dimension,valeur");
  for (const line of ["kpi,conversionRate,", "kpi,contactRate,", "kpi,qualificationRate,", "kpi,quotesSentLeads,"]) expect(pro.text).toContain(line);
  expect(pro.text, "no agency block for a Pro cabinet").not.toContain("section,agence,");
  assertNoIdentity(pro.text);

  // The broker app proxies the same file through the session cookie (httpOnly token never reaches the browser).
  const page = await visit(browser, world.owner, "/");
  const proxied = await page.request.get(`${e2eEnv.brokerUrl}/reports/export`);
  expect(proxied.status()).toBe(200);
  expect(proxied.headers()["content-type"]).toContain("text/csv");
  assertNoIdentity(await proxied.text());

  const ent = await apiCall(await tokenFor(browser, enterprise.owner), "GET", "/broker/dashboard/export.csv");
  expect(ent.status).toBe(200);
  assertNoIdentity(ent.text);

  const starterCsv = await apiCall(await tokenFor(browser, starter), "GET", "/broker/dashboard/export.csv");
  if (starterCsv.status === 200) {
    expect(starterCsv.text, "no CRM KPI for a Starter cabinet").not.toContain("kpi,");
    expect(starterCsv.text).not.toContain("section,agence,");
    assertNoIdentity(starterCsv.text);
  } else {
    expect([403, 404]).toContain(starterCsv.status);
  }

  // An agent holds no export right on the dashboard.
  const agentCsv = await apiCall(await tokenFor(browser, agent), "GET", "/broker/dashboard/export.csv");
  if (agentCsv.status === 200) assertNoIdentity(agentCsv.text);
  else expect([403, 404]).toContain(agentCsv.status);
});

test("LOT3-08 drapeaux IA fermés : aucun panneau IA, aucune colonne Priorité IA, aucune suggestion exploitable", async ({ browser }) => {
  enterprise = requireWorld(ENTERPRISE_KEY);
  const starter = requireState(loadJourneyState(), "brokerOwner");
  const enterpriseToken = await tokenFor(browser, enterprise.owner);

  await test.step("écrans Pro et Enterprise : panneau IA masqué (tableau de bord et /crm), pas de colonne Priorité IA", async () => {
    for (const account of [world.owner, enterprise.owner, starter]) {
      const page = await visit(browser, account, "/");
      await expectNoAiPanel(page);
    }
    for (const account of [world.owner, enterprise.owner]) {
      const crm = await visit(browser, account, "/crm");
      await expectNoAiPanel(crm);
    }
    const list = await visit(browser, world.owner, "/crm/leads");
    await expect(list.getByRole("table", { name: "Leads CRM" })).toBeVisible();
    await expect(list.getByRole("columnheader", { name: /Priorité IA/u })).toHaveCount(0);
  });

  await test.step("API : aucun score de priorité, aucun résumé ni assistant manager exploitable", async () => {
    for (const token of [ownerToken, enterpriseToken]) {
      const scores = await apiCall(token, "GET", "/broker/crm/ai/priority-scores");
      if (scores.status === 200) {
        const body = asRecord(scores.body);
        const list = Array.isArray(scores.body) ? scores.body : Array.isArray(body.items) ? body.items : Array.isArray(body.scores) ? body.scores : [];
        expect(list, "no priority score while lead scoring is closed").toEqual([]);
        if ("enabled" in body) expect(body.enabled).toBe(false);
      } else {
        expect([403, 404]).toContain(scores.status);
      }
    }
    for (const [token, path] of [
      [ownerToken, "/broker/crm/ai/performance-summary"],
      [enterpriseToken, "/broker/crm/ai/performance-summary"],
      [enterpriseToken, "/broker/crm/ai/manager-assistant"]
    ] as const) {
      const result = await apiCall(token, "POST", path, { windowDays: 30 });
      if (result.status >= 200 && result.status < 300) {
        const interaction = asRecord(result.body);
        expect(interaction.status, `${path} answer`).toBe("refused");
        expect(interaction.outputText ?? null).toBeNull();
      } else {
        expect([400, 403, 404, 409, 422, 503], `${path} refusal`).toContain(result.status);
      }
    }
    const summaries = await apiCall(ownerToken, "GET", "/broker/crm/ai/performance-summaries");
    expect([200, 403]).toContain(summaries.status);
    if (summaries.status === 200) {
      const usable = (Array.isArray(summaries.body) ? summaries.body : itemsOf(summaries)).filter((item) => asRecord(item).status !== "refused");
      expect(usable, "no usable performance summary").toEqual([]);
    }
  });

  await test.step("la liste triée par priorité n'affiche aucun score", async () => {
    const page = await visit(browser, world.owner, "/crm/leads?sort=priority&dir=desc");
    const table = page.getByRole("table", { name: "Leads CRM" });
    await expect(table).toBeVisible();
    await expect(table).not.toContainText(/\d+\/100/u);
  });
});
