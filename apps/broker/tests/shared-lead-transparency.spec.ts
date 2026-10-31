import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("a shared lead is disclosed to its partner without revealing the co-recipients", () => {
  const detail = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");

  expect(detail).toContain("Exclusivité");
  expect(detail).toContain("Lead partagé avec");
  expect(detail).toContain("tarif réduit");
  expect(detail).toContain("L'identité des autres courtiers n'est pas communiquée");
  expect(detail).toContain("Lead exclusif");
});

test("the admin routing page exposes the multi-broker mode and its cap", () => {
  const page = source("apps/admin/app/routing/page.tsx");
  const forms = source("apps/admin/app/routing/routing-forms.tsx");

  expect(page).toContain("Multi-courtiers");
  expect(page).toContain("si le visiteur l'accepte");
  expect(forms).toContain('value: "multi_send"');
  expect(forms).toContain('name="maxRecipients"');
});
