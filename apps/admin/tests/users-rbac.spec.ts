import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin users page exposes rich user management shell", async () => {
  const source = readFileSync("apps/admin/app/users/page.tsx", "utf8");
  const detail = readFileSync("apps/admin/app/users/[userId]/page.tsx", "utf8");
  const actions = readFileSync("apps/admin/app/users/actions.ts", "utf8");
  const api = readFileSync("apps/admin/app/lib/admin-api.ts", "utf8");

  expect(source).toContain("Recherche");
  expect(source).toContain("Statut");
  expect(source).toContain("Role");
  expect(source).toContain("CreateUserForm");
  expect(detail).toContain("Profil et scopes");
  expect(detail).toContain("Actions sensibles");
  expect(detail).toContain("PasswordResetForm");
  expect(api).toContain("/admin/users");
  expect(actions).toContain("mfa-reset");
  expect(actions).toContain("reason");
});
