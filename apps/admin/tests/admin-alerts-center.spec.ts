import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Spec 061 FR-004: admin alerts center on the existing compliance alerts page. */

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the compliance alerts page shows the alerts center with an audited acknowledgement", () => {
  const page = source("apps/admin/app/dashboard/compliance-alerts/page.tsx");
  expect(page).toContain("readAdminAlerts(alertStatus)");
  expect(page).toContain("data-alerts-center");
  expect(page).toContain("acknowledgeAlertAction");
  expect(page).toContain('name="reason"');
  expect(page).toContain("minLength={8}");
  // Existing audit-based section kept.
  expect(page).toContain("readComplianceAlerts");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});

test("the acknowledgement is a server action calling the protected API with the session token", () => {
  const actions = source("apps/admin/app/lib/alert-actions.ts");
  expect(actions.startsWith('"use server";')).toBe(true);
  expect(actions).toContain("/admin/alerts/${encodeURIComponent(id)}/acknowledge");
  expect(actions).toContain("Authorization: `Bearer ${token}`");
  expect(actions).toContain("reason.length < 8");
  const api = source("apps/admin/app/lib/admin-api.ts");
  expect(api).toContain("export function readAdminAlerts");
  expect(api).toContain("/admin/alerts?status=");
});
