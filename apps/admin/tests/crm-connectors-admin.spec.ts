import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const FILES = [
  "apps/admin/app/connecteurs-crm/page.tsx",
  "apps/admin/app/connecteurs-crm/crm-forms.tsx",
  "apps/admin/app/lib/crm-connector-actions.ts",
  "apps/admin/app/lib/crm-connector-api.ts"
];

test("CRM connectors page: sections, read-only activation card and session guard", () => {
  const page = source(FILES[0]!);
  expect(page).toContain("readBackOfficeSession");
  expect(page).toContain("mfa_required");
  expect(page).toContain("Connecteurs CRM");
  expect(page).toContain("Activation (hors HTTP)");
  expect(page).toContain("crm_connector_enabled");
  expect(page).toContain("npm run ops:apply-flag-policy -- --flag crm_connector_enabled --value true --reference ... --approved-by ... --reason ...");
  expect(page).toContain("ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED");
  expect(page).toContain("état du flag non lisible avec ce rôle");
  expect(page).toContain("Accès refusé : droit partners:update et MFA requis.");
  expect(page).toContain("jamais de nom, d'e-mail, de téléphone ni de texte libre");
  expect(page).toContain("Historique des livraisons");
  expect(page).toContain("urlHost");
  expect(page).toContain("authHeaderConfigured");
  expect(page).toContain("emptyLabel");
  expect(page).toContain('href="/channels"');
  expect(page).toContain('href="/partner-integrations"');
});

test("CRM connectors use the dedicated routes and never touch feature flags", () => {
  const actions = source(FILES[2]!);
  const api = source(FILES[3]!);
  expect(actions).toMatch(/^"use server";/);
  expect(actions).toContain("/admin/crm-connectors");
  expect(actions).toContain('callApi("", "POST"');
  expect(actions).toContain('"PATCH"');
  expect(actions).toContain("rotateSecret: true");
  expect(actions).toContain("loginRedirect(PAGE_PATH");
  expect(actions).toContain("Action refusée : MFA ou rôle insuffisant.");
  expect(actions).toContain("crmsec_");
  expect(api).toContain("/admin/crm-connectors");
  expect(api).toContain("/admin/crm-connectors/deliveries");
  expect(api).toContain("readAdminFeatureFlags");
  for (const file of FILES) {
    const content = source(file);
    expect(content).not.toMatch(/PATCH[^\n]*feature-flags/);
    expect(content).not.toContain("updateAdminFeatureFlag");
    expect(content).not.toMatch(/console\./);
    expect(content).not.toContain("localStorage");
    expect(content).not.toContain("document.cookie");
    for (const forbidden of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee"]) {
      expect(content.toLowerCase()).not.toContain(forbidden);
    }
  }
});

test("signing secret is shown once and never leaks; auth header value is write-only", () => {
  const forms = source(FILES[1]!);
  const actions = source(FILES[2]!);
  expect(forms).toMatch(/^"use client";/);
  expect(forms).toContain("Ce secret n&apos;est affiché qu&apos;une seule fois. Copiez-le maintenant.");
  expect(forms).toContain("data-secret-reveal");
  expect(forms).toContain("navigator.clipboard.writeText");
  expect(forms).toContain("data-crm-form=");
  expect(forms).toMatch(/name="authHeaderValue" type="password" autoComplete="off"/);
  expect(actions).toContain('kind: "crm_signing_secret"');
  expect(actions).not.toMatch(/redirect\([^)]*(signingSecret|authHeaderValue)/);
  expect(actions).not.toMatch(/revalidatePath\([^)]*(signingSecret|authHeaderValue)/);
  expect(actions).not.toMatch(/cookies\(\)\.set/);
  // authHeaderValue is only forwarded to the API, never copied into a returned state or message.
  const returned = actions.match(/return \{[^}]*authHeaderValue[^}]*\}/g) ?? [];
  expect(returned).toEqual([]);
  expect(actions).toContain("replace(/(crmsec_|am_pk_|whsec_)");
});

test("admin shell exposes the CRM connectors entry", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  expect(shell).toContain('label: "Connecteurs CRM", href: "/connecteurs-crm"');
});
