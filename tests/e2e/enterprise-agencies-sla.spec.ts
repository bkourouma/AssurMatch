import { expect, test, type Browser, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { loadJourneyState, loadWorld, requireState, saveWorld, type BrokerWorld } from "./support/journey-state";
import { card, confirmInDialog, expectActionSuccess, fillReason, rowWith, uniqueSuffix } from "./support/ui";
import { WORLD_REASON, appPage, inviteMember, provisionBroker, superAdminAccount } from "./support/world";

// Spec 065 - journey "Enterprise: agencies and SLA settings" (PRD 6.3 Plan Enterprise: multi-agences,
// SLA prioritaire; spec 040). The firm is created by this file (admin creates an Enterprise broker,
// the owner activates), so the journey does not depend on pro-01-setup. It is saved as world
// "enterprise" and reused by a re-run.
//
// Product facts the journey is built on (apps/broker/app/enterprise/page.tsx, backend enterprise module):
// - /enterprise: agency list + creation form, custom roles, SLA card (KPIs + target form), branding.
// - the broker target can only be tightened: above the contractual target set by the admin the API
//   answers 422 and the page shows "Objectif refuse ...".
// - creating agencies / SLA needs broker_crm:* (the owner); a manager reads but is refused (403).

test.describe.configure({ mode: "serial" });

const ENTERPRISE_PATH = "/enterprise";
const CONTRACTUAL_SLA = 60;
const TIGHTER_SLA = 30;
const LOOSER_SLA = 120;
const BROKER_TOKEN_COOKIE = "assurmatch_broker_token";

let world: BrokerWorld;
const suffix = uniqueSuffix();
const agencyPlateau = `Agence Plateau ${suffix}`;
const agencyCocody = `Agence Cocody ${suffix}`;

// One browser context per app and account for the whole file (sessions are re-opened by openAs when they expire).
const pages = new Map<string, Page>();

async function pageFor(browser: Browser, key: string, baseURL: string): Promise<Page> {
  const existing = pages.get(key);
  if (existing && !existing.isClosed()) return existing;
  const page = await appPage(browser, baseURL);
  pages.set(key, page);
  return page;
}

async function openEnterprise(browser: Browser, key: string, account: BackOfficeAccount, path = ENTERPRISE_PATH): Promise<Page> {
  const page = await pageFor(browser, key, e2eEnv.brokerUrl);
  await openAs(page, account, path);
  return page;
}

async function openAdminPartner(browser: Browser): Promise<Page> {
  const admin = await pageFor(browser, "admin", e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), `/partners/${world.partnerId}`);
  return admin;
}

/** Result notice of a server action that redirects to /enterprise?ent=... (shown at the top of the page). */
function notice(page: Page) {
  return page.locator(".bo-notice").filter({ hasText: /\S/u }).first();
}

function agenciesCard(page: Page) {
  return card(page, "Agences");
}

function slaCard(page: Page) {
  return card(page, "Engagement de reactivite (SLA)");
}

function slaTarget(page: Page) {
  return slaCard(page).locator("li.bo-stats__cell").filter({ hasText: "Objectif premiere action" });
}

async function submitSla(page: Page, minutes: number, reason: string): Promise<void> {
  const sla = slaCard(page);
  await sla.locator("#sla-target").fill(String(minutes));
  await sla.locator("#sla-reason").fill(reason);
  await sla.getByRole("button", { name: "Enregistrer l'objectif" }).click();
  await page.waitForURL(/\/enterprise\?ent=/u);
}

test.afterAll(async () => {
  for (const page of pages.values()) await page.context().close().catch(() => undefined);
  pages.clear();
});

test("ENT-00 le courtier Enterprise est créé par l'admin, activé par son propriétaire et équipé d'un manager", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const existing = loadWorld("enterprise");
  world = existing ?? (await provisionBroker(browser, { plan: "enterprise", label: "ent" }));
  if (!existing) saveWorld("enterprise", world);
  expect(world.plan).toBe("enterprise");

  // The admin sees the plan on the partner record.
  const admin = await openAdminPartner(browser);
  await expect(card(admin, "Synthèse")).toContainText(/Enterprise/iu);

  // A manager exists to check the owner-only rule (PRD 6.3 "multi-utilisateurs avancé").
  if (!world.members.manager) {
    world.members.manager = await inviteMember(browser, world.owner, { key: "manager", displayName: "Marc Manager", emailDomain: "broker-ent.e2e.test" });
    saveWorld("enterprise", world);
  }

  // The Enterprise space opens for the owner of an Enterprise firm.
  const owner = await openEnterprise(browser, "owner", world.owner);
  await expect(owner.getByRole("heading", { name: "Organisation du cabinet" })).toBeVisible();
  await expect(agenciesCard(owner)).toBeVisible();
  await expect(slaCard(owner)).toBeVisible();
  await expect(card(owner, "Roles personnalises")).toBeVisible();
  await expect(card(owner, "Charte du portail courtier")).toBeVisible();
});

test("ENT-01 le propriétaire crée deux agences, elles apparaissent dans la liste et persistent après rechargement", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const owner = await openEnterprise(browser, "owner", world.owner);

  const created: Array<{ name: string; city: string }> = [
    { name: agencyPlateau, city: "Abidjan" },
    { name: agencyCocody, city: "Bouaké" }
  ];
  for (const agency of created) {
    const agencies = agenciesCard(owner);
    await agencies.locator("#agency-name").fill(agency.name);
    await agencies.locator("#agency-country").fill("ci");
    await agencies.locator("#agency-city").fill(agency.city);
    await agencies.locator("#agency-reason").fill(WORLD_REASON);
    await agencies.getByRole("button", { name: "Creer une agence" }).click();
    await owner.waitForURL(/\/enterprise\?ent=agency_created/u);
    await expect(notice(owner)).toContainText("Agence creee et auditee.");
    await expect(notice(owner)).toHaveAttribute("data-tone", "success");
    const row = rowWith(agenciesCard(owner), agency.name);
    await expect(row).toContainText(`CI - ${agency.city}`);
    await expect(row).toContainText("0 membre(s)");
  }

  // Persisted: a clean page load (no ?ent= query) still lists both agencies, country upper-cased.
  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await expect(owner).toHaveURL(/\/enterprise$/u);
  for (const agency of created) {
    await expect(rowWith(agenciesCard(owner), agency.name)).toContainText(`CI - ${agency.city}`);
  }
  world.data.agencyPlateau = agencyPlateau;
  world.data.agencyCocody = agencyCocody;
  saveWorld("enterprise", world);
});

test("ENT-02 les saisies invalides sont refusées dans l'interface et ne créent aucune agence", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const owner = await openEnterprise(browser, "owner", world.owner);
  const rowsBefore = await agenciesCard(owner).getByRole("row").count();
  const attempts: Array<{ what: string; name: string; country: string; reason: string }> = [
    { what: "empty name", name: "", country: "CI", reason: WORLD_REASON },
    { what: "one-letter country", name: `Agence Refusée ${suffix}`, country: "C", reason: WORLD_REASON },
    { what: "reason too short", name: `Agence Refusée ${suffix}`, country: "CI", reason: "ab" }
  ];
  for (const attempt of attempts) {
    const agencies = agenciesCard(owner);
    await agencies.locator("#agency-name").fill(attempt.name);
    await agencies.locator("#agency-country").fill(attempt.country);
    await agencies.locator("#agency-reason").fill(attempt.reason);
    await agencies.getByRole("button", { name: "Creer une agence" }).click();
    await owner.waitForURL(/\/enterprise\?ent=invalid/u);
    await expect(notice(owner), attempt.what).toContainText("Saisie incomplete.");
    await expect(notice(owner), attempt.what).toHaveAttribute("data-tone", "warning");
  }
  await expect(owner.getByText(`Agence Refusée ${suffix}`)).toHaveCount(0);
  await expect(agenciesCard(owner).getByRole("row")).toHaveCount(rowsBefore);

  // A second agency with the same name is accepted by the API (no uniqueness rule): observation only.
});

test("ENT-02b le propriétaire modifie une agence avec « Modifier » (nom, ville, statut, motif), la modification est auditée et persiste", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const owner = await openEnterprise(browser, "owner", world.owner);
  const renamed = `Agence Cocody Nord ${suffix}`;

  // Every agency row offers « Modifier »: the dialog carries name, city, status and the audited reason.
  const row = rowWith(agenciesCard(owner), agencyCocody);
  await expect(row.getByRole("button", { name: "Modifier" })).toBeVisible();
  await confirmInDialog(owner, row, "Modifier", async (dialog) => {
    await expect(dialog.getByRole("heading", { name: `Modifier l'agence ${agencyCocody}` })).toBeVisible();
    await dialog.getByLabel("Nom de l'agence").fill(renamed);
    await dialog.getByLabel("Ville de l'agence").fill("Yamoussoukro");
    await dialog.getByLabel("Statut de l'agence").selectOption("suspended");
    await dialog.getByLabel("Motif").fill(WORLD_REASON);
  }, "Enregistrer");
  await owner.waitForURL(/\/enterprise\?ent=agency_updated/u);
  await expect(notice(owner)).toContainText("Agence modifiée et auditée.");
  await expect(notice(owner)).toHaveAttribute("data-tone", "success");
  const updated = rowWith(agenciesCard(owner), renamed);
  await expect(updated).toContainText("CI - Yamoussoukro");
  await expect(updated).toContainText(/Suspendue|suspended/iu);

  // Persisted after a clean load; the country is not editable (no field for it in the dialog).
  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await expect(rowWith(agenciesCard(owner), renamed)).toContainText("CI - Yamoussoukro");

  // Restore the original name and status for the next steps of the journey.
  await confirmInDialog(owner, rowWith(agenciesCard(owner), renamed), "Modifier", async (dialog) => {
    await expect(dialog.getByLabel(/pays/iu)).toHaveCount(0);
    await dialog.getByLabel("Nom de l'agence").fill(agencyCocody);
    await dialog.getByLabel("Ville de l'agence").fill("Bouaké");
    await dialog.getByLabel("Statut de l'agence").selectOption("active");
    await dialog.getByLabel("Motif").fill(WORLD_REASON);
  }, "Enregistrer");
  await owner.waitForURL(/\/enterprise\?ent=agency_updated/u);
  await expect(rowWith(agenciesCard(owner), agencyCocody)).toContainText("CI - Bouaké");
});

test("ENT-03 le propriétaire rattache un membre de l'équipe à une agence, le rattachement est visible et persistant", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const manager = world.members.manager;
  expect(manager, "manager invited by ENT-00").toBeTruthy();

  // The member id is only exposed as a hidden field of the team screen (the form asks for it).
  const owner = await openEnterprise(browser, "owner", world.owner, "/team");
  const memberRow = rowWith(owner, "Marc Manager");
  await expect(memberRow).toBeVisible();
  const memberId = await memberRow.locator("input[name='userId']").first().inputValue();
  expect(memberId).toMatch(/^[0-9a-f-]{36}$/u);

  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await confirmInDialog(owner, rowWith(agenciesCard(owner), agencyPlateau), "Rattacher un membre", async (dialog) => {
    await dialog.getByLabel("Identifiant du membre").fill(memberId);
    await fillReason(dialog, WORLD_REASON);
  }, "Rattacher");
  await owner.waitForURL(/\/enterprise\?ent=member_assigned/u);
  await expect(notice(owner)).toContainText("Membre rattache a l'agence.");
  await expect(rowWith(agenciesCard(owner), agencyPlateau)).toContainText("1 membre(s)");

  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await expect(rowWith(agenciesCard(owner), agencyPlateau)).toContainText("1 membre(s)");
  await expect(rowWith(agenciesCard(owner), agencyCocody)).toContainText("0 membre(s)");
});

test("ENT-04 un manager consulte l'espace Enterprise mais ne peut pas créer d'agence (réservé au propriétaire)", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const manager = world.members.manager as BackOfficeAccount;
  const page = await openEnterprise(browser, "manager", manager);
  await expect(agenciesCard(page)).toContainText(agencyPlateau);

  const agencies = agenciesCard(page);
  await agencies.locator("#agency-name").fill(`Agence Manager ${suffix}`);
  await agencies.locator("#agency-country").fill("CI");
  await agencies.locator("#agency-reason").fill(WORLD_REASON);
  await agencies.getByRole("button", { name: "Creer une agence" }).click();
  await page.waitForURL(/\/enterprise\?ent=forbidden/u);
  await expect(notice(page)).toContainText("Action reservee au proprietaire d'un cabinet Enterprise.");
  await expect(page.getByText(`Agence Manager ${suffix}`)).toHaveCount(0);
});

test("ENT-05 l'admin fixe l'objectif SLA contractuel sur la fiche du courtier et le retrouve dans la synthèse et le tableau SLA", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const admin = await openAdminPartner(browser);
  const identity = card(admin, "Fiche d'identité");
  await identity.getByLabel("Objectif SLA contractuel (minutes)").fill(String(CONTRACTUAL_SLA));
  await fillReason(identity, `${WORLD_REASON} - SLA contractuel`);
  await identity.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expectActionSuccess(identity, "update contractual SLA");

  await openAs(admin, superAdminAccount(), `/partners/${world.partnerId}`);
  await expect(card(admin, "Synthèse")).toContainText(`${CONTRACTUAL_SLA} min`);
  await expect(admin.locator("form[data-partner-form='update']").getByLabel("Objectif SLA contractuel (minutes)")).toHaveValue(String(CONTRACTUAL_SLA));

  // The platform SLA table of the directory shows the partner with the same objective.
  await openAs(admin, superAdminAccount(), "/partners");
  const slaTable = card(admin, "Engagement de reactivite (SLA) par partenaire");
  const row = rowWith(slaTable, world.partnerName);
  await expect(row).toContainText("enterprise");
  await expect(row).toContainText(`${CONTRACTUAL_SLA} min`);

  // Findings kept in the report: the admin has no agencies / roles view of a tenant (agencies are tenant-private).
  const adminSees = await admin.getByText(agencyPlateau).count();
  test.info().annotations.push({ type: "finding", description: `agencies of the broker visible on the admin partner page: ${adminSees}` });
});

test("ENT-06 le propriétaire voit l'objectif SLA contractuel, refuse un objectif plus lâche et resserre le sien", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const owner = await openEnterprise(browser, "owner", world.owner);

  // The screen's field enforces the 5 minute minimum before anything is sent.
  const target = slaCard(owner).locator("#sla-target");
  await target.fill("2");
  expect(await target.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await target.fill("20000");
  expect(await target.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);

  // Aligned on the contractual target (idempotent): never rejected, and equal to the admin figure.
  await submitSla(owner, CONTRACTUAL_SLA, WORLD_REASON);
  await expect(notice(owner)).toContainText("Engagement de reactivite enregistre.");
  await expect(slaTarget(owner)).toContainText(`${CONTRACTUAL_SLA} min`);
  await expect(slaCard(owner)).toContainText("Leads mesures");
  await expect(slaCard(owner)).toContainText("Taux de respect");

  // A looser target than the contract is refused (422) and the stored target does not move.
  await submitSla(owner, LOOSER_SLA, WORLD_REASON);
  await expect(notice(owner)).toContainText("Objectif refuse");
  await expect(notice(owner)).toHaveAttribute("data-tone", "warning");
  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await expect(slaTarget(owner)).toContainText(`${CONTRACTUAL_SLA} min`);

  // A tighter target is accepted and persists after a clean reload.
  await submitSla(owner, TIGHTER_SLA, WORLD_REASON);
  await expect(notice(owner)).toContainText("Engagement de reactivite enregistre.");
  await expect(notice(owner)).toHaveAttribute("data-tone", "success");
  await openAs(owner, world.owner, ENTERPRISE_PATH);
  await expect(slaTarget(owner)).toContainText(`${TIGHTER_SLA} min`);
  await expect(owner.locator("#sla-target")).toHaveValue(String(TIGHTER_SLA));
});

test("ENT-07 l'admin retrouve la cible contractuelle du courtier (le contrat prime) et le tableau SLA de la plateforme", async ({ browser }) => {
  world = world ?? (await loadEnterpriseWorld());
  const admin = await openAdminPartner(browser);
  // The broker tightened its own target to 30 min, the contract stays 60 min on the partner record.
  await expect(card(admin, "Synthèse")).toContainText(`${CONTRACTUAL_SLA} min`);
  await expect(card(admin, "Synthèse")).toContainText("SLA mesuré (30 j)");

  await openAs(admin, superAdminAccount(), "/partners");
  const row = rowWith(card(admin, "Engagement de reactivite (SLA) par partenaire"), world.partnerName);
  await expect(row).toBeVisible();
  // Observation for the report: the table shows the contractual target (admin source of truth), the
  // broker page shows the tighter 30 min target.
  const adminTarget = (await row.innerText()).replace(/\s+/gu, " ");
  test.info().annotations.push({ type: "observation", description: `admin SLA table row after the broker tightened to ${TIGHTER_SLA} min: ${adminTarget}` });
});

test("ENT-08 un courtier Starter n'a pas les fonctions Enterprise : la page l'explique et l'API refuse (403)", async ({ browser, request }) => {
  const starter = requireState(loadJourneyState(), "brokerOwner");
  const page = await openEnterprise(browser, "starter", starter);
  await expect(page.getByRole("heading", { name: "Espace Enterprise indisponible" })).toBeVisible();
  await expect(page.getByText("Plan Enterprise requis")).toBeVisible();
  await expect(page.getByText("Votre plan actuel donne acces aux leads et au CRM selon vos permissions.")).toBeVisible();
  // Nothing of the Enterprise space is rendered: no agency form, no SLA form.
  await expect(page.locator("#agency-name")).toHaveCount(0);
  await expect(page.locator("#sla-target")).toHaveCount(0);
  await expect(page.getByText("Organisation du cabinet")).toHaveCount(0);

  // The API refuses the same calls with the Starter owner's own session token.
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === BROKER_TOKEN_COOKIE)?.value;
  expect(token, "broker session token cookie").toBeTruthy();
  const headers = { authorization: `Bearer ${token}` };
  const list = await request.get(`${e2eEnv.apiUrl}/broker/enterprise/agencies`, { headers });
  expect(list.status()).toBe(403);
  const create = await request.post(`${e2eEnv.apiUrl}/broker/enterprise/agencies`, {
    headers,
    data: { name: `Agence Starter ${suffix}`, countryCode: "CI", reason: WORLD_REASON }
  });
  expect(create.status()).toBe(403);
  const sla = await request.put(`${e2eEnv.apiUrl}/broker/enterprise/sla`, { headers, data: { firstActionTargetMinutes: 30, reason: WORLD_REASON } });
  expect(sla.status()).toBe(403);
  const roles = await request.get(`${e2eEnv.apiUrl}/broker/enterprise/roles`, { headers });
  expect(roles.status()).toBe(403);

  // Informational: the SLA read route is open to every broker (assertBroker, not assertEnterprise).
  const slaRead = await request.get(`${e2eEnv.apiUrl}/broker/enterprise/sla`, { headers });
  test.info().annotations.push({ type: "observation", description: `GET /broker/enterprise/sla as a Starter owner: ${slaRead.status()}` });

  // Control: the Enterprise owner's token is accepted on the same read route.
  world = world ?? (await loadEnterpriseWorld());
  const owner = await openEnterprise(browser, "owner", world.owner);
  const ownerToken = (await owner.context().cookies()).find((cookie) => cookie.name === BROKER_TOKEN_COOKIE)?.value;
  const control = await request.get(`${e2eEnv.apiUrl}/broker/enterprise/agencies`, { headers: { authorization: `Bearer ${ownerToken}` } });
  expect(control.status()).toBe(200);
});

async function loadEnterpriseWorld(): Promise<BrokerWorld> {
  const loaded = loadWorld("enterprise");
  if (!loaded) throw new Error('broker world "enterprise" missing: run ENT-00 first');
  return loaded;
}
