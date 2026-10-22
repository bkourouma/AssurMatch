import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const PAGE = "apps/admin/app/channels/page.tsx";
const API = "apps/admin/app/lib/channels-api.ts";
const SHELL = "apps/admin/app/lib/ui/admin-shell.tsx";

test("channels page calls the messaging endpoints and guards the session", () => {
  const api = source(API);
  const page = source(PAGE);
  expect(api).toContain("/admin/messaging/outbox");
  expect(api).toContain("readMessagingProviders");
  expect(api).toContain("readMessagingDeliveries");
  expect(api).toContain('cache: "no-store"');
  expect(page).toContain("readBackOfficeSession");
  expect(page).toContain("mfa_required");
  expect(page).toContain("/mfa?returnTo=");
  expect(page).toContain("isAdminProfile");
  expect(page).toContain("Acces refuse pour ce role admin (journal d'audit en lecture requis).");
});

test("channels page exposes the sections, labels and the read-only ops command", () => {
  const page = source(PAGE);
  expect(page).toContain("Canaux SMS et WhatsApp");
  expect(page).toContain("File de reprise");
  expect(page).toContain("50 dernieres lignes");
  expect(page).toContain("4 tentatives");
  expect(page).toContain("1, 5 puis 30 minutes");
  expect(page).toContain("Message SMS/WhatsApp en echec definitif");
  expect(page).toContain("Etat des canaux");
  expect(page).toContain("Dernieres diffusions (destinataire masque)");
  expect(page).toContain('href="/messaging"');
  expect(page).toContain('href="/crm-connectors"');
  expect(page).toContain("npm run ops:apply-flag-policy -- --flag sms_enabled --value true --reference ... --approved-by ... --reason ...");
  expect(page).not.toContain("<button");
  expect(page).not.toContain("<form");
  for (const status of ["dead_letter", "failed", "retryable", "sent", "cancelled"]) expect(page).toContain(status);
});

test("channels page never exposes recipient or body and stays free of console and forbidden wording", () => {
  const page = source(PAGE);
  const api = source(API);
  const withoutMasked = page.replaceAll("recipientMasked", "");
  expect(withoutMasked).not.toMatch(/\.recipient\b/);
  expect(withoutMasked).not.toMatch(/\.body\b|\bbody:/);
  for (const text of [page, api]) {
    expect(text).not.toMatch(/console\./);
    for (const banned of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee"]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  }
});

test("admin menu links to the channels screen", () => {
  expect(source(SHELL)).toContain('label: "Canaux", href: "/channels"');
});
