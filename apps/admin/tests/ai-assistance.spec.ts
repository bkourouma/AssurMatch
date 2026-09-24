import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin AI assistance page exposes computed flags and human-validated insights", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/ai-assistance/page.tsx");
  const actions = source("apps/admin/app/lib/ai-insight-actions.ts");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readAdminAIAssistance");
  expect(api).toContain("/admin/ai/assistance");
  expect(api).toContain("/admin/ai/insights");
  expect(page).toContain("Assistance IA admin");
  expect(page).toContain("validation humaine obligatoire");
  expect(page).toContain("Aucune decision automatisee");
  expect(page).toContain("Valider l'insight");
  expect(page).toContain("{enabled ?");
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/admin/ai/insights/");
  expect(shell).toContain("/ai-assistance");
});

test("broker CRM page surfaces the computed AI assistance status and the partner opt-out", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/crm/page.tsx");

  expect(api).toContain("readBrokerAIAssistance");
  expect(api).toContain("/broker/crm/ai-assistance");
  expect(page).toContain("Assistance IA");
  expect(page).toContain("enabled: {String(aiAssistance.data.enabled)}");
  expect(page).toContain("modelCall: {String(aiAssistance.data.modelCall)}");
  expect(page).toContain("validation humaine obligatoire");
});

test("admin AI copy avoids regulated or advisory wording", () => {
  const page = source("apps/admin/app/ai-assistance/page.tsx").toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});
