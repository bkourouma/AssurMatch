import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("compliance page exposes evidence review shell", async () => {
  const source = readFileSync("apps/admin/app/compliance/page.tsx", "utf8");
  expect(source).toContain("Preuves de conformite");
  expect(source).toContain("Consentements");
});

test("spec 059 follow-up: consent-proof search for compliance, e-mail sent in a POST body only", async () => {
  const page = readFileSync("apps/admin/app/compliance/consent-records/page.tsx", "utf8");
  const search = readFileSync("apps/admin/app/compliance/consent-records/consent-record-search.tsx", "utf8");
  const action = readFileSync("apps/admin/app/lib/consent-record-actions.ts", "utf8");
  const shell = readFileSync("apps/admin/app/lib/ui/admin-shell.tsx", "utf8");

  expect(page).toContain("Preuves de consentement");
  expect(page).toContain('new Set(["super_admin", "compliance_admin"])');
  expect(search).toContain("useActionState(searchConsentRecordsAction");
  expect(search).toContain("subjectFingerprint");
  expect(action).toContain("/admin/consent-records/search");
  expect(action).toContain('method: "POST"');
  // The e-mail never goes into a URL.
  expect(action).not.toMatch(/consent-records\/search\?/u);
  expect(shell).toContain('href: "/compliance/consent-records"');
});

test("spec 059 follow-up: the country status form only offers transitions the API accepts", async () => {
  const forms = readFileSync("apps/admin/app/catalog/catalog-forms.tsx", "utf8");
  const graph = readFileSync("packages/shared/contracts/country-status-transitions.ts", "utf8");
  const api = readFileSync("backend/src/modules/countries/countries.module.ts", "utf8");

  expect(forms).toContain("allowedCountryStatusTransitions(currentStatus)");
  expect(graph).toContain('draft: ["internal", "suspended", "retired"]');
  // The API enforces the very same shared graph.
  expect(api).toContain("COUNTRY_STATUS_TRANSITIONS");
  expect(api).not.toMatch(/const COUNTRY_STATUS_TRANSITIONS/u);
});
