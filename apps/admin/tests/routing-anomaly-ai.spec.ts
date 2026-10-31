import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { routingAnomalyAiDisabledReason } from "../app/routing/anomalies/ai-state";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const PAGE = "apps/admin/app/routing/anomalies/page.tsx";
const ACTIONS = "apps/admin/app/lib/routing-anomaly-actions.ts";

test("routing anomalies page keeps the deterministic report intact (spec 064 FR-004)", () => {
  const page = source(PAGE);
  expect(page).toContain("readRoutingAnomalies");
  expect(page).toContain("Anomalies de routage");
  expect(page).toContain("Anomalies détectées");
  expect(page).toContain("Recommandations");
  expect(page).toContain("data.totalAnomalies");
  expect(page).toContain("data.criticalCount");
  expect(page).toContain("data.warningCount");
  expect(page).toContain("data.anomalies");
  // The deterministic card renders before the AI card, which only degrades on its own.
  expect(page.indexOf(`<Card title="Anomalies détectées"`)).toBeLessThan(page.indexOf(`title="Analyse IA (assistance)"`));
});

test("the AI analysis card is labelled as indicative assistance and states its guardrails", () => {
  const page = source(PAGE);
  expect(page).toContain("Analyse IA (assistance)");
  expect(page).toContain("Assistance IA");
  expect(page).toContain("indicative");
  expect(page).toContain("validée par un humain");
  expect(page).toContain("rien n&apos;est appliqué automatiquement");
  expect(page).toContain("Aucune décision de routage ni aucune réaffectation");
  expect(page).toContain("aucune donnée prospect");
  expect(page).toContain("Analyses récentes");
  expect(page).toContain("routing_anomaly_analysis");
});

test("the request button is disabled with a visible explanation when the AI assistance is unavailable", () => {
  const page = source(PAGE);
  expect(page).toContain("ai_routing_anomaly_detection_enabled");
  expect(page).toContain("readAdminAIAssistance");
  expect(page).toContain("listAdminAiInsights");
  expect(page).toContain("disabled={disabledReason !== null}");
  expect(page).toContain("routingAnomalyAiDisabledReason");
  const state = source("apps/admin/app/routing/anomalies/ai-state.ts");
  expect(state).toContain("est coupé");
  expect(state).toContain("l'assistance IA admin est coupée");
  expect(state).toContain("le rôle AI Admin (ai:*) est requis");
  // The status endpoint has no per-flag entry for this assist type: the page must not look the flag up in `flags`.
  expect(page).not.toContain("flags.find");
  // Admins without the AI capability never trigger the audited AI reads.
  expect(page).toContain("roleAllowed ? await Promise.all");
  expect(page).toContain('role="note"');
  expect(page).toContain("readBackOfficeSession");
  // The card is always rendered: the disabled state never hides it.
  expect(page).not.toContain("{disabledReason ? <Card");
});

test("analyses are listed with human validation and no execution control", () => {
  const page = source(PAGE);
  expect(page).toContain("Valider l'analyse");
  expect(page).toContain("Écarter l'analyse");
  expect(page).toContain('insight.humanValidationStatus === "pending"');
  expect(page).toContain("validateRoutingAnomalyAnalysisAction");
  expect(page).toContain("requestRoutingAnomalyAnalysisAction");
  expect(page).toContain("insight.outputText");
  expect(page).toContain("insight.refusalReason");
  for (const forbidden of ["reassign", "Réaffecter", "Réaffecter", "Appliquer automatiquement"]) {
    expect(page, forbidden).not.toContain(forbidden);
  }
});

test("routing anomaly server actions only request the analysis and record the human decision", () => {
  const actions = source(ACTIONS);
  expect(actions.trimStart().startsWith('"use server"')).toBe(true);
  expect(actions).toContain("/admin/routing/anomalies/analyze");
  expect(actions).toContain('language: "fr"');
  expect(actions).toContain("/admin/ai/insights/${insightId}/validation");
  expect(actions).toContain("UUID.test(insightId)");
  expect(actions).toContain("Authorization: `Bearer ${token}`");
  expect(actions).toContain("/routing/anomalies");
  expect(actions).toContain("loginRedirect");
  for (const outcome of ["forbidden", "quota", "disabled", "error", "queued", "validated"]) {
    expect(actions, outcome).toContain(outcome);
  }
  expect(actions).not.toContain("/reassign");
  expect(actions).not.toContain("/routing/rules");
});

test("the AI assistance page labels routing analyses without adding a request button for them", () => {
  const page = source("apps/admin/app/ai-assistance/page.tsx");
  expect(page).toContain("routing_anomaly_analysis");
  const insightLabels = page.slice(page.indexOf("const INSIGHT_LABELS"), page.indexOf("const DISPLAY_ONLY_LABELS"));
  expect(insightLabels).not.toContain("routing_anomaly_analysis");
});

test("the button state follows the assistance status, not a per-flag entry", () => {
  const base = { roleAllowed: true, forbidden: false, statusRead: true, enabled: true, availableAssistTypes: ["routing_anomaly_analysis"] };
  expect(routingAnomalyAiDisabledReason(base)).toBeNull();
  expect(routingAnomalyAiDisabledReason({ ...base, roleAllowed: false })).toContain("AI Admin");
  expect(routingAnomalyAiDisabledReason({ ...base, forbidden: true })).toContain("AI Admin");
  expect(routingAnomalyAiDisabledReason({ ...base, statusRead: false })).toContain("n'a pas pu être lu");
  expect(routingAnomalyAiDisabledReason({ ...base, enabled: false })).toContain("est coupée");
  // enabled but this assist type is not among the enabled ones: the flag is off.
  expect(routingAnomalyAiDisabledReason({ ...base, availableAssistTypes: ["admin_risk_triage"] })).toContain("ai_routing_anomaly_detection_enabled");
});
