import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker notifications page exposes a tenant inbox and optional channel preferences", () => {
  const api = source("apps/broker/app/lib/broker-api.ts");
  const page = source("apps/broker/app/notifications/page.tsx");
  const actions = source("apps/broker/app/lib/notification-actions.ts");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");

  expect(api).toContain("/broker/notifications/inbox");
  expect(api).toContain("/broker/notifications/preferences");
  expect(page).toContain("Notifications operationnelles");
  expect(page).toContain("Boite de reception");
  expect(page).toContain("email: toujours actif");
  expect(page).toContain("Accepter les notifications WhatsApp");
  expect(actions).toContain('"use server"');
  expect(shell).toContain("/notifications");
});

test("admin messaging page shows channel capability and masked recipients only", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/messaging/page.tsx");

  expect(api).toContain("/admin/messaging/providers");
  expect(api).toContain("/admin/messaging/deliveries");
  expect(page).toContain("Messaging SMS et WhatsApp");
  expect(page).toContain("Envoi possible");
  expect(page).toContain("recipientMasked");
  expect(page).toContain("Aucun secret fournisseur n'est expose");
});

test("notification copy stays operational and avoids regulated or promotional wording", () => {
  const broker = source("apps/broker/app/notifications/page.tsx").toLowerCase();
  const admin = source("apps/admin/app/messaging/page.tsx").toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance", "offre promotionnelle"]) {
    expect(broker).not.toContain(forbidden);
    expect(admin).not.toContain(forbidden);
  }
  expect(broker).toContain("aucun engagement contractuel");
});
