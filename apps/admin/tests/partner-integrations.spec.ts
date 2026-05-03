import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  expect(api).toContain("/admin/partner-integrations/webhook-deliveries");
  expect(page).toContain("Partner API et webhooks");
  expect(page).toContain("partner_api_enabled: desactive par defaut");
  expect(page).toContain("partner_webhooks_enabled: desactive par defaut");
  expect(page).toContain("cles hachees Argon2");
  expect(page).toContain("secrets webhook chiffres");
  expect(page).toContain("lead.assigned");
  expect(page).toContain("notification.failed");
  expect(page).not.toContain("signingSecret");
  expect(page).not.toContain("rawKey");
  expect(shell).toContain("/partner-integrations");
});

test("partner integrations page avoids regulated activation wording", () => {
  const page = source("apps/admin/app/partner-integrations/page.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
  }
});
