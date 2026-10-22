import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const FILES = [
  "apps/admin/app/ai-assistance/flags/page.tsx",
  "apps/admin/app/ai-assistance/flags/scope-flag-form.tsx",
  "apps/admin/app/lib/ai-scope-flag-actions.ts",
  "apps/admin/app/lib/ai-scope-flags-api.ts"
];

test("AI scope flags page exposes the sections, the ops command and the compliance wording", () => {
  const page = source(FILES[0]!);
  const form = source(FILES[1]!);
  expect(page).toContain("Flags globaux IA (lecture seule)");
  expect(page).toContain("npm run ops:apply-flag-policy -- --flag");
  expect(page).toContain("--approved-by");
  expect(page).toContain("Historique recent");
  expect(page).toContain("Pays");
  expect(page).toContain("Produits");
  expect(page).toContain("validation humaine");
  expect(page).toContain("readBackOfficeSession");
  expect(page).toContain("mfa_required");
  expect(form).toContain("Reference de politique");
  expect(form).toContain("Approbateur");
  expect(form).toContain("Motif");
  expect(form).toContain("Decision de conformite : l'activation est reservee aux roles super admin et conformite, avec MFA, et est auditee.");
  expect(form).toContain("Produit hautement sensible : activation IA refusee sans exception documentee");
});

test("AI scope flag changes go through the dedicated route, never PATCH /feature-flags", () => {
  const actions = source(FILES[2]!);
  const api = source(FILES[3]!);
  expect(actions).toContain("/admin/ai/scope-flags");
  expect(actions).toContain('method: "POST"');
  expect(actions).toContain('revalidatePath(FLAGS_PATH)');
  expect(actions).toContain('const FLAGS_PATH = "/ai-assistance/flags"');
  expect(actions).toContain("loginRedirect");
  expect(actions).not.toContain("PATCH");
  expect(actions).not.toContain("/feature-flags");
  expect(api).toContain("/admin/ai/scope-flags");
  expect(api).not.toContain("PATCH");
});

test("AI scope flags files stay free of console output and forbidden commercial wording", () => {
  for (const file of FILES) {
    const content = source(file);
    expect(content, file).not.toMatch(/console\./);
    const lower = content.toLowerCase();
    for (const forbidden of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee"]) {
      expect(lower, `${file}: ${forbidden}`).not.toContain(forbidden);
    }
  }
});

test("AI assistance page and admin shell link to the flags screen", () => {
  const page = source("apps/admin/app/ai-assistance/page.tsx");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  expect(page).toContain("/ai-assistance/flags");
  expect(page).toContain("Flags IA par pays et produit");
  expect(shell).toContain('label: "Flags IA", href: "/ai-assistance/flags"');
  expect(shell).toContain('match: ["/ai-assistance/flags"]');
});
