import { expect, test } from "@playwright/test";
import { setGlobalFlag } from "./support/admin";
import { openAs } from "./support/backoffice";
import { saveWorld } from "./support/journey-state";
import {
  WORLD_REASON,
  appPage,
  inviteMember,
  provisionBroker,
  publishOffer,
  requestQuote,
  superAdminAccount
} from "./support/world";
import { e2eEnv } from "./support/env";

// Spec 065 - set-up of the Pro firm shared by pro-02-crm, pro-03-roles and pro-04-ai-disabled.
// PRD 32.2: a Pro broker gets the full CRM. The firm is created by the admin with the Pro plan, the
// CRM module is switched on through the admin flags screen, a team is invited (agent, read-only),
// an offer is published and four visitors send a quote request on it (four leads in the CRM).
//
// State handed over (world "pro"): owner, members.agent / members.readOnly, offerTitle and in
// `data`: lead1Ref..lead4Ref + lead1Email..lead4Email (QR- references and visitor e-mail addresses).

test.describe.configure({ mode: "serial" });

test("PRO-00 le module CRM courtier est activé par l'admin (idempotent)", async ({ browser }) => {
  const admin = await appPage(browser, e2eEnv.adminUrl);
  await openAs(admin, superAdminAccount(), "/feature-flags");
  // broker_crm_enabled is closed by default (lot 063 may open it): switching it on is a no-op then.
  await setGlobalFlag(admin, "broker_crm_enabled", true, WORLD_REASON);
  await expect(admin.getByRole("row").filter({ hasText: "broker_crm_enabled" }).first()).toBeVisible();
  await admin.context().close();
});

test("PRO-01 le courtier Pro est créé avec son plan, activé, équipé et son offre est publiée", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const world = await provisionBroker(browser, { plan: "pro", label: "pro" });
  const domain = "broker-pro.e2e.test";
  world.members.agent = await inviteMember(browser, world.owner, { key: "agent", displayName: "Aya Agent", emailDomain: domain });
  world.members.readOnly = await inviteMember(browser, world.owner, { key: "readOnly", displayName: "Rémi Lecteur", emailDomain: domain });
  const offer = await publishOffer(browser, world, "Pro");
  world.offerId = offer.offerId;
  world.offerTitle = offer.offerTitle;
  saveWorld("pro", world);

  for (const index of [1, 2, 3, 4]) {
    const quote = await requestQuote(browser, offer.offerTitle, world.partnerName, `pro${index}`);
    world.data[`lead${index}Ref`] = quote.reference;
    world.data[`lead${index}Email`] = quote.email;
    saveWorld("pro", world);
  }
});
