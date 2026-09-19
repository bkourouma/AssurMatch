import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker CRM page shows period comparison, advisor performance and an authenticated export", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/crm/page.tsx");
  const route = source("apps/broker/app/reports/export/route.ts");

  expect(api).toContain("/broker/dashboard/advisors");
  expect(api).toContain("compare=previous");
  expect(page).toContain("Comparaison avec la periode precedente");
  expect(page).toContain("Performance par conseiller");
  expect(page).toContain('href="/reports/export"');
  // The export must go through the app route so the httpOnly session token is attached.
  expect(page).not.toContain('href="/broker/dashboard/export.csv"');
  expect(route).toContain("Authorization");
  expect(route).toContain("text/csv");
});

test("admin dashboard offers the platform export through an authenticated route", () => {
  const page = source("apps/admin/app/dashboard/page.tsx");
  const route = source("apps/admin/app/reports/export/route.ts");

  expect(page).toContain('href="/reports/export"');
  expect(route).toContain("/admin/dashboard/export.csv");
  expect(route).toContain("Authorization");
});
