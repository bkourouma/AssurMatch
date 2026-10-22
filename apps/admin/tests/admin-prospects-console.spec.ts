import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Spec 073 (FR-001 to FR-005): source markers of the admin prospects console. */

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("operations API client reads the prospects console routes", () => {
  const api = source("apps/admin/app/lib/operations-api.ts");
  expect(api).toContain("/admin/operations/prospects");
  expect(api).toContain("readProspects");
  expect(api).toContain("readProspectDetail");
});

test("prospects list filters, paginates and never shows a clear contact", () => {
  const page = source("apps/admin/app/prospects/page.tsx");
  expect(page).toContain("readProspects");
  expect(page).toContain("FilterBar");
  for (const filter of ["name=\"search\"", "name=\"country\"", "name=\"product\"", "name=\"includeAnonymized\""]) {
    expect(page, filter).toContain(filter);
  }
  expect(page).toContain("OperationsTabs");
  expect(page).toContain("getRowHref");
  expect(page).toContain("pagination");
  expect(page).toContain("Aucun prospect pour ces filtres.");
  for (const state of ["Session admin requise", "Acces aux prospects refuse", "Prospects indisponibles"]) {
    expect(page, state).toContain(state);
  }
  expect(page).not.toContain("emailNormalized");
  expect(page).not.toContain("phoneNormalized");
});

test("prospect detail shows the reveal state, anonymised notice and linked quote requests", () => {
  const detail = source("apps/admin/app/prospects/[id]/page.tsx");
  expect(detail).toContain("readProspectDetail");
  expect(detail).toContain("piiRevealed");
  expect(detail).toContain("Prospect anonymise");
  expect(detail).toContain("Demandes de devis liees");
  expect(detail).toContain("Prospect introuvable");
});
