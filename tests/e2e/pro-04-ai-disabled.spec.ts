import { expect, test, type Page } from "@playwright/test";
import { openAs } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { requireWorld, type BrokerWorld } from "./support/journey-state";
import {
  apiCall,
  asRecord,
  assignmentIds,
  closeSessions,
  itemsOf,
  recordRequests,
  tokenFor,
  visit
} from "./support/pro-roles";
import { card } from "./support/ui";
import { appPage, superAdminAccount } from "./support/world";

// Spec 065 - PRO-AI: every AI flag is off by default (PRD 32.7, constitution: AI is fail-closed and
// only switched on by a compliance policy command, never by the E2E journeys). With the flags off:
//   - the admin flags screen shows every ai_* flag as "Desactive" and offers no switch on the sensitive ones;
//   - the Pro CRM offers no AI action (lead panel hidden, dashboard card says enabled: false) and its
//     pages issue no AI request nor server action;
//   - the API answers a direct AI request with a refusal and creates no usable suggestion;
//   - the public quote journey offers no assistant.

test.describe.configure({ mode: "serial" });

const AI_FLAG_KEYS = [
  "ai_summary_enabled",
  "ai_lead_scoring_enabled",
  "ai_duplicate_detection_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled",
  "ai_routing_anomaly_detection_enabled"
];

/** Buttons of the lead AI panel (lead-ai-panel.tsx) and of its human validation. */
const AI_ACTION_LABELS = [
  "Résumé du lead",
  "Score indicatif du lead",
  "Prochaine action suggérée",
  "Brouillon de message de relance",
  "Classification indicative",
  "Indice de doublon",
  "Valider la suggestion",
  "Écarter la suggestion"
];

const LEAD_TABS = ["", "?tab=propositions", "?tab=activite", "?tab=historique"];
/** A browser request that would reach an AI route of the API or call an AI server action. */
const AI_URL = /\/ai(\/|\?|$)|ai-assistance|assistType/u;

let world: BrokerWorld;
let lead4Id = "";
let ownerToken = "";

test.beforeAll(() => {
  world = requireWorld("pro");
});

test.afterAll(async () => {
  await closeSessions();
});

async function expectNoAiAction(page: Page): Promise<void> {
  for (const label of AI_ACTION_LABELS) {
    await expect(page.getByRole("button", { name: label, exact: true }), `button ${label}`).toHaveCount(0);
  }
  await expect(page.locator("input[name='assistType']")).toHaveCount(0);
  await expect(page.getByText("Assistance IA d'aide à la compréhension")).toHaveCount(0);
  await expect(page.getByText("Aucune suggestion IA pour ce lead.")).toHaveCount(0);
}

test("PRO-AI-01 tous les flags IA sont désactivés dans l'écran admin des feature flags", async ({ browser }) => {
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  await expect(admin.getByRole("heading", { name: "Feature flags", exact: true })).toBeVisible();

  // Every ai_* flag the screen lists (switchable or read-only) shows "Desactive".
  const aiCodes = admin.locator("code").filter({ hasText: /^ai_/u });
  const listed = (await aiCodes.allInnerTexts()).map((text) => text.trim());
  for (const key of listed) {
    const row = admin.getByRole("row").filter({ has: admin.locator("code", { hasText: new RegExp(`^${key}$`, "u") }) }).first();
    await expect(row.getByText("Désactivé", { exact: true }), `${key} is off`).toBeVisible();
    await expect(row.getByText("Actif", { exact: true }), `${key} is not on`).toHaveCount(0);
  }
  // Flags that never appear as a row are fail-closed (default false): the reference note names them.
  const unlisted = AI_FLAG_KEYS.filter((key) => !listed.includes(key));
  expect(listed.length + unlisted.length).toBeGreaterThanOrEqual(AI_FLAG_KEYS.length);

  // The sensitive modules table offers no switch at all.
  const sensitive = card(admin, "Modules sensibles (lecture seule)");
  await expect(sensitive).toBeVisible();
  await expect(sensitive.getByRole("button")).toHaveCount(0);
  await expect(admin.getByText("Cette interface ne crée aucun bouton d'activation pour les modules réglementés.")).toBeVisible();
  await admin.context().close();
});

test("PRO-AI-02 le CRM Pro n'offre aucune action IA et la carte Assistance IA annonce Assistance désactivée et aucun appel à un modèle", async ({ browser }) => {
  const ids = await assignmentIdsFor(browser);
  lead4Id = ids.lead4 as string;

  const page = await visit(browser, world.owner, "/crm");
  const recorder = recordRequests(page);
  await page.goto("/crm");
  await page.waitForLoadState("networkidle");
  const aiCard = card(page, "Assistance IA");
  await expect(aiCard).toBeVisible();
  await expect(aiCard).toContainText(/Assistance\s*Désactivée/u);
  await expect(aiCard).toContainText(/Appel à un modèle\s*Non/u);
  await expect(aiCard).toContainText("validation humaine obligatoire");
  await expect(aiCard.getByText("Assistance IA désactivée par les feature flags", { exact: false })).toBeVisible();
  await expectNoAiAction(page);

  // The four tabs of the lead sheet: no AI panel, no AI form.
  for (const tab of LEAD_TABS) {
    await page.goto(`/crm/leads/${lead4Id}${tab}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("CRM autorisé")).toBeVisible();
    await expectNoAiAction(page);
  }
  recorder.stop();

  // The browser only sees its own app: no request to an AI route, and no server action POST.
  const aiRequests = recorder.all.filter((entry) => AI_URL.test(entry.url));
  expect(aiRequests, "browser requests to an AI route").toEqual([]);
  const posts = recorder.all.filter((entry) => entry.method === "POST");
  expect(posts, "no POST (server action) while reading the CRM").toEqual([]);
});

test("PRO-AI-03 l'API refuse l'assistance IA au cabinet Pro et ne crée aucune suggestion exploitable", async ({ browser }) => {
  ownerToken = await tokenFor(browser, world.owner);

  const status = await apiCall(ownerToken, "GET", "/broker/crm/ai-assistance");
  expect(status.status).toBe(200);
  const assistance = asRecord(status.body);
  expect(assistance.enabled).toBe(false);
  expect(assistance.modelCall).toBe(false);
  expect(assistance.humanValidationRequired).toBe(true);
  const flags = Array.isArray(assistance.flags) ? (assistance.flags as Array<Record<string, unknown>>) : [];
  expect(flags.length).toBeGreaterThan(0);
  for (const flag of flags) expect(flag.value, `${String(flag.key)} is off`).toBe(false);

  const usable = async () => {
    const list = await apiCall(ownerToken, "GET", `/broker/crm/leads/${lead4Id}/ai`);
    expect(list.status).toBe(200);
    return itemsOf(list).filter((item) => item.status !== "refused");
  };
  expect(await usable(), "no usable AI suggestion before").toEqual([]);

  // Direct calls to the AI endpoints used by the panel (crm-ai-actions.ts): refused, never queued.
  for (const assistType of ["lead_summary", "lead_score", "duplicate_hint"]) {
    const result = await apiCall(ownerToken, "POST", `/broker/crm/leads/${lead4Id}/ai/${assistType}`, { language: "fr" });
    if (result.status >= 200 && result.status < 300) {
      const interaction = asRecord(result.body);
      expect(interaction.status, `${assistType} answer`).toBe("refused");
      expect(interaction.refusalReason).toBe("ai_disabled");
      expect(interaction.outputText ?? null).toBeNull();
    } else {
      expect([403, 404, 422], `${assistType} refusal status`).toContain(result.status);
    }
  }
  expect(await usable(), "no usable AI suggestion after").toEqual([]);

  // Validating a non-existent suggestion is refused too (nothing to validate).
  const validation = await apiCall(ownerToken, "POST", "/broker/crm/ai/interactions/00000000-0000-4000-8000-000000000000/validation", { decision: "approved" });
  expect([403, 404, 422]).toContain(validation.status);

  // The lead page still shows no panel, even with the refusal records now in the history.
  const page = await visit(browser, world.owner, `/crm/leads/${lead4Id}?tab=activite`);
  await expectNoAiAction(page);
});

test("PRO-AI-04 le parcours public de devis ne propose aucun assistant", async ({ browser }) => {
  const availability = await apiCall(undefined, "GET", "/ai/visitor/availability?countryCode=CI&productKey=auto");
  expect(availability.status).toBe(200);
  const entries = Array.isArray(availability.body) ? (availability.body as Array<Record<string, unknown>>) : [];
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) expect(entry.enabled, `${String(entry.assistType)} disabled for the public`).toBe(false);

  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const recorder = recordRequests(visitor);
  for (const path of ["/pays/CI/produits/auto", "/pays/CI/produits/auto/devis"]) {
    await visitor.goto(path);
    await visitor.waitForLoadState("networkidle");
    await expect(visitor.locator("main")).toBeVisible();
    await expect(visitor.locator("[data-visitor-ai]"), `assistant on ${path}`).toHaveCount(0);
    await expect(visitor.getByText("Réponse générée automatiquement par un outil d'IA")).toHaveCount(0);
  }
  recorder.stop();
  const posts = recorder.all.filter((entry) => entry.method === "POST" && /\/ai\//u.test(entry.url));
  expect(posts, "no visitor AI request").toEqual([]);
  await visitor.context().close();
});

async function assignmentIdsFor(browser: Parameters<typeof tokenFor>[0]): Promise<Record<string, string>> {
  const token = await tokenFor(browser, world.owner);
  return assignmentIds(token, { lead4: world.data.lead4Ref as string });
}
