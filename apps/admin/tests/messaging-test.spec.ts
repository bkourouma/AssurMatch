import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const FILES = [
  "apps/admin/app/messaging/page.tsx",
  "apps/admin/app/messaging/messaging-test-form.tsx",
  "apps/admin/app/lib/messaging-test-actions.ts"
];

test("messaging page exposes the test send card with the super admin note", () => {
  const page = source(FILES[0]!);
  const form = source(FILES[1]!);
  expect(page).toContain("Envoi de test");
  expect(page).toContain("MessagingTestForm");
  expect(form).toContain("Envoyer un message de test");
  expect(form).toContain("Reserve au super admin, MFA requis");
  expect(form).toContain("recipientMasked");
  expect(form).toContain('name="recipient"');
  expect(form).toContain('name="scopeId"');
  expect(form).toContain('name="channel"');
});

test("messaging test action posts to the existing route and never echoes the recipient", () => {
  const action = source(FILES[2]!);
  expect(action).toContain("/admin/messaging/test");
  expect(action).toContain('method: "POST"');
  expect(action).toContain("loginRedirect");
  expect(action).toContain("recipientMasked");
  expect(action).not.toMatch(/searchParams|URLSearchParams/);
  expect(action).not.toMatch(/redirect\([^)]*recipient/);
  // Single implementation: the lot 6 duplicate action and its `sendMessagingTest` helper are gone.
  expect(existsSync("apps/admin/app/messaging/actions.ts")).toBe(false);
  expect(source("apps/admin/app/lib/admin-api.ts")).not.toContain("sendMessagingTest");
});

test("messaging test files stay free of console output and forbidden wording", () => {
  for (const file of FILES) {
    const content = source(file);
    expect(content, file).not.toMatch(/console\./);
    const lower = content.toLowerCase();
    for (const forbidden of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee"]) {
      expect(lower, `${file}: ${forbidden}`).not.toContain(forbidden);
    }
  }
});
