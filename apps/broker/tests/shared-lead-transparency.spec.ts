import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("a shared lead is disclosed to its partner without revealing the co-recipients", () => {
  const detail = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");

  expect(detail).toContain("Exclusivite");
  expect(detail).toContain("Lead partage avec");
  expect(detail).toContain("tarif reduit");
  expect(detail).toContain("L'identite des autres courtiers n'est pas communiquee");
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
