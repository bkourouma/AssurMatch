import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

// Lot 6 (spec 073 T401-T404)
test("routing page offers the non-transmissive precheck with a permanent simulation notice", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/routing/page.tsx");
  const forms = source("apps/admin/app/routing/routing-forms.tsx");
  const actions = source("apps/admin/app/routing/actions.ts");

  expect(api).toContain("/admin/routing/precheck");
  expect(page).toContain("RoutingPrecheckForm");
  expect(forms).toContain("Simulation : aucun courtier notifié, aucun lead transmis.");
  expect(forms).toContain("Identifiant de consentement");
  expect(actions).toContain("precheckRoutingAction");
  expect(actions).toContain("Non éligible");
  expect(actions).toContain("Éligible.");
});

test("messaging page sends a test message through the server action without echoing the recipient", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/messaging/page.tsx");
  const form = source("apps/admin/app/messaging/messaging-test-form.tsx");
  // Lot 7 (spec 074 FR-010) owns the action; the lot 6 duplicate and its API helper were removed.
  const actions = source("apps/admin/app/lib/messaging-test-actions.ts");

  expect(existsSync("apps/admin/app/messaging/actions.ts")).toBe(false);
  expect(api).not.toContain("sendMessagingTest");
  expect(form).toContain("../lib/messaging-test-actions");
  expect(actions).toContain("/admin/messaging/test");
  expect(page).toContain("MessagingTestForm");
  expect(form).toContain("Envoyer un message de test");
  expect(actions).toContain("recipientMasked");
  // The typed recipient is only forwarded to the API, never written into a message.
  expect(actions).not.toMatch(/message:[^\n]*\$\{recipient\}/);
  expect(actions).not.toMatch(/message:[^\n]*formData\.get\("recipient"\)/);
});

test("no admin route exposes AI module configuration (FR-021)", () => {
  const wiring = source("backend/src/modules/http-wiring/runtime-http-wiring.module.ts");
  expect(wiring).not.toContain("AdminAIModulesController");
  expect(wiring).not.toMatch(/Post\("ai-modules|Patch\("ai-modules|Put\("ai-modules/);
});
