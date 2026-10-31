import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadWorld, saveWorld, type BrokerWorld } from "./support/journey-state";
import {
  apiCall,
  asRecord,
  assignmentIds,
  bearerToken,
  closeSessions,
  itemsOf,
  leadFootprint,
  recordRequests,
  referenceOf,
  tokenFor,
  visit
} from "./support/pro-roles";
import { column, downloadExport, expectNoContactData, expectNoFormulaCell, parseExport } from "./support/recos-064";
import { card, confirmInDialog, fillReason, rowWith, uniqueSuffix } from "./support/ui";
import { WORLD_REASON, appPage, inviteMember, provisionBroker, publishOffer, requestQuote, superAdminAccount } from "./support/world";

// Spec 065 phase B - journey "Lot 064: capacités existantes branchées" (specs/064-wire-existing-capabilities).
// One Enterprise firm (owner = Propriétaire Pro, a manager, an agent, a published offer, three visitor leads):
//   W064-01 CSV exports from the lists (button per role, filters, audit-safe content, API 403 for the agent)
//   W064-02 custom role restricting an agent, effective within seconds without a new login, then lifted
//   W064-03 Enterprise agency DISPLAY filter on the CRM (narrows what is shown, never a security boundary)
//   W064-04 loss analysis page: disabled state with the AI flags off, no model call, no analysis row
//   W064-04b the same page for a Pro firm: plan gate
//   W064-05 admin routing anomalies: AI analysis card disabled while ai_routing_anomaly_detection_enabled is off
//   W064-06 cabinet charter in the broker header (Enterprise), never on the public site
// Sensitive AI flags cannot be switched on from the admin UI, so "AI off" is the default state of the stack.

test.describe.configure({ mode: "serial" });

const WORLD_KEY = "w064";
const PRO_WORLD_KEY = "w064p";
const DOMAIN = "broker-w064.e2e.test";
const BROKER_TOKEN_COOKIE = "assurmatch_broker_token";
const BROKER_TOKEN_COOKIE_ADMIN = "assurmatch_admin_token";
const LEAD_KEYS = ["lead1", "lead2", "lead3"] as const;
const STARTER_HEADER = ["leadAssignmentId", "publicReference", "countryCode", "productKey", "status", "assignedAt", "seen"];
const CRM_HEADER = ["reference", "country", "product", "status", "urgency", "source", "advisor"];
const NO_CUSTOM_ROLE = "Aucun rôle personnalisé";
const NO_EXPORT_NOTICE = "Export non autorisé pour votre rôle";

let world: BrokerWorld;
let manager: BackOfficeAccount;
let agent: BackOfficeAccount;
let refs: Record<(typeof LEAD_KEYS)[number], string>;
const suffix = uniqueSuffix();

function loadAll(): void {
  const loaded = loadWorld(WORLD_KEY);
  if (!loaded?.members.manager || !loaded.members.agent || !loaded.data.lead3Ref) {
    throw new Error(`broker world "${WORLD_KEY}" is incomplete: run W064-00 first`);
  }
  world = loaded;
  manager = loaded.members.manager;
  agent = loaded.members.agent;
  refs = { lead1: loaded.data.lead1Ref as string, lead2: loaded.data.lead2Ref as string, lead3: loaded.data.lead3Ref as string };
}

test.afterAll(async () => {
  await closeSessions();
});

function exportLink(page: Page) {
  return page.getByRole("link", { name: "Exporter (CSV)" });
}

function leadsTable(page: Page) {
  return page.getByRole("table", { name: "Leads CRM" });
}

/** The CRM list shows exactly the given references among the three leads of the firm. */
async function expectCrmList(page: Page, shown: string[]): Promise<void> {
  for (const reference of shown) await expect(leadsTable(page), `${reference} listed`).toContainText(reference);
  for (const reference of Object.values(refs)) {
    if (!shown.includes(reference)) await expect(leadsTable(page), `${reference} hidden`).not.toContainText(reference);
  }
}

function referencesOfExport(file: ReturnType<typeof parseExport>, columnName: string): string[] {
  return column(file, columnName).sort();
}

async function actorIdOf(token: string): Promise<string> {
  const me = await apiCall(token, "GET", "/auth/me");
  expect(me.status, "GET /auth/me").toBe(200);
  const actorId = String(asRecord(me.body).actorId ?? "");
  expect(actorId, "actor id").not.toBe("");
  return actorId;
}

/**
 * Fetches a broker-app route with the session of `page` (the "Exporter (CSV)" links are plain GET links).
 * The session cookie is Secure in the built app, which the Playwright request client does not send over
 * plain http to 127.0.0.1, so the token is replayed as an explicit Cookie header.
 */
async function appGet(page: Page, href: string) {
  const token = await bearerToken(page);
  const context = await playwrightRequest.newContext({ extraHTTPHeaders: { Cookie: `${BROKER_TOKEN_COOKIE}=${token}` } });
  try {
    const response = await context.get(new URL(href, e2eEnv.brokerUrl).toString(), { maxRedirects: 0 });
    return { status: response.status(), headers: response.headers(), text: await response.text() };
  } finally {
    await context.dispose();
  }
}

test("W064-00 le cabinet Enterprise est créé avec son manager, son agent, son offre et trois leads, deux leads sont assignés", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const existing = loadWorld(WORLD_KEY);
  const built: BrokerWorld = existing ?? (await provisionBroker(browser, { plan: "enterprise", label: "w064" }));
  if (!existing) saveWorld(WORLD_KEY, built);
  expect(built.plan).toBe("enterprise");

  if (!built.members.manager) {
    built.members.manager = await inviteMember(browser, built.owner, { key: "manager", displayName: "Marc Manager", emailDomain: DOMAIN });
    saveWorld(WORLD_KEY, built);
  }
  if (!built.members.agent) {
    built.members.agent = await inviteMember(browser, built.owner, { key: "agent", displayName: "Aya Agent", emailDomain: DOMAIN });
    saveWorld(WORLD_KEY, built);
  }
  if (!built.offerId) {
    const offer = await publishOffer(browser, built, "W064");
    built.offerId = offer.offerId;
    built.offerTitle = offer.offerTitle;
    saveWorld(WORLD_KEY, built);
  }
  for (const [index, key] of LEAD_KEYS.entries()) {
    if (built.data[`${key}Ref`]) continue;
    const quote = await requestQuote(browser, built.offerTitle as string, built.partnerName, `w064${index + 1}`);
    built.data[`${key}Ref`] = quote.reference;
    built.data[`${key}Email`] = quote.email;
    built.data[`${key}Phone`] = quote.phone;
    built.data[`${key}Name`] = quote.name;
    saveWorld(WORLD_KEY, built);
  }
  loadAll();

  // The leads reach the CRM asynchronously (routing).
  const ownerToken = await tokenFor(browser, world.owner);
  await expect
    .poll(
      async () => {
        const listed = itemsOf(await apiCall(ownerToken, "GET", "/broker/crm/leads")).map(referenceOf);
        return Object.values(refs).every((reference) => listed.includes(reference));
      },
      { timeout: 90_000, intervals: [2_000, 3_000], message: "the three leads are in the owner's CRM list" }
    )
    .toBe(true);
  const ids = await assignmentIds(ownerToken, refs);
  for (const key of LEAD_KEYS) world.data[`${key}Id`] = ids[key] as string;

  // lead1 -> agent, lead2 -> manager, lead3 stays unassigned.
  world.data.agentId = await actorIdOf(await tokenFor(browser, agent));
  world.data.managerId = await actorIdOf(await tokenFor(browser, manager));
  const assignments: Array<[string, string]> = [
    [ids.lead1 as string, world.data.agentId],
    [ids.lead2 as string, world.data.managerId]
  ];
  for (const [leadId, advisorId] of assignments) {
    if ((await leadFootprint(ownerToken, leadId)).advisorId === advisorId) continue;
    const owner = await visit(browser, world.owner, `/crm/leads/${leadId}`);
    const assign = owner.locator("form").filter({ has: owner.locator("#crm-advisor-id") });
    await assign.locator("#crm-advisor-id").selectOption(advisorId);
    await assign.getByRole("button", { name: "Assigner au conseiller" }).click();
    await expect(owner.getByText("Lead assigné au conseiller.")).toBeVisible();
    expect((await leadFootprint(ownerToken, leadId)).advisorId).toBe(advisorId);
  }
  saveWorld(WORLD_KEY, world);

  // Re-run guard: an interrupted W064-02 may have left a custom role on the agent.
  const cleared = await apiCall(ownerToken, "PUT", `/broker/enterprise/members/${world.data.agentId}/custom-role`, { customRoleId: null, reason: WORLD_REASON });
  expect(cleared.status, "no custom role left on the agent").toBeLessThan(300);
});

test("W064-01 les exports CSV: bouton selon le rôle, filtres actifs respectés, contenu sans donnée de contact, refus 403 pour l'agent", async ({ browser, request }) => {
  test.setTimeout(10 * 60_000);
  loadAll();
  const contact = LEAD_KEYS.flatMap((key) => [world.data[`${key}Email`], world.data[`${key}Phone`], world.data[`${key}Name`]]).filter((value): value is string => Boolean(value));
  const agentId = world.data.agentId as string;

  await test.step("propriétaire: export Starter de /leads (en-tête, références, audit sans contact)", async () => {
    const owner = await visit(browser, world.owner, "/leads");
    await expect(exportLink(owner)).toBeVisible();
    await expect(owner.getByText(NO_EXPORT_NOTICE)).toHaveCount(0);
    await expect(owner.getByText("Export audité")).toBeVisible();
    for (const reference of Object.values(refs)) await expect(owner.getByRole("table", { name: "Leads assignés" })).toContainText(reference);

    const file = await downloadExport(owner, exportLink(owner));
    expect(file.filename).toMatch(/^leads-starter-\d{4}-\d{2}-\d{2}\.csv$/u);
    expect(file.header).toEqual(STARTER_HEADER);
    expect(referencesOfExport(file, "publicReference")).toEqual(Object.values(refs).sort());
    expect(column(file, "leadAssignmentId").sort()).toEqual(LEAD_KEYS.map((key) => world.data[`${key}Id`] as string).sort());
    expectNoFormulaCell(file);
    expectNoContactData(file, contact);
  });

  await test.step("propriétaire: un filtre Starter actif est relayé à l'export (statut sans résultat = fichier vide)", async () => {
    const owner = await visit(browser, world.owner, "/leads?status=accepted");
    const href = await exportLink(owner).getAttribute("href");
    expect(href).toContain("status=accepted");
    const filtered = await appGet(owner, href as string);
    expect(filtered.status, `location: ${filtered.headers.location ?? "-"}`).toBe(200);
    expect(filtered.headers["content-type"]).toContain("text/csv");
    expect(filtered.headers["content-disposition"]).toContain("attachment");
    expect(filtered.headers["cache-control"]).toContain("no-store");
    const empty = parseExport(filtered.text);
    expect(empty.header).toEqual(STARTER_HEADER);
    expect(empty.rows, "no lead has been accepted: only the header row").toEqual([]);

    const unfiltered = parseExport((await appGet(owner, "/leads/export")).text);
    expect(unfiltered.rows).toHaveLength(3);
  });

  await test.step("propriétaire: export CRM complet puis avec recherche et filtre conseiller", async () => {
    const owner = await visit(browser, world.owner, "/crm/leads");
    await expect(leadsTable(owner)).toContainText(refs.lead1);
    await expect(exportLink(owner)).toBeVisible();
    const all = await downloadExport(owner, exportLink(owner));
    expect(all.filename).toMatch(/^leads-crm-\d{4}-\d{2}-\d{2}\.csv$/u);
    expect(all.header).toEqual(CRM_HEADER);
    expect(referencesOfExport(all, "reference")).toEqual(Object.values(refs).sort());
    // Advisors are exported as identifiers only (no contact data): lead1 -> agent, lead2 -> manager.
    const advisorOf = new Map(all.rows.map((row) => [row[0], row[6]]));
    expect(advisorOf.get(refs.lead1)).toBe(agentId);
    expect(advisorOf.get(refs.lead2)).toBe(world.data.managerId);
    expect(advisorOf.get(refs.lead3)).toBe("");
    expectNoFormulaCell(all);
    expectNoContactData(all, contact);

    // Search filter active in the UI -> only the searched lead is exported.
    await owner.locator("#crm-search").fill(refs.lead2);
    await owner.locator("#crm-search").press("Enter");
    await owner.waitForURL(/[?&]q=/u);
    await expectCrmList(owner, [refs.lead2]);
    expect(await exportLink(owner).getAttribute("href")).toContain("search=");
    const searched = await downloadExport(owner, exportLink(owner));
    expect(referencesOfExport(searched, "reference")).toEqual([refs.lead2]);

    // Advisor filter active in the UI -> only the leads of that advisor are exported.
    await owner.goto("/crm/leads");
    await owner.locator("#crm-advisor").selectOption(agentId);
    await owner.waitForURL(/[?&]advisor=/u);
    await expectCrmList(owner, [refs.lead1]);
    const byAdvisor = await downloadExport(owner, exportLink(owner));
    expect(referencesOfExport(byAdvisor, "reference")).toEqual([refs.lead1]);
  });

  await test.step("manager: export CRM autorisé et filtré, pas d'export Starter", async () => {
    const page = await visit(browser, manager, "/crm/leads?agence=all");
    await expect(exportLink(page)).toBeVisible();
    await expect(page.getByText(NO_EXPORT_NOTICE)).toHaveCount(0);
    const all = await downloadExport(page, exportLink(page));
    expect(referencesOfExport(all, "reference")).toEqual(Object.values(refs).sort());

    await page.locator("#crm-search").fill(refs.lead3);
    await page.locator("#crm-search").press("Enter");
    await page.waitForURL(/[?&]q=/u);
    await expectCrmList(page, [refs.lead3]);
    const searched = await downloadExport(page, exportLink(page));
    expect(referencesOfExport(searched, "reference")).toEqual([refs.lead3]);

    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Leads assignés" })).toBeVisible();
    await expect(exportLink(page)).toHaveCount(0);
    await expect(page.getByText(NO_EXPORT_NOTICE)).toBeVisible();
    const token = await bearerToken(page);
    expect((await apiCall(token, "GET", "/broker/starter/leads/export.csv")).status, "manager has no broker_leads:export").toBe(403);
    expect((await apiCall(token, "GET", "/broker/crm/leads/export.csv")).status, "manager holds broker_crm:export").toBe(200);
  });

  await test.step("agent: aucun bouton d'export (Starter et CRM), l'API et le relais du back-office répondent 403", async () => {
    const page = await visit(browser, agent, "/leads");
    await expect(page.getByRole("heading", { name: "Leads assignés" })).toBeVisible();
    await expect(exportLink(page)).toHaveCount(0);
    await expect(page.getByText(NO_EXPORT_NOTICE)).toBeVisible();
    await page.goto("/crm/leads?agence=all");
    await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
    await expect(leadsTable(page)).toContainText(refs.lead1);
    await expect(exportLink(page)).toHaveCount(0);
    await expect(page.getByText(NO_EXPORT_NOTICE)).toBeVisible();

    const token = await bearerToken(page);
    for (const path of ["/broker/starter/leads/export.csv", "/broker/crm/leads/export.csv"]) {
      const refused = await apiCall(token, "GET", path);
      expect(refused.status, `agent ${path}`).toBe(403);
      for (const reference of Object.values(refs)) expect(refused.text, "a refusal leaks no lead").not.toContain(reference);
    }
    for (const route of ["/leads/export", "/crm/leads/export"]) {
      const relay = await appGet(page, route);
      expect(relay.status, `agent session on the app route ${route}`).toBe(403);
      for (const reference of Object.values(refs)) expect(relay.text).not.toContain(reference);
    }
  });

  await test.step("sans session: redirection vers la connexion sur le relais du back-office, 401 sur l'API", async () => {
    for (const route of ["/leads/export", "/crm/leads/export"]) {
      // The broker middleware sends an anonymous visitor to the login screen before the route runs.
      const response = await request.get(`${e2eEnv.brokerUrl}${route}`, { maxRedirects: 0 });
      expect(response.status(), `anonymous ${route}`).toBeGreaterThanOrEqual(300);
      expect(response.status(), `anonymous ${route}`).toBeLessThan(400);
      expect(response.headers().location ?? "", `anonymous ${route}`).toContain("/login");
    }
    expect((await apiCall(undefined, "GET", "/broker/crm/leads/export.csv")).status).toBe(401);
    expect((await apiCall(undefined, "GET", "/broker/starter/leads/export.csv")).status).toBe(401);
  });
});

test("W064-02 un rôle personnalisé restreint l'agent sans nouvelle connexion, puis son retrait rétablit l'accès", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  loadAll();
  const roleName = `Sans CRM ${suffix}`;
  const agentMemberId = world.data.agentId as string;
  const putAgentCustomRole = async (customRoleId: string | null) => {
    const ownerToken = await tokenFor(browser, world.owner);
    const result = await apiCall(ownerToken, "PUT", `/broker/enterprise/members/${agentMemberId}/custom-role`, { customRoleId, reason: WORLD_REASON });
    expect(result.status, `PUT custom-role ${customRoleId ?? "none"}`).toBeLessThan(300);
  };
  // Re-run guard: a previous run may have left a custom role on the agent.
  await putAgentCustomRole(null);

  // The agent's existing session: the token is taken before any change and never renewed.
  const agentPage = await visit(browser, agent, "/crm/leads?agence=all");
  await expect(agentPage.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
  const agentToken = await bearerToken(agentPage);
  const agentCrm = () => apiCall(agentToken, "GET", "/broker/crm/leads");
  const baseline = await agentCrm();
  expect(baseline.status, "agent reads its CRM leads before the restriction").toBe(200);
  expect(asRecord((await apiCall(agentToken, "GET", "/auth/me")).body).customRole ?? null).toBeNull();

  await test.step("le propriétaire crée un rôle qui n'accorde ni CRM ni modification de lead", async () => {
    const owner = await visit(browser, world.owner, "/enterprise");
    const roles = card(owner, "Rôles personnalisés");
    if ((await rowWith(roles, roleName).count()) === 0 || !(await rowWith(roles, roleName).isVisible())) {
      await owner.locator("#role-name").fill(roleName);
      await owner.getByLabel("broker_leads:read", { exact: true }).check();
      await owner.getByLabel("notifications:read", { exact: true }).check();
      await owner.locator("#role-reason").fill(WORLD_REASON);
      await owner.getByRole("button", { name: "Créer le rôle" }).click();
      await owner.waitForURL(/\/enterprise\?ent=role_created/u);
    }
    const row = rowWith(card(owner, "Rôles personnalisés"), roleName);
    await expect(row).toContainText("broker_leads:read, notifications:read");
    await expect(row).not.toContainText("broker_crm");
  });

  const assignCustomRole = async (label: string, expectedNotice: RegExp) => {
    const owner = await visit(browser, world.owner, "/team");
    const member = rowWith(owner, "Aya Agent");
    await expect(member).toBeVisible();
    if (label === NO_CUSTOM_ROLE) {
      // PRODUCT BUG (apps/broker/app/team/team-forms.tsx, CustomRoleForm): the select is `required` while its
      // "Aucun rôle personnalisé" option has the empty value, so the browser blocks the submission. Until it is
      // fixed, the removal goes through the API route the form action calls (PUT .../custom-role, null).
      await member.getByRole("button", { name: "Rôle personnalisé" }).first().click();
      const dialog = owner.locator("dialog[open]");
      await expect(dialog).toBeVisible();
      await dialog.locator("select[name='customRoleId']").selectOption({ label });
      await fillReason(dialog, WORLD_REASON);
      if (await dialog.locator("select[name='customRoleId']").evaluate((element) => (element as HTMLSelectElement).checkValidity())) {
        await dialog.getByRole("button", { name: "Attribuer" }).last().click();
        await owner.waitForURL(/\/team\?role=/u);
        await expect(owner.locator(".bo-notice").first()).toContainText(expectedNotice);
        return;
      }
      test.info().annotations.push({ type: "product-bug", description: "team CustomRoleForm: required select blocks the empty \"Aucun rôle personnalisé\" option, the role cannot be removed from the UI" });
      await dialog.getByRole("button", { name: /Annuler|Fermer/u }).first().click();
      await putAgentCustomRole(null);
      return;
    }
    await confirmInDialog(
      owner,
      member,
      "Rôle personnalisé",
      async (dialog) => {
        await dialog.locator("select[name='customRoleId']").selectOption({ label });
        await fillReason(dialog, WORLD_REASON);
      },
      "Attribuer"
    );
    await owner.waitForURL(/\/team\?role=/u);
    await expect(owner.locator(".bo-notice").first()).toContainText(expectedNotice);
  };

  await test.step("attribution à l'agent: 403 sur le CRM en quelques secondes avec le jeton existant", async () => {
    await assignCustomRole(roleName, /Rôle personnalisé attribué/u);
    const owner = await visit(browser, world.owner, "/team");
    // Third column = "Rôle personnalisé" (the row text also holds the dialog options, so read the cell).
    await expect(rowWith(owner, "Aya Agent").getByRole("cell").nth(2)).toHaveText(roleName);
    const startedAt = Date.now();
    await expect
      .poll(async () => (await agentCrm()).status, { timeout: 20_000, intervals: [2_000], message: "agent CRM list refused after the custom role was assigned" })
      .toBe(403);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    test.info().annotations.push({ type: "observation", description: `restriction effective ${seconds} s after the team page confirmed the assignment` });
    const refused = await agentCrm();
    for (const reference of Object.values(refs)) expect(refused.text, "refusal leaks no lead").not.toContain(reference);

    const me = asRecord((await apiCall(agentToken, "GET", "/auth/me")).body);
    expect(asRecord(me.customRole).name, "/auth/me exposes the custom role").toBe(roleName);
    const effective = Array.isArray(me.customRolePermissions) ? (me.customRolePermissions as string[]) : [];
    expect(effective).toEqual(expect.arrayContaining(["broker_leads:read"]));
    expect(effective).not.toContain("broker_crm:read_assigned");
    expect((await apiCall(agentToken, "GET", "/broker/crm/leads/export.csv")).status).toBe(403);
  });

  await test.step("l'interface de l'agent suit après rechargement, le reste de son accès est conservé", async () => {
    await agentPage.goto("/crm/leads?agence=all");
    await expect(agentPage.getByText("Accès CRM refusé").first()).toBeVisible();
    await expect(agentPage.getByRole("table", { name: "Leads CRM" })).toHaveCount(0);
    await expect(agentPage.getByText(refs.lead1)).toHaveCount(0);
    await agentPage.goto("/leads");
    await expect(agentPage.getByRole("heading", { name: "Leads assignés" })).toBeVisible();
    await expect(agentPage.getByText(refs.lead1).first()).toBeVisible();
    // Never an elevation: the owner still reads the whole CRM.
    const ownerToken = await tokenFor(browser, world.owner);
    expect((await apiCall(ownerToken, "GET", "/broker/crm/leads")).status).toBe(200);
  });

  await test.step("retrait du rôle: l'accès de l'agent est rétabli en quelques secondes", async () => {
    await assignCustomRole(NO_CUSTOM_ROLE, /Rôle personnalisé retiré/u);
    const owner = await visit(browser, world.owner, "/team");
    await expect(rowWith(owner, "Aya Agent").getByRole("cell").nth(2)).toHaveText("Aucun");
    await expect
      .poll(async () => (await agentCrm()).status, { timeout: 20_000, intervals: [2_000], message: "agent CRM list restored after the custom role was removed" })
      .toBe(200);
    expect(asRecord((await apiCall(agentToken, "GET", "/auth/me")).body).customRole ?? null).toBeNull();
    await agentPage.goto("/crm/leads?agence=all");
    await expect(agentPage.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
    await expect(leadsTable(agentPage)).toContainText(refs.lead1);
    // The role stays listed on the Enterprise page, with no member left.
    const enterprise = await visit(browser, world.owner, "/enterprise");
    await expect(rowWith(card(enterprise, "Rôles personnalisés"), roleName)).toBeVisible();
  });
});

test("W064-03 le filtre Agence du CRM Enterprise restreint l'affichage sans devenir une frontière d'accès", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  loadAll();
  const plateau = world.data.agencyPlateau ?? `Agence Plateau ${suffix}`;
  const cocody = world.data.agencyCocody ?? `Agence Cocody ${suffix}`;
  const agentId = world.data.agentId as string;
  const managerId = world.data.managerId as string;

  const owner = await visit(browser, world.owner, "/enterprise");
  const agencies = () => card(owner, "Agences");
  for (const name of [plateau, cocody]) {
    if ((await agencies().getByRole("row").filter({ hasText: name }).count()) > 0) continue;
    await agencies().locator("#agency-name").fill(name);
    await agencies().locator("#agency-country").fill("CI");
    await agencies().locator("#agency-reason").fill(WORLD_REASON);
    await agencies().getByRole("button", { name: "Créer une agence" }).click();
    await owner.waitForURL(/\/enterprise\?ent=agency_created/u);
  }
  world.data.agencyPlateau = plateau;
  world.data.agencyCocody = cocody;
  saveWorld(WORLD_KEY, world);

  // Members: agent -> Plateau, manager -> Cocody (lead1 is the agent's, lead2 the manager's, lead3 nobody's).
  for (const [name, memberId] of [[plateau, agentId], [cocody, managerId]] as const) {
    await openAs(owner, world.owner, "/enterprise");
    if ((await rowWith(agencies(), name).innerText()).includes("1 membre(s)")) continue;
    await confirmInDialog(
      owner,
      rowWith(agencies(), name),
      "Rattacher un membre",
      async (dialog) => {
        await dialog.getByLabel("Identifiant du membre").fill(memberId);
        await fillReason(dialog, WORLD_REASON);
      },
      "Rattacher"
    );
    await owner.waitForURL(/\/enterprise\?ent=member_assigned/u);
    await expect(rowWith(agencies(), name)).toContainText("1 membre(s)");
  }

  const ownerToken = await tokenFor(browser, world.owner);
  const agencyList = await apiCall(ownerToken, "GET", "/broker/enterprise/agencies");
  expect(agencyList.status).toBe(200);
  const idOfAgency = (name: string) => String(itemsOf(agencyList).find((agency) => agency.name === name)?.id ?? "");
  const plateauId = idOfAgency(plateau);
  const cocodyId = idOfAgency(cocody);
  expect(plateauId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(cocodyId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(itemsOf(agencyList).find((agency) => agency.id === plateauId)?.memberIds, "GET /broker/enterprise/agencies exposes memberIds").toEqual([agentId]);

  await test.step("propriétaire (sans agence): « Toutes les agences » par défaut, le filtre réduit l'affichage à chaque agence", async () => {
    const page = await visit(browser, world.owner, "/crm/leads");
    const select = page.locator("#crm-agency");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("all");
    await expect(page.getByText("Filtre d'affichage : il ne restreint pas vos droits d'accès.")).toBeVisible();
    expect(await select.locator("option").allInnerTexts()).toEqual(["Toutes les agences", plateau, cocody, "Sans agence"].sort((a, b) => (a === "Toutes les agences" ? -1 : b === "Toutes les agences" ? 1 : a === "Sans agence" ? 1 : b === "Sans agence" ? -1 : a.localeCompare(b, "fr"))));
    await expectCrmList(page, Object.values(refs));

    await select.selectOption({ label: plateau });
    await page.waitForURL(/[?&]agence=/u);
    await expectCrmList(page, [refs.lead1]);
    // The export follows the same display filter.
    expect(await exportLink(page).getAttribute("href")).toContain(`agencyId=${plateauId}`);
    expect(parseExport((await appGet(page, (await exportLink(page).getAttribute("href")) as string)).text).rows.map((row) => row[0])).toEqual([refs.lead1]);

    await page.locator("#crm-agency").selectOption({ label: cocody });
    await page.waitForURL(new RegExp(`agence=${cocodyId}`, "u"));
    await expectCrmList(page, [refs.lead2]);

    await page.locator("#crm-agency").selectOption({ label: "Sans agence" });
    await page.waitForURL(/agence=none/u);
    await expectCrmList(page, [refs.lead3]);

    await page.locator("#crm-agency").selectOption({ label: "Toutes les agences" });
    await page.waitForURL(/agence=all/u);
    await expectCrmList(page, Object.values(refs));

    // The Kanban takes the same parameter.
    await page.goto(`/crm/kanban?agence=${plateauId}`);
    const board = page.getByLabel("Colonnes du pipeline CRM");
    await expect(board).toContainText(refs.lead1);
    await expect(board).not.toContainText(refs.lead2);
    await expect(board).not.toContainText(refs.lead3);
  });

  await test.step("API: agence d'un autre cabinet ou inconnue = 404 neutre, filtre cumulé avec « sans agence »", async () => {
    const unknown = await apiCall(ownerToken, "GET", "/broker/crm/leads?agencyId=00000000-0000-4000-8000-000000000000");
    expect(unknown.status, "unknown agency").toBe(404);
    const none = itemsOf(await apiCall(ownerToken, "GET", "/broker/crm/leads?agencyId=none")).map(referenceOf);
    expect(none).toEqual([refs.lead3]);
  });

  await test.step("manager rattaché à Cocody: son agence est le défaut d'affichage, mais ses droits sont inchangés", async () => {
    const page = await visit(browser, manager, "/crm/leads");
    await expect(page.locator("#crm-agency")).toHaveValue(cocodyId);
    await expectCrmList(page, [refs.lead2]);
    await page.goto("/crm/leads?agence=all");
    await expectCrmList(page, Object.values(refs));
    await page.goto("/crm/leads?agence=none");
    await expectCrmList(page, [refs.lead3]);
    const token = await bearerToken(page);
    const unfiltered = itemsOf(await apiCall(token, "GET", "/broker/crm/leads")).map(referenceOf).sort();
    expect(unfiltered, "without the display filter the API still returns everything the manager may read").toEqual(Object.values(refs).sort());
  });

  await test.step("agent rattaché à Plateau: le filtre ne peut que réduire ce que le rôle autorise, jamais l'élargir", async () => {
    const page = await visit(browser, agent, "/crm/leads?agence=all");
    const token = await bearerToken(page);
    await expectCrmList(page, [refs.lead1]);
    const listed = async (query: string) => itemsOf(await apiCall(token, "GET", `/broker/crm/leads${query}`)).map(referenceOf);
    expect(await listed(""), "base role: assigned leads only").toEqual([refs.lead1]);
    expect(await listed(`?agencyId=${plateauId}`)).toEqual([refs.lead1]);
    expect(await listed(`?agencyId=${cocodyId}`), "another agency's filter never reveals lead2").toEqual([]);
    expect(await listed("?agencyId=none"), "« sans agence » never reveals lead3").toEqual([]);
  });
});

test("W064-04 l'analyse des pertes Enterprise est désactivée et explicite quand les flags IA sont coupés, sans appel au modèle", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  loadAll();
  const ownerPage = await visit(browser, world.owner, "/crm/loss-analysis");
  const recorder = recordRequests(ownerPage);
  await ownerPage.goto("/crm/loss-analysis");
  await ownerPage.waitForLoadState("networkidle");

  await expect(ownerPage.getByRole("heading", { name: "Analyse des pertes", exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Assistance IA", { exact: true }).first()).toBeVisible();
  const notice = ownerPage.locator(".bo-notice").filter({ hasText: "Assistance IA indisponible" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/désactivée|fonctionnalité fermée/u);
  const launch = ownerPage.getByRole("button", { name: "Lancer l'analyse des pertes" });
  await expect(launch).toBeVisible();
  await expect(launch).toBeDisabled();
  const usable = (items: Array<Record<string, unknown>>) =>
    items.filter((item) => item.status === "completed" || item.status === "queued" || (typeof item.outputText === "string" && item.outputText.trim() !== ""));
  const ownerToken = await bearerToken(ownerPage);
  const before = await apiCall(ownerToken, "GET", "/broker/crm/ai/loss-analysis");
  expect(before.status).toBe(200);
  expect(usable(itemsOf(before)), "no analysis before").toEqual([]);
  // A re-run finds the refusal rows recorded by the forged request below: the empty state only holds on a first run.
  if (itemsOf(before).length === 0) await expect(ownerPage.getByText("Aucune analyse des pertes pour le moment.")).toBeVisible();
  await expect(ownerPage.getByRole("button", { name: /Valider l'analyse|Écarter l'analyse/u })).toHaveCount(0);
  await expect(ownerPage.getByRole("link", { name: "Analyse des pertes" })).toBeVisible();
  recorder.stop();
  expect(recorder.all.filter((entry) => entry.method === "POST"), "reading the page triggers no server action").toEqual([]);

  // A forged request (the button is only a convenience): refused, or recorded as refused, never queued nor completed.
  const forged = await apiCall(ownerToken, "POST", "/broker/crm/ai/loss-analysis", { language: "fr" });
  if (forged.status >= 200 && forged.status < 300) {
    const interaction = asRecord(forged.body);
    expect(interaction.status, "a recorded request is a refusal").toBe("refused");
    expect(interaction.outputText ?? null).toBeNull();
  } else {
    expect([403, 404, 422, 429], "refusal status").toContain(forged.status);
  }
  const after = await apiCall(ownerToken, "GET", "/broker/crm/ai/loss-analysis");
  expect(after.status).toBe(200);
  expect(usable(itemsOf(after)), "no analysis row after the forged request").toEqual([]);

  // Same page after the forged request: still disabled, nothing to validate.
  await ownerPage.goto("/crm/loss-analysis");
  await expect(ownerPage.getByRole("button", { name: "Lancer l'analyse des pertes" })).toBeDisabled();
  await expect(ownerPage.getByRole("button", { name: /Valider l'analyse|Écarter l'analyse/u })).toHaveCount(0);

  // Tenant-wide aggregates stay out of reach of a limited agent (spec D9).
  const agentToken = await tokenFor(browser, agent);
  expect((await apiCall(agentToken, "GET", "/broker/crm/ai/loss-analysis")).status, "assigned-only agent").toBe(403);
});

test("W064-04b l'analyse des pertes est réservée au plan Enterprise: un cabinet Pro voit la mention et l'API refuse", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const existing = loadWorld(PRO_WORLD_KEY);
  const pro = existing ?? (await provisionBroker(browser, { plan: "pro", label: "w064p" }));
  if (!existing) saveWorld(PRO_WORLD_KEY, pro);
  expect(pro.plan).toBe("pro");

  const page = await visit(browser, pro.owner, "/crm/loss-analysis");
  await expect(page.getByRole("heading", { name: "Analyse des pertes réservée au plan Enterprise" })).toBeVisible();
  await expect(page.getByText("Plan Enterprise requis").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Lancer l'analyse des pertes" })).toHaveCount(0);

  const token = await bearerToken(page);
  expect((await apiCall(token, "GET", "/broker/crm/ai/loss-analysis")).status, "Pro list").toBe(403);
  const forged = await apiCall(token, "POST", "/broker/crm/ai/loss-analysis", { language: "fr" });
  if (forged.status >= 200 && forged.status < 300) {
    expect(asRecord(forged.body).status, "a Pro request, if recorded, is a refusal").toBe("refused");
  } else {
    expect(forged.status).toBeGreaterThanOrEqual(400);
  }
});

test("W064-05 admin: la carte « Analyse IA (assistance) » des anomalies de routage est désactivée et explicite tant que le flag est coupé", async ({ browser }) => {
  const admin = await appPage(browser, e2eEnv.adminUrl);
  try {
    await openAs(admin, superAdminAccount(), "/routing/anomalies");
    const recorder = recordRequests(admin);
    await admin.goto("/routing/anomalies");
    await admin.waitForLoadState("networkidle");
    await expect(admin.getByRole("heading", { name: "Anomalies de routage", exact: true })).toBeVisible();

    // The deterministic report stays usable.
    await expect(admin.getByRole("table", { name: "Anomalies de routage" })).toBeVisible();
    await expect(admin.getByText("Critiques", { exact: true })).toBeVisible();

    const ai = card(admin, "Analyse IA (assistance)");
    await expect(ai).toBeVisible();
    await expect(ai.getByText("Assistance IA", { exact: true }).first()).toBeVisible();
    const button = ai.getByRole("button", { name: "Demander une analyse IA" });
    await expect(button).toBeDisabled();
    const reason = admin.locator("#routing-anomaly-ai-disabled");
    await expect(reason).toBeVisible();
    await expect(reason).toContainText(/Analyse IA désactivée/u);
    // A re-run finds the refusal rows recorded by the forged request below: the empty state only holds on a first run.
    if ((await ai.getByText("Aucune analyse IA des anomalies de routage pour le moment.").count()) === 0) {
      await expect(ai.getByText(/en cours|terminée/u), "only refused rows may be listed").toHaveCount(0);
      await expect(ai.getByText("refusée").first()).toBeVisible();
    }
    await expect(ai.getByRole("button", { name: /Valider l'analyse|Écarter l'analyse/u })).toHaveCount(0);
    recorder.stop();
    expect(recorder.all.filter((entry) => entry.method === "POST"), "no server action while reading the page").toEqual([]);

    // A forged request is refused or recorded as a refusal: no analysis is ever queued or completed.
    const token = (await admin.context().cookies()).find((cookie) => cookie.name === BROKER_TOKEN_COOKIE_ADMIN)?.value;
    expect(token, "admin session token cookie").toBeTruthy();
    const forged = await apiCall(token, "POST", "/admin/routing/anomalies/analyze", { language: "fr" });
    if (forged.status >= 200 && forged.status < 300) {
      expect(asRecord(forged.body).status, "a recorded request is a refusal").toBe("refused");
    } else {
      expect([403, 404, 422, 429], "refusal status").toContain(forged.status);
    }
    const insights = await apiCall(token, "GET", "/admin/ai/insights");
    expect(insights.status).toBe(200);
    const analyses = itemsOf(insights).filter((item) => item.assistType === "routing_anomaly_analysis");
    expect(analyses.filter((item) => item.status === "completed" || item.status === "queued"), "no routing anomaly analysis").toEqual([]);

    await admin.goto("/routing/anomalies");
    await expect(admin.getByRole("button", { name: "Demander une analyse IA" })).toBeDisabled();
    await expect(admin.getByRole("button", { name: /Valider l'analyse|Écarter l'analyse/u })).toHaveCount(0);
  } finally {
    await admin.context().close();
  }
});

test("W064-06 la charte du cabinet Enterprise s'applique à l'en-tête du back-office courtier, avec la mention plateforme, jamais au site public", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  loadAll();
  const label = `Cabinet W064 ${suffix}`.slice(0, 50);
  const saveBranding = async (page: Page, color: string): Promise<boolean> => {
    await openAs(page, world.owner, "/enterprise");
    await page.locator("#branding-label").fill(label);
    await page.locator("#branding-color").fill(color);
    await page.locator("#branding-reason").fill(WORLD_REASON);
    await page.getByRole("button", { name: "Enregistrer la charte" }).click();
    await page.waitForURL(/\/enterprise\?ent=/u);
    const saved = new URL(page.url()).searchParams.get("ent") === "branding_saved";
    if (saved && color === "#0b3d91" && !(await page.locator("[data-broker-shell]").innerText()).includes(label)) {
      // Observation: the shell (layout) is kept by the client router after the server action redirect, so the
      // new charte shows only after the next full page load.
      test.info().annotations.push({ type: "observation", description: "branding saved: the shell header is refreshed only after a full reload" });
    }
    if (saved) await page.reload();
    return saved;
  };

  const owner = await visit(browser, world.owner, "/enterprise");
  // A colour that would make the sidebar text unreadable is stored but not applied (contrast guard).
  if (await saveBranding(owner, "#ffeb3b")) {
    await expect(owner.locator("[data-broker-shell]")).toContainText(label);
    await expect(owner.locator("[data-broker-brand='custom']")).toHaveCount(0);
  }
  expect(await saveBranding(owner, "#0b3d91"), "branding saved").toBe(true);
  await expect(owner.locator(".bo-notice").first()).toContainText("Charte du portail courtier enregistrée.");
  const shell = owner.locator("[data-broker-shell]");
  await expect(shell).toContainText(label);
  await expect(shell).toContainText("Plateforme technique AssurMatch");
  await expect(owner.locator("[data-broker-brand='custom']")).toHaveCount(1);

  // The whole firm sees it, on any page.
  const teamMember = await visit(browser, manager, "/crm/leads?agence=all");
  await expect(teamMember.locator("[data-broker-shell]")).toContainText(label);
  await expect(teamMember.locator("[data-broker-shell]")).toContainText("Plateforme technique AssurMatch");

  // A Pro firm keeps the default header (the charte is an Enterprise option).
  const pro = loadWorld(PRO_WORLD_KEY);
  if (pro) {
    const proPage = await visit(browser, pro.owner, "/crm");
    await expect(proPage.locator("[data-broker-shell]")).not.toContainText(label);
  }

  // The public comparator never reads the charte.
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  try {
    for (const path of ["/", "/pays/CI/produits/auto/offres"]) {
      await visitor.goto(path);
      await visitor.waitForLoadState("networkidle");
      expect(await visitor.content(), `public page ${path}`).not.toContain(label);
    }
  } finally {
    await visitor.context().close();
  }
});
