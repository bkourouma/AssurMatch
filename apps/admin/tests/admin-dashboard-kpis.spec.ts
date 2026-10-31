import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const PRD_KPI_LABELS = [
  "Visites (pages vues)",
  "Demandes créées",
  "Taux visite vers demande",
  "Leads routés",
  "Leads non routés",
  "Partenaires actifs",
  "Pays actifs",
  "Produits actifs",
  "CA abonnement",
  "CA leads",
  "SLA courtier",
  "Qualité leads",
  "Alertes conformité",
  "Offres expirées",
  "Synthèse IA"
];

test("admin dashboard lists the 15 PRD KPIs with explicit states instead of misleading zeros", () => {
  const viewModels = source("apps/admin/app/lib/ui/admin-view-models.ts");
  const page = source("apps/admin/app/dashboard/page.tsx");
  for (const label of PRD_KPI_LABELS) expect(viewModels).toContain(`label: "${label}"`);
  expect(viewModels).toContain('NOT_MEASURED = "Non mesuré"');
  // A text state is a KPI value: it must stay short (the long wording goes in the helper line).
  expect(viewModels).toContain('SUPER_ADMIN_ONLY = "Réservé"');
  expect(viewModels).toContain('SUPER_ADMIN_ONLY_NOTE = "Réservé au super admin"');
  expect(viewModels).toContain('AI_DISABLED_TILE = "Désactivée"');
  expect(viewModels).toContain('AI_DISABLED = "IA désactivée"');
  expect(page).toContain("dashboardPrdKpis(data)");
  // The home page keeps its own compact KPI list.
  expect(viewModels).toContain("export function dashboardKpis(");
});

test("admin dashboard shows the AI summary and alert cards linked to /ai-assistance without generating anything", () => {
  const page = source("apps/admin/app/dashboard/page.tsx");
  expect(page).toContain('title="Synthèse IA"');
  expect(page).toContain('title="Alertes IA"');
  expect(page).toContain('href="/ai-assistance"');
  expect(page).toContain("data.aiSummary");
  expect(page).toContain("data.aiAlerts");
  expect(page).toContain("AI_DISABLED");
  expect(page).not.toMatch(/method="post"|use server|fetch\(/);
});

test("admin api client tolerates an API without the new KPI fields", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  for (const field of ["visits?:", "visitToRequestRate?:", "activeCountries?:", "activeProducts?:", "partnerSla?:", "leadQuality?:", "revenue?:", "revenueRestricted?:", "aiSummary?:", "aiAlerts?:"]) {
    expect(api).toContain(field);
  }
  const viewModels = source("apps/admin/app/lib/ui/admin-view-models.ts");
  expect(viewModels).toContain("data.revenueRestricted");
  expect(viewModels).toContain("measuredOrNot(data.activeCountries)");
});
