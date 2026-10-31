import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const LINE_BREAK = new RegExp(String.fromCharCode(13) + "?" + String.fromCharCode(10));

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin partner integrations page exposes API key and webhook guardrails", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/partner-integrations/page.tsx");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readPartnerIntegrations");
  expect(api).toContain("/admin/partner-integrations/api-keys");
  expect(api).toContain("/admin/partner-integrations/webhook-endpoints");
  expect(api).toContain("/admin/partner-integrations/webhook-allowlist");
  expect(api).toContain("/admin/partner-integrations/webhook-deliveries");
  expect(page).toContain("Partner API et webhooks");
  expect(page).toContain("partner_api_enabled: désactivé par défaut");
  expect(page).toContain("partner_webhooks_enabled: désactivé par défaut");
  expect(page).toContain("clés hachées Argon2");
  expect(page).toContain("secrets webhook chiffres");
  expect(page).toContain("allow-list tenant obligatoire");
  expect(page).toContain("redirects HTTP bloqués");
  expect(page).toContain("lead.assigned");
  expect(page).toContain("notification.failed");
  expect(page).not.toContain("signingSecret");
  expect(page).not.toContain("rawKey");
  expect(shell).toContain("/partner-integrations");
});

test("partner integrations page avoids regulated activation wording", () => {
  const page = source("apps/admin/app/partner-integrations/page.tsx");
  const forms = source("apps/admin/app/partner-integrations/integration-forms.tsx");
  const actions = source("apps/admin/app/lib/partner-integration-actions.ts");
  for (const forbidden of ["Acheter", "acheter maintenant", "Souscrire maintenant", "souscrire maintenant", "Contrat valide", "contrat valide", "Garantie acceptee", "garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
    expect(forms).not.toContain(forbidden);
    expect(actions).not.toContain(forbidden);
  }
});

test("partner integrations screen is actionable and shows secrets only once", () => {
  const page = source("apps/admin/app/partner-integrations/page.tsx");
  const forms = source("apps/admin/app/partner-integrations/integration-forms.tsx");
  const actions = source("apps/admin/app/lib/partner-integration-actions.ts");

  expect(page).not.toContain("lecture seule");
  expect(forms).toMatch(/^"use client";/);
  expect(actions).toMatch(/^"use server";/);
  expect(actions).toContain("/admin/partner-integrations");
  expect(actions).toContain("/test");
  expect(actions).toContain("partner_webhooks_enabled");
  expect(actions).toContain('revalidatePath(PAGE_PATH)');
  expect(actions).toContain("Action refusée : MFA ou rôle insuffisant");
  expect(actions).toContain("Intégrations indisponibles");
  expect(forms).toContain("Ce secret n&apos;est affiché qu&apos;une seule fois. Copiez-le maintenant.");
  expect(forms).toContain("navigator.clipboard.writeText");
  expect(forms).toContain("Envoyer un événement de test");
  expect(forms).toContain("Révoquer");

  // The secret stays inside the action state and the client component.
  expect(page).not.toContain("rawKey");
  expect(page).not.toContain("signingSecret");
  expect(actions).not.toMatch(/console\./);
  expect(forms).not.toMatch(/console\./);
  for (const sink of ["localStorage", "sessionStorage", "document.cookie", "cookies("]) {
    expect(actions).not.toContain(sink);
    expect(forms).not.toContain(sink);
  }
  for (const line of actions.split(LINE_BREAK)) {
    if (/redirect\(|searchParams|new URL/.test(line)) {
      expect(line).not.toMatch(/rawKey|signingSecret|secret/i);
    }
  }
  expect(actions).not.toMatch(/revalidatePath\([^)]*(rawKey|signingSecret)/);
});
