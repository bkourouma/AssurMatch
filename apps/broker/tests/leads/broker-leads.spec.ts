import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("broker lead pages show only assigned lead surfaces", async () => {
  const dashboard = readFileSync("apps/broker/app/page.tsx", "utf8");
  const list = readFileSync("apps/broker/app/leads/page.tsx", "utf8");
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(dashboard).toContain("Portail courtier");
  expect(dashboard).toContain("Le CRM complet est disponible avec le plan Pro.");
  expect(list).toContain("uniquement les leads qui lui sont assignes");
  expect(list).toContain("Aucun Kanban");
  expect(list).toContain("Export controle par permission et audit");
  expect(detail).toContain("Detail du lead assigne");
  expect(detail).toContain("Accepter");
  expect(detail).toContain("Rejeter avec motif");
  expect(detail).toContain("Contester avec motif");
  expect(detail).toContain("Toute consultation detail est auditee");
  expect(detail).toContain("ne presente pas Kanban");
});
