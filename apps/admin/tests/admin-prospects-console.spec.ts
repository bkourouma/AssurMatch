import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

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
  expect(page).toContain("searchProspectsAction");
  expect(page).not.toContain("method=\"get\"");
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

test("contact search posts the typed e-mail / phone in a body, renders the result from the action state, never in the URL", () => {
  const action = source("apps/admin/app/prospects/search-action.ts");
  expect(action).toContain("\"use server\"");
  expect(action).toContain("searchProspectsByContactAction");
  expect(action).toContain("/admin/operations/prospects/contact-search");
  expect(action).toContain("method: \"POST\"");
  expect(action).toContain("JSON.stringify({ contact, page: 1, pageSize: 50 })");
  // No hash of a contact anywhere on the admin side, and the filter redirect carries a notice flag only.
  for (const forbidden of ["createHash", "fingerprint", "contactHash", "params.set(\"contact\""]) expect(action, forbidden).not.toContain(forbidden);
  expect(action).toContain("params.set(\"notice\", \"contact\")");
  expect(action).not.toMatch(/redirect\([^)]*contact\b/);
  expect(action).not.toMatch(/message:[^\n]*\$\{contact\}/);

  const form = source("apps/admin/app/prospects/contact-search.tsx");
  expect(form).toContain("\"use client\"");
  expect(form).toContain("useActionState(searchProspectsByContactAction");
  expect(form).toContain("name=\"contact\"");
  expect(form).toContain("getRowHref");
  expect(form).not.toMatch(/router\.push|useRouter|searchParams|URLSearchParams/);

  const page = source("apps/admin/app/prospects/page.tsx");
  expect(page).toContain("action={searchProspectsAction}");
  expect(page).toContain("<ProspectContactSearch />");
  for (const forbidden of ["contactHash", "params.contact", "fingerprint"]) expect(page, forbidden).not.toContain(forbidden);

  const contracts = source("packages/shared/contracts/admin-operations.contracts.ts");
  expect(contracts).toContain("adminProspectContactSearchSchema");
  expect(contracts).not.toContain("contactHash");
  // The unsalted SHA-256 helper is gone: lot 8's blind index (API side) is the only lookup key.
  expect(existsSync("packages/shared/security/prospect-contact-fingerprint.ts")).toBe(false);
  expect(source("packages/shared/security/prospect-contact-search.ts")).not.toContain("createHash");
});

test("name search is offered only to the roles the API lets search by name", () => {
  const page = source("apps/admin/app/prospects/page.tsx");
  expect(page).toContain("const NAME_SEARCH_ROLES = new Set([\"super_admin\", \"support_admin\"]);");
  expect(page).toContain("readBackOfficeSession");
  expect(page).toMatch(/\{canSearchByName \? \(\s*<Field id="prospect-search"/);
  // A name filter from an old link is not forwarded for a role the API would refuse (403).
  expect(page).toContain("search: canSearchByName && rawSearch");
  const service = source("backend/src/modules/admin-operations/admin-prospects-console.service.ts");
  expect(service).toContain("PROSPECT_PII_ROLES = new Set<AssurMatchRole>([\"super_admin\", \"support_admin\"])");
});
