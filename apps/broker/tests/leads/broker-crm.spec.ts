import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("broker CRM pages stay in back-office surface", async () => {
  const dashboard = readFileSync("apps/broker/app/crm/page.tsx", "utf8");
  const list = readFileSync("apps/broker/app/crm/leads/page.tsx", "utf8");
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(dashboard).toContain("CRM Pro/Enterprise");
  expect(dashboard).toContain("aucune action CRM ne declenche souscription");
  expect(list).toContain("Vue tableau des leads autorises");
  expect(list).toContain("Export CSV controle");
  expect(detail).toContain("Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client");
  expect(detail).toContain("Reference devis");
});
