import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin users page exposes RBAC and MFA shell", async () => {
  const source = readFileSync("apps/admin/app/users/page.tsx", "utf8");
  expect(source).toContain("RBAC et MFA");
});
