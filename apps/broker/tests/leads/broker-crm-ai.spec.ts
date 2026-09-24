import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker CRM AI panel is gated by assistance status and keeps humans in control", () => {
  const panel = source("apps/broker/app/crm/leads/[leadAssignmentId]/lead-ai-panel.tsx");
  const detail = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");
  const actions = source("apps/broker/app/lib/crm-ai-actions.ts");
  const crm = source("apps/broker/app/crm/page.tsx");

  expect(panel).toContain("if (!enabled) return null");
  expect(panel).toContain("Suggestions IA a valider");
  expect(panel).toContain("le courtier decide");
  expect(panel).toContain("Valider la suggestion");
  expect(detail).toContain("readCrmLeadDetail(leadAssignmentId)");
  expect(detail).toContain("listLeadAiInteractions(leadAssignmentId)");
  expect(detail).toContain("<LeadAiPanel");
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/ai/interactions/");
  expect(actions).toContain("/broker/crm/ai/opt-out");
  expect(crm).toContain("setAiOptOutAction");
  expect(crm).toContain("opt-out cabinet");
});

test("broker AI copy avoids regulated or advisory wording", () => {
  const panel = source("apps/broker/app/crm/leads/[leadAssignmentId]/lead-ai-panel.tsx").toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance", "recommandons officiellement"]) {
    expect(panel).not.toContain(forbidden);
  }
});
