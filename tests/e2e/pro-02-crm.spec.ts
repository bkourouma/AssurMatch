import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { requireWorld, saveWorld } from "./support/journey-state";
import { extractLink, waitForMail } from "./support/mailpit";
import { card, escapeRegExp } from "./support/ui";
import { addDays, appPage } from "./support/world";

// Spec 065 - Pro CRM journey (PRD 32.2, 19, 22). Runs on the "pro" world built by pro-01-setup:
// the Propriétaire Pro works the CRM on lead1 (pipeline, note, task, reminder, won), lead2
// (assignment to the agent of the team) and lead3 (lost with a reason). lead4 is left untouched.
// Every step checks the screen first so the journey can be re-run on the same stack.
//
// State written (world "pro", data): lead{1,2,3}AssignmentId, crmBefore (dashboard snapshot taken
// before any action), lead2AdvisorId (actor id of the agent), lead2AssignedTo (agent e-mail).

test.describe.configure({ mode: "serial" });

const NOTE = "Prospect joint par téléphone, intéressé par une formule tous risques (E2E 065)";
const TASK_TITLE = "Préparer le devis tous risques (E2E 065)";
const REMINDER_MESSAGE = "Relancer le prospect après envoi du devis (E2E 065)";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;

/** Pipeline path of lead1 and the extra CRM action done right after reaching a step. */
const LEAD1_STEPS = ["accepte", "contacte", "qualifie", "devis_envoye", "negociation", "gagne"] as const;

const STATUS_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  accepte: "Accepte",
  contacte: "Contacte",
  qualifie: "Qualifie",
  devis_envoye: "Devis envoye",
  negociation: "Negociation",
  gagne: "Gagne",
  perdu: "Perdu"
};

/** The back-office labels are written without accents today; accept both spellings so a copy fix does not break the journey. */
function loose(text: string): string {
  const classes: Record<string, string> = { e: "[eéèê]", a: "[aàâ]", o: "[oô]", i: "[iî]", u: "[uùû]", c: "[cç]" };
  return escapeRegExp(text).replace(/[eaoiuc]/gu, (letter) => classes[letter] as string);
}

function labelRx(text: string): RegExp {
  return new RegExp(`^\\s*${loose(text)}\\s*$`, "u");
}

// Display name given to the team agent by pro-01-setup; the assignment picker lists advisors by name only.
const AGENT_NAME = "Aya Agent";

function statusKey(label: string): string {
  return label.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/gu, "_");
}

const NOTES_TITLE = labelRx("Notes internes");
const TASKS_TITLE = labelRx("Taches commerciales");
const REMINDERS_TITLE = labelRx("Rappels");

function ownerPage(browser: Browser): Promise<Page> {
  return appPage(browser, e2eEnv.brokerUrl);
}

async function openLead(page: Page, account: BackOfficeAccount, assignmentId: string, tab?: "propositions" | "activite" | "historique"): Promise<void> {
  await openAs(page, account, `/crm/leads/${assignmentId}${tab ? `?tab=${tab}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Submits a CRM form (server action + redirect) and checks the outcome code the page was redirected with. */
async function submitCrmForm(page: Page, button: Locator, outcome: string): Promise<void> {
  await button.click();
  await page.waitForURL(/[?&]crm=/u);
  expect(new URL(page.url()).searchParams.get("crm"), `CRM action outcome (${page.url()})`).toBe(outcome);
}

/** Finds a lead of the CRM list by its QR- reference (the list is filled asynchronously after routing). */
async function locateAssignment(page: Page, account: BackOfficeAccount, reference: string): Promise<string> {
  let href = "";
  await expect
    .poll(
      async () => {
        await openAs(page, account, "/crm/leads");
        const link = page.getByRole("row").filter({ hasText: reference }).getByRole("link").first();
        href = (await link.count()) > 0 ? ((await link.getAttribute("href")) ?? "") : "";
        return href;
      },
      { timeout: 60_000, intervals: [2_000, 3_000], message: `lead ${reference} in /crm/leads` }
    )
    .toMatch(UUID);
  return href.match(UUID)?.[0] as string;
}

function currentStatusCell(page: Page) {
  return page.locator("dl.bo-dl > div").filter({ has: page.locator("dt", { hasText: /^Statut$/u }) }).locator("dd");
}

async function readStatusKey(page: Page): Promise<string> {
  await expect(currentStatusCell(page)).toBeVisible();
  return statusKey(await currentStatusCell(page).innerText());
}

async function changeStatus(page: Page, account: BackOfficeAccount, assignmentId: string, status: string, reason?: string): Promise<void> {
  await openLead(page, account, assignmentId);
  const form = card(page, labelRx("Changer le statut"));
  await form.locator("#crm-new-status").selectOption(status);
  if (reason) await form.locator("#crm-status-reason").selectOption(reason);
  await submitCrmForm(page, form.getByRole("button", { name: "Enregistrer le statut" }), "status_changed");
  await expect(page.locator(".bo-notice").filter({ hasText: /Statut du lead mis [aà] jour et historis/u }), "result notice").not.toHaveCount(0);
  await expect(currentStatusCell(page)).toHaveText(labelRx(STATUS_LABELS[status] ?? status));
}

async function activityCount(page: Page, account: BackOfficeAccount, assignmentId: string, title: RegExp, text: string): Promise<number> {
  await openLead(page, account, assignmentId, "activite");
  return card(page, title).getByText(text).count();
}

async function ensureNote(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<void> {
  if ((await activityCount(page, account, assignmentId, NOTES_TITLE, NOTE)) > 0) return;
  const notes = card(page, NOTES_TITLE);
  await notes.locator("#crm-note-body").fill(NOTE);
  await submitCrmForm(page, notes.getByRole("button", { name: "Ajouter une note" }), "note_created");
  await expect(page.locator(".bo-notice").filter({ hasText: /Note interne ajout/u }), "result notice").not.toHaveCount(0);
  await expect(page.locator(".bo-notice").filter({ hasText: /invisible c[oô]t[eé] Web Publique Client/u }), "result notice").not.toHaveCount(0);
  expect(await activityCount(page, account, assignmentId, NOTES_TITLE, NOTE), "note listed on the activity tab").toBe(1);
}

/** Due dates are in the future (inside the 14-day "à venir" window of the dashboard). */
function dueIn(days: number): { input: string; date: string } {
  const due = addDays(new Date(), days);
  due.setUTCHours(10, 0, 0, 0);
  return { input: due.toISOString().slice(0, 16), date: due.toISOString().slice(0, 10) };
}

async function ensureTask(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<void> {
  if ((await activityCount(page, account, assignmentId, TASKS_TITLE, TASK_TITLE)) > 0) return;
  const due = dueIn(3);
  const tasks = card(page, TASKS_TITLE);
  await tasks.locator("#crm-task-title").fill(TASK_TITLE);
  await tasks.locator("#crm-task-due").fill(due.input);
  await submitCrmForm(page, tasks.getByRole("button", { name: "Ajouter une tache" }), "task_created");
  await expect(page.locator(".bo-notice").filter({ hasText: /T[aâ]che commerciale cr/u }), "result notice").not.toHaveCount(0);
  await openLead(page, account, assignmentId, "activite");
  await expect(card(page, TASKS_TITLE).getByRole("listitem").filter({ hasText: TASK_TITLE })).toContainText(due.date);
}

async function ensureReminder(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<void> {
  if ((await activityCount(page, account, assignmentId, REMINDERS_TITLE, REMINDER_MESSAGE)) > 0) return;
  const due = dueIn(2);
  const reminders = card(page, REMINDERS_TITLE);
  await reminders.locator("#crm-reminder-at").fill(due.input);
  await reminders.locator("#crm-reminder-message").fill(REMINDER_MESSAGE);
  await submitCrmForm(page, reminders.getByRole("button", { name: "Ajouter un rappel" }), "reminder_created");
  await expect(page.locator(".bo-notice").filter({ hasText: /Rappel programm/u }), "result notice").not.toHaveCount(0);
  await openLead(page, account, assignmentId, "activite");
  await expect(card(page, REMINDERS_TITLE).getByRole("listitem").filter({ hasText: REMINDER_MESSAGE })).toContainText(due.date);
}

async function historyEntries(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<string[]> {
  await openLead(page, account, assignmentId, "historique");
  const items = card(page, labelRx("Historique CRM")).locator("ol > li");
  await expect(items.first()).toBeVisible();
  return (await items.allInnerTexts()).map((text) => text.replace(/\s+/gu, " ").trim());
}

/** Every pattern must be found, in this order (a re-run leaves older events in front, which is fine). */
function expectInOrder(entries: string[], patterns: RegExp[]): void {
  let from = 0;
  for (const pattern of patterns) {
    const index = entries.findIndex((entry, position) => position >= from && pattern.test(entry));
    expect(index, `history entry ${pattern} after position ${from} in:\n${entries.join("\n")}`).toBeGreaterThanOrEqual(0);
    from = index + 1;
  }
}

function statusChange(previous: string, next: string, reason?: string): RegExp {
  const arrow = `${loose(STATUS_LABELS[previous] ?? previous)}\\s*->\\s*${loose(STATUS_LABELS[next] ?? next)}`;
  return new RegExp(`${loose("Changement de statut")}\\s*\\(${arrow}\\)${reason ? `.*${loose("motif")}\\s*:\\s*${loose(reason)}` : ""}`, "u");
}

interface DashboardSnapshot {
  /** Pipeline table: normalised status label -> total. */
  pipeline: Record<string, number>;
  upcomingTasks: number;
  upcomingReminders: number;
  pipelineKpi: number;
}

async function kpiValue(page: Page, label: string): Promise<number> {
  const kpi = page.locator("section[aria-label='Indicateurs CRM'] article.bo-kpi").filter({ has: page.locator(".bo-kpi__label", { hasText: labelRx(label) }) });
  await expect(kpi, `KPI ${label}`).toHaveCount(1);
  return Number.parseInt((await kpi.locator(".bo-kpi__value").innerText()).replace(/\D/gu, ""), 10);
}

async function readDashboard(page: Page, account: BackOfficeAccount): Promise<DashboardSnapshot> {
  await openAs(page, account, "/crm");
  // The CRM section is only there when broker_crm_enabled is open and the plan is Pro (set up by pro-01).
  await expect(page.getByRole("heading", { level: 1, name: "Pipeline commercial" })).toBeVisible();
  await expect(page.getByText("Section CRM indisponible")).toHaveCount(0);
  const rows = card(page, labelRx("Pipeline par statut")).locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const pipeline: Record<string, number> = {};
  for (const row of await rows.all()) {
    const cells = await row.locator("td").allInnerTexts();
    if (cells.length < 2) continue;
    pipeline[statusKey(cells[0] as string)] = Number.parseInt((cells[1] as string).replace(/\D/gu, ""), 10);
  }
  return {
    pipeline,
    upcomingTasks: await kpiValue(page, "Taches a venir"),
    upcomingReminders: await kpiValue(page, "Rappels a venir"),
    pipelineKpi: await kpiValue(page, "Statuts pipeline")
  };
}

function total(snapshot: DashboardSnapshot): number {
  return Object.values(snapshot.pipeline).reduce((sum, value) => sum + value, 0);
}

function kanbanColumn(page: Page, label: string) {
  // Drag-and-drop Kanban: one <section data-kanban-column="<status key>"> per status, one <li data-kanban-card> per lead.
  return page.locator(`[data-kanban-column='${statusKey(label)}']`);
}

test("PRO-CRM-01 le lead apparaît dans la liste CRM et dans le Kanban (colonne Nouveau) et le tableau de bord CRM est actif", async ({ browser }) => {
  const world = requireWorld("pro");
  const page = await ownerPage(browser);

  // The list works with the broker_crm_enabled flag opened by the set-up and shows the status and the reference.
  for (const index of [1, 2, 3]) {
    const reference = world.data[`lead${index}Ref`] as string;
    const assignmentId = await locateAssignment(page, world.owner, reference);
    world.data[`lead${index}AssignmentId`] = assignmentId;
    const row = page.getByRole("row").filter({ hasText: reference });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("CI");
  }
  saveWorld("pro", world);

  // Kanban: a lead that nobody touched starts in the "Nouveau" column. On a re-run the leads may already have moved on.
  const firstRun = world.data.crmBefore === undefined;
  await openAs(page, world.owner, "/crm/kanban");
  await expect(page.getByRole("heading", { level: 1, name: "Vue Kanban" })).toBeVisible();
  await expect(page.getByText("Acces CRM refuse")).toHaveCount(0);
  for (const index of [1, 2, 3]) {
    const reference = world.data[`lead${index}Ref`] as string;
    const assignmentId = world.data[`lead${index}AssignmentId`] as string;
    if (firstRun) {
      const column = kanbanColumn(page, "Nouveau");
      await expect(column.locator(`a[href='/crm/leads/${assignmentId}']`), `${reference} in column Nouveau`).toHaveText(reference);
    } else {
      await expect(page.locator(`[data-kanban-card] a[href='/crm/leads/${assignmentId}']`), `${reference} somewhere in the Kanban`).toHaveCount(1);
    }
  }
  // The lead opened from the Kanban is the CRM sheet of the same lead.
  await page.locator(`[data-kanban-card] a[href='/crm/leads/${world.data.lead1AssignmentId}']`).click();
  await page.waitForURL(new RegExp(`/crm/leads/${world.data.lead1AssignmentId}`, "u"));
  await expect(page.getByRole("heading", { level: 1, name: world.data.lead1Ref as string })).toBeVisible();

  // Dashboard "before" snapshot, kept for the deltas of PRO-CRM-05 (taken once, before any CRM action).
  const before = await readDashboard(page, world.owner);
  expect(total(before), "the CRM dashboard counts the 4 leads of the set-up").toBeGreaterThanOrEqual(4);
  expect(before.pipelineKpi, "KPI Statuts pipeline = rows of the pipeline table").toBe(Object.keys(before.pipeline).length);
  if (firstRun) {
    world.data.crmBefore = JSON.stringify(before);
    saveWorld("pro", world);
  }
  await page.context().close();
});

test("PRO-CRM-02 lead1 : pipeline étape par étape, note interne, tâche et rappel datés, issue Gagné", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  const world = requireWorld("pro");
  const leadId = world.data.lead1AssignmentId as string;
  const page = await ownerPage(browser);

  // Status machine: no step is forbidden between pipeline statuses and only loss statuses need a reason.
  await openLead(page, world.owner, leadId);
  const startKey = await readStatusKey(page);
  const startIndex = startKey === "nouveau" ? -1 : LEAD1_STEPS.indexOf(startKey as (typeof LEAD1_STEPS)[number]);
  expect(startKey === "nouveau" || startIndex >= 0, `lead1 starts in "nouveau" or on its own path (got ${startKey})`).toBe(true);

  for (const [index, step] of LEAD1_STEPS.entries()) {
    if (index > startIndex) await changeStatus(page, world.owner, leadId, step);
    if (step === "contacte") await ensureNote(page, world.owner, leadId);
    if (step === "qualifie") await ensureTask(page, world.owner, leadId);
    if (step === "devis_envoye") await ensureReminder(page, world.owner, leadId);
  }
  // Won needs no reason: the sheet keeps the final status and no loss reason is attached to it.
  await openLead(page, world.owner, leadId);
  await expect(currentStatusCell(page)).toHaveText(labelRx("Gagne"));

  // Activity tab: note, task (with its due date) and reminder (with its date and message).
  await openLead(page, world.owner, leadId, "activite");
  await expect(card(page, NOTES_TITLE).getByRole("listitem").filter({ hasText: NOTE })).toHaveCount(1);
  await expect(card(page, TASKS_TITLE).getByRole("listitem").filter({ hasText: TASK_TITLE })).toHaveCount(1);
  await expect(card(page, REMINDERS_TITLE).getByRole("listitem").filter({ hasText: REMINDER_MESSAGE })).toHaveCount(1);
  await page.context().close();

  // Visitor side: the tracking page of the request never shows the internal note, task or reminder (PRD 22, constitution III).
  const mail = await waitForMail({ to: world.data.lead1Email as string, body: new RegExp(world.data.lead1Ref as string, "u") });
  const trackingLink = extractLink(mail, new RegExp(`/demandes-de-devis/${world.data.lead1Ref}\\?token=`, "u"));
  const visitor = await appPage(browser, e2eEnv.publicUrl);
  await visitor.goto(trackingLink);
  await expect(visitor.getByText(world.data.lead1Ref as string).first()).toBeVisible();
  const visitorText = await visitor.locator("main").innerText();
  for (const internal of [NOTE, TASK_TITLE, REMINDER_MESSAGE, "Note interne", "Rappel programm"]) {
    expect(visitorText, `visitor tracking page must not expose "${internal}"`).not.toContain(internal);
  }
  await visitor.context().close();
});

test("PRO-CRM-03 lead2 : le propriétaire l'assigne à l'agent de l'équipe, l'affectation figure sur la fiche et dans l'historique", async ({ browser }) => {
  const world = requireWorld("pro");
  const agent = world.members.agent as BackOfficeAccount;
  const leadId = world.data.lead2AssignmentId as string;

  // The assign form is a named picker (no raw id); the agent actor id is still read on /account to check the stored assignment.
  const agentPage = await ownerPage(browser);
  await openAs(agentPage, agent, "/account");
  const actorCell = agentPage.locator("dl.bo-dl > div").filter({ has: agentPage.locator("dt", { hasText: /^Acteur$/u }) }).locator("dd");
  await expect(actorCell).toHaveText(UUID);
  const agentId = (await actorCell.innerText()).trim();
  await agentPage.context().close();

  const page = await ownerPage(browser);
  await openLead(page, world.owner, leadId);
  const assignCard = card(page, labelRx("Conseiller assigne"));
  await expect(assignCard.getByRole("button", { name: "Assigner au conseiller" })).toBeVisible();
  if ((await assignCard.getByText(`Conseiller actuel : ${AGENT_NAME}`).count()) === 0) {
    // Options read "<name> (<role>)": pick the one that starts with the agent name.
    const picker = assignCard.locator("#crm-advisor-id");
    const optionLabel = (await picker.locator("option").allInnerTexts()).map((text) => text.trim()).find((text) => text.startsWith(AGENT_NAME));
    expect(optionLabel, "the agent is listed by name in the picker").toBeDefined();
    await picker.selectOption({ label: optionLabel as string });
    await submitCrmForm(page, assignCard.getByRole("button", { name: "Assigner au conseiller" }), "assigned");
    await expect(page.locator(".bo-notice").filter({ hasText: /Lead assign/u }), "result notice").not.toHaveCount(0);
  }
  await expect(card(page, labelRx("Conseiller assigne")).getByText(`Conseiller actuel : ${AGENT_NAME}`)).toBeVisible();
  await expect(page.locator("dl.bo-dl > div").filter({ has: page.locator("dt", { hasText: /^Conseiller$/u }) }).locator("dd")).toHaveText(AGENT_NAME);

  // History and list show the assignment.
  expectInOrder(await historyEntries(page, world.owner, leadId), [new RegExp(loose("Lead assigne a un conseiller"), "u")]);
  await openAs(page, world.owner, "/crm/leads");
  await expect(page.getByRole("row").filter({ hasText: world.data.lead2Ref as string })).toContainText(AGENT_NAME);
  await page.context().close();

  world.data.lead2AdvisorId = agentId;
  world.data.lead2AssignedTo = agent.email;
  saveWorld("pro", world);

  // The assignment takes effect: the agent now finds lead2 in his own CRM list (detailed role checks: pro-03).
  const agentSession = await ownerPage(browser);
  await openAs(agentSession, agent, "/crm/leads");
  await expect(agentSession.getByRole("row").filter({ hasText: world.data.lead2Ref as string })).toHaveCount(1);
  await agentSession.context().close();
});

test("PRO-CRM-04 lead3 : marqué Perdu avec un motif obligatoire, l'historique le montre", async ({ browser }) => {
  const world = requireWorld("pro");
  const leadId = world.data.lead3AssignmentId as string;
  const page = await ownerPage(browser);

  await openLead(page, world.owner, leadId);
  if ((await readStatusKey(page)) !== "perdu") {
    // A loss status without reason is refused by the sheet before any API call.
    const form = card(page, labelRx("Changer le statut"));
    await form.locator("#crm-new-status").selectOption("perdu");
    await submitCrmForm(page, form.getByRole("button", { name: "Enregistrer le statut" }), "reason_required");
    await expect(page.locator(".bo-notice").filter({ hasText: /motif allowlist/u }), "result notice").not.toHaveCount(0);
    await expect(currentStatusCell(page)).toHaveText(labelRx("Nouveau"));
    await changeStatus(page, world.owner, leadId, "perdu", "price");
  }
  await openLead(page, world.owner, leadId);
  await expect(currentStatusCell(page)).toHaveText(labelRx("Perdu"));

  expectInOrder(await historyEntries(page, world.owner, leadId), [statusChange("nouveau", "perdu", "Prix")]);

  await openAs(page, world.owner, "/crm/kanban");
  await expect(kanbanColumn(page, "Perdu").locator(`a[href='/crm/leads/${leadId}']`)).toHaveText(world.data.lead3Ref as string);
  await page.context().close();
});

test("PRO-CRM-05 historique complet de lead1 dans l'ordre chronologique et indicateurs du tableau de bord CRM", async ({ browser }) => {
  const world = requireWorld("pro");
  const leadId = world.data.lead1AssignmentId as string;
  const before = JSON.parse(world.data.crmBefore as string) as DashboardSnapshot;
  const page = await ownerPage(browser);

  // Chronological history: six status changes with the note, the task and the reminder where they were done.
  const entries = await historyEntries(page, world.owner, leadId);
  expectInOrder(entries, [
    statusChange("nouveau", "accepte"),
    statusChange("accepte", "contacte"),
    new RegExp(loose("Note interne ajoutee"), "u"),
    statusChange("contacte", "qualifie"),
    new RegExp(loose("Tache commerciale creee"), "u"),
    statusChange("qualifie", "devis_envoye"),
    new RegExp(loose("Rappel programme"), "u"),
    statusChange("devis_envoye", "negociation"),
    statusChange("negociation", "gagne")
  ]);
  for (const entry of entries) expect(entry, "every history entry carries its date").toMatch(/^\d{4}-\d{2}-\d{2} - /u);
  const dates = entries.map((entry) => entry.slice(0, 10));
  expect(dates, "history is in chronological order").toEqual([...dates].sort());

  // Dashboard: deterministic deltas against the snapshot of PRO-CRM-01 (the refresh is asynchronous: poll).
  let after = before;
  await expect
    .poll(
      async () => {
        after = await readDashboard(page, world.owner);
        return {
          won: (after.pipeline.gagne ?? 0) - (before.pipeline.gagne ?? 0),
          lost: (after.pipeline.perdu ?? 0) - (before.pipeline.perdu ?? 0),
          tasks: after.upcomingTasks - before.upcomingTasks,
          reminders: after.upcomingReminders - before.upcomingReminders,
          leads: total(after) - total(before)
        };
      },
      { timeout: 60_000, intervals: [2_000, 3_000, 5_000], message: "CRM dashboard deltas (lead1 won, lead3 lost, 1 task, 1 reminder, same number of leads)" }
    )
    .toEqual({ won: 1, lost: 1, tasks: 1, reminders: 1, leads: 0 });
  expect(after.pipelineKpi, "KPI Statuts pipeline = rows of the pipeline table").toBe(Object.keys(after.pipeline).length);

  // The agent assigned to lead2 appears in the advisor performance table.
  const advisors = card(page, labelRx("Performance par conseiller"));
  await expect(advisors).toBeVisible();
  const advisorRow = advisors.getByRole("row").filter({ hasText: AGENT_NAME });
  await expect(advisorRow).toHaveCount(1);
  const received = Number.parseInt(((await advisorRow.locator("td").nth(1).innerText()) || "0").replace(/\D/gu, ""), 10);
  expect(received, "leads received by the assigned advisor").toBeGreaterThanOrEqual(1);

  // Kanban: lead1 is in the Gagné column.
  await openAs(page, world.owner, "/crm/kanban");
  await expect(kanbanColumn(page, "Gagne").locator(`a[href='/crm/leads/${leadId}']`)).toHaveText(world.data.lead1Ref as string);
  await page.context().close();
});
