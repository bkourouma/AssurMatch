import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin AI assistance page exposes read-only flags and no model call controls", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/ai-assistance/page.tsx");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readAdminAIAssistance");
  expect(api).toContain("/admin/ai/assistance");
  expect(page).toContain("Assistance IA admin");
  expect(page).toContain("modelCall: false");
  expect(page).toContain("validation humaine obligatoire");
  expect(page).not.toContain("POST");
  expect(page).not.toContain("PATCH");
  expect(shell).toContain("/ai-assistance");
});

test("broker CRM page surfaces AI assistance as disabled metadata", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/crm/page.tsx");

  expect(api).toContain("readBrokerAIAssistance");
  expect(api).toContain("/broker/crm/ai-assistance");
  expect(page).toContain("Assistance IA");
  expect(page).toContain("enabled: false");
  expect(page).toContain("modelCall: false");
});
