import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("operations page exposes notifications, routing, AI and health shell", async () => {
  const source = readFileSync("apps/admin/app/operations/page.tsx", "utf8");
  expect(source).toContain("WhatsApp est couple a l'email");
  expect(source).toContain("pre-check non transmissif");
});
