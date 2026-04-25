import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("broker lead pages show only assigned lead surfaces", async () => {
  const list = readFileSync("apps/broker/app/leads/page.tsx", "utf8");
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(list).toContain("uniquement les leads qui lui sont assignes");
  expect(list).toContain("Aucun Kanban");
  expect(detail).toContain("Detail du lead assigne");
});
