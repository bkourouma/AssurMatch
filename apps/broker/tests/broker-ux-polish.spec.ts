import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const brokerAppRoot = "apps/broker/app";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("broker shell exposes broker-only navigation and keeps auth routes simple", () => {
  const layout = source("apps/broker/app/layout.tsx");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  const css = source("apps/broker/app/globals.css");

  expect(layout).toContain("BrokerShell");
  expect(layout).toContain("./globals.css");
  expect(shell).toContain("Back-office Courtier");
  for (const label of ["Dashboard", "Leads", "CRM", "Equipe", "Compte"]) {
    expect(shell).toContain(`label: "${label}"`);
  }
  expect(shell).toContain("data-broker-auth-shell=\"simple\"");
  expect(shell).toContain("Navigation courtier principale");
  expect(shell).not.toContain("/admin");
  expect(shell).not.toContain("Navigation admin principale");
  expect(css).toContain(".broker-shell");
  expect(css).toContain("@media (max-width: 780px)");
  expect(css).toContain(":focus-visible");
});

test("broker dashboard and account surfaces use polished primitives", () => {
  const home = source("apps/broker/app/page.tsx");
  const account = source("apps/broker/app/account/page.tsx");
  const team = source("apps/broker/app/team/page.tsx");

  expect(home).toContain("PageHeader");
  expect(home).toContain("dashboardKpis");
  expect(home).toContain("Notifications");
  expect(account).toContain("Securite du compte");
  expect(account).toContain("definition-list");
  expect(team).toContain("Module indisponible");
  expect(team).toContain("Permissions conservees");
});

test("Starter CRM entry points show required Pro availability message", () => {
  const crm = source("apps/broker/app/crm/page.tsx");
  const leads = source("apps/broker/app/leads/page.tsx");
  const detail = source("apps/broker/app/leads/[leadAssignmentId]/page.tsx");
  const viewModels = source("apps/broker/app/lib/ui/broker-view-models.ts");

  for (const fileSource of [crm, leads, detail, viewModels]) {
    expect(fileSource).toContain("Le CRM complet est disponible avec le plan Pro.");
  }
  expect(crm.indexOf("const session = await readBackOfficeSession();")).toBeLessThan(crm.indexOf("const dashboard = await readBrokerDashboard();"));
  expect(crm.indexOf("if (isStarterCrmDenied(session.profile))")).toBeLessThan(crm.indexOf("const dashboard = await readBrokerDashboard();"));
  expect(detail).toContain("ne presente pas Kanban");
});

test("Pro and Enterprise CRM surfaces are gated by plan/flag availability", () => {
  const crm = source("apps/broker/app/crm/page.tsx");
  const crmList = source("apps/broker/app/crm/leads/page.tsx");
  const crmDetail = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");

  expect(crm).toContain("broker_crm_enabled");
  expect(crm).toContain("Module indisponible");
  expect(crmList).toContain("Acces CRM refuse");
  expect(crmList).toContain("flag broker_crm_enabled");
  expect(crmList.indexOf("if (apiLeads.forbidden)")).toBeLessThan(crmList.indexOf("const leads = apiLeads.data.items.map(leadSummary);"));
  expect(crmList.indexOf("if (apiLeads.forbidden)")).toBeLessThan(crmList.indexOf("<PageHeader"));
  expect(crmDetail).toContain("isStarterCrmDenied");
  expect(crmDetail).toContain("CRM autorise");
});

test("broker source avoids public/admin leakage and forbidden wording", () => {
  const appFiles = files(brokerAppRoot).filter((file) => /\.(ts|tsx|css)$/.test(file));
  const combined = appFiles.map((file) => source(file)).join("\n");

  expect(combined).not.toContain("admin-shell");
  expect(combined).not.toContain("Navigation admin principale");
  expect(combined).not.toContain("admin-api");
  expect(combined).not.toContain("/admin/");
  expect(combined).not.toContain("apps/public");

  const forbiddenTerms = [
    "Souscrire " + "maintenant",
    "Contrat " + "valide",
    "Contrat " + "validé",
    "Garantie " + "acceptee",
    "Garantie " + "acceptée",
    "Acheter " + "maintenant",
    "Police " + "emise",
    "Police " + "émise",
    "Paiement " + "de prime",
    "AssurMatch vous " + "assure"
  ];

  for (const forbidden of forbiddenTerms) {
    expect(combined).not.toContain(forbidden);
  }
});
