import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "apps/admin/app";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("admin auth client exposes login MFA source markers", () => {
  const api = read("lib/admin-api.ts");
  const login = read("login/page.tsx");
  const flow = read("auth-flow-form.tsx");
  const flowActions = read("lib/auth-flow-actions.ts");

  expect(api).toContain("admin-auth-client:014");
  expect(api).toContain("/auth/mfa/enroll");
  expect(api).toContain("/auth/mfa/verify");
  expect(api).toContain("/auth/password-change");
  expect(api).toContain("/auth/activate");
  expect(api).toContain("/auth/password-reset");
  expect(login).toContain("Activation requise");
  expect(login).toContain("Compte verrouille");
  expect(login).toContain("Compte suspendu");
  expect(login).toContain("/activate");
  expect(flow).toContain("ActivationForm");
  expect(flow).toContain("MfaPanel");
  expect(flow).toContain("PasswordChangeForm");
  expect(flow).toContain("PasswordResetConsumeForm");
  expect(flowActions).toContain("redirect(`/mfa");
});

test("admin auth completion pages exist", () => {
  expect(read("activate/page.tsx")).toContain("Activer le compte");
  expect(read("mfa/page.tsx")).toContain("MFA requise");
  expect(read("password-change/page.tsx")).toContain("Changer le mot de passe");
  expect(read("password-reset/page.tsx")).toContain("Consommer un jeton");
});

test("admin app does not import the public app", () => {
  const content = files(root).map((file) => readFileSync(file, "utf8")).join("\n");
  expect(content).not.toContain("apps/public");
  expect(content).not.toContain("../../public");
});
