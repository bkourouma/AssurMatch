import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin retention page reads policies and batches from the protected retention API (spec 046)", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const actions = source("apps/admin/app/lib/retention-actions.ts");

  expect(api).toContain("/admin/retention/policies");
  expect(api).toContain("/admin/retention/batches");
  expect(api).toContain("export function readRetentionPolicies");
  expect(api).toContain("export function readRetentionBatches");
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/admin/retention/batches/preview");
  expect(actions).toContain("/admin/retention/batches/erasure-preview");
  expect(actions).toContain("/approve");
  for (const action of ["savePolicyOverride", "removePolicyOverride", "previewRetention", "previewErasure", "approveBatch"]) {
    expect(actions).toContain(`export async function ${action}`);
  }
});

test("retention page shows the flag-off notice and the two-step workflow", () => {
  const page = source("apps/admin/app/compliance/retention/page.tsx");

  expect(page).toContain('data-retention-marker="purge-disabled-notice"');
  expect(page).toContain("retention_purge_enabled");
  expect(page).toContain("nouvelle previsualisation");
  expect(page).toContain("Durees de conservation");
  expect(page).toContain("Previsualiser un lot de retention");
  expect(page).toContain("Previsualiser un effacement sur demande");
  expect(page).toContain("Lots d&apos;anonymisation");
  expect(page).toContain("action={approveBatch}");
  expect(page).toContain("n'est ni enregistree sur le lot ni affichee");
});

test("retention surfaces never echo an erasure e-mail back to the page", () => {
  const page = source("apps/admin/app/compliance/retention/page.tsx");
  const actions = source("apps/admin/app/lib/retention-actions.ts");

  // The page only renders counts and metadata: no e-mail value, prospect identity or batch target ids.
  expect(page).not.toMatch(/\{[^}]*\.email\b/);
  expect(page).not.toMatch(/searchParams[^;]*email/);
  expect(page).not.toContain("targetIds");
  // Redirects only carry a notice key (and the country scope), never the looked-up identifier.
  expect(actions).not.toMatch(/pageUrl\([^)]*identifier/);
  expect(actions).not.toMatch(/redirect\(`[^`]*\$\{identifier/);
});

test("retention navigation and compliance link reach the page", () => {
  expect(source("apps/admin/app/lib/ui/admin-shell.tsx")).toContain('"/compliance/retention"');
  expect(source("apps/admin/app/compliance/page.tsx")).toContain('href="/compliance/retention"');
});

test("retention page avoids sale, subscription and regulated wording", () => {
  const page = source("apps/admin/app/compliance/retention/page.tsx").toLowerCase();
  for (const forbidden of ["acheter", "souscrire", "payer maintenant", "contrat valide", "garantie acceptee", "meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});
