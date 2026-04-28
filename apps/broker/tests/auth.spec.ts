import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "apps/broker/app";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("broker auth client exposes login MFA source markers", () => {
  const api = read("lib/broker-api.ts");
  const login = read("login/page.tsx");

  expect(api).toContain("broker-auth-client:014");
  expect(api).toContain("/auth/mfa/enroll");
  expect(api).toContain("/auth/mfa/verify");
  expect(api).toContain("/auth/password-change");
  expect(login).toContain("Activation requise");
  expect(login).toContain("Compte verrouille");
  expect(login).toContain("Compte suspendu");
});

test("broker app does not import the public app", () => {
  const content = files(root).map((file) => readFileSync(file, "utf8")).join("\n");
  expect(content).not.toContain("apps/public");
  expect(content).not.toContain("../../public");
});
