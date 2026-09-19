import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker enterprise page is plan-gated and covers agencies, roles, SLA and branding", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/enterprise/page.tsx");
  const actions = source("apps/broker/app/lib/enterprise-actions.ts");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");

  expect(api).toContain("/broker/enterprise/agencies");
  expect(api).toContain("/broker/enterprise/roles");
  expect(api).toContain("/broker/enterprise/sla");
  expect(api).toContain("/broker/enterprise/branding");
  expect(page).toContain('session.profile.partnerPlan !== "enterprise"');
  expect(page).toContain("Plan Enterprise requis");
  expect(page).toContain("Roles personnalises");
  expect(page).toContain("Engagement de reactivite");
  expect(actions).toContain('"use server"');
  expect(shell).toContain("/enterprise");
});

test("branding stays in the broker back-office and keeps the platform mention", () => {
  const page = source("apps/broker/app/enterprise/page.tsx");
  const publicApi = source("apps/public/app/lib/public-api.ts");
  // The public home page moved under the locale segment when the visitor site became bilingual.
  const publicHome = source("apps/public/app/[locale]/page.tsx");

  expect(page).toContain("Le comparateur public reste presente par AssurMatch, plateforme technique");
  expect(page).toContain("platformMention");
  // The public surface must never read partner branding.
  expect(publicApi).not.toContain("branding");
  expect(publicHome).not.toContain("branding");
});

test("admin partners page reports SLA compliance without automatic sanction", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/partners/page.tsx");

  expect(api).toContain("/admin/partners/sla");
  expect(page).toContain("Engagement de reactivite (SLA) par partenaire");
  expect(page).toContain("aucune suspension automatique");
});
