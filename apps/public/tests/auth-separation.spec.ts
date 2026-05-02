import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const publicRoot = "apps/public/app";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("public app has no back-office auth surface", () => {
  const paths = files(publicRoot);
  const combined = paths.map((file) => readFileSync(file, "utf8")).join("\n");

  expect(paths.map((file) => file.replace(/\\/g, "/"))).not.toContain("apps/public/app/login/page.tsx");
  expect(combined).not.toContain("BACKOFFICE_TOKEN_COOKIE");
  expect(combined).not.toContain("/auth/login");
  expect(combined).not.toContain("/auth/mfa");
  expect(combined).not.toContain("backoffice");
  expect(combined).not.toContain("admin-shell");
  expect(combined).not.toContain("Navigation admin principale");
  expect(combined).not.toContain("admin-api");
  expect(combined).not.toContain("broker-api");
});
