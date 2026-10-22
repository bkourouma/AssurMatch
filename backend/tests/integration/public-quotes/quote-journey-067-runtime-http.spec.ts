import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quoteOptionsResponseSchema } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AssurMatchRuntime } from "../../../src/runtime/assurmatch-runtime";
import { seedAcceptedAccreditation } from "../helpers/partner-onboarding-seed";
import { publishOffer } from "../helpers/offer-test-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const DAY = 24 * 3600 * 1000;

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

interface Confirmation {
  publicReference: string;
  status: string;
  routed: boolean;
  verificationToken: string;
  additionalOffersIgnored?: boolean;
  chosenPartnerRetained?: boolean | null;
  requestedPartnerCount?: number;
  retainedPartnerCount?: number;
}

class RecordingMailer {
  readonly sent: AuthEmailPayload[] = [];
  async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
    this.sent.push(payload);
    return { status: "sent", provider: "mailpit" };
  }
}

function delivery(runtime: AssurMatchRuntime, mailer: RecordingMailer): QuoteNotificationDeliveryService {
  return new QuoteNotificationDeliveryService({
    notifications: runtime.notifications.service,
    email: mailer,
    templates: new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" }),
    audit: runtime.audit.writer,
    quotes: { findById: (id) => runtime.quoteRequests.submissions.findById(id) as never },
    prospects: { findById: (id) => runtime.prospects.service.require(id).catch(() => undefined) },
    partners: { findById: (id) => runtime.partners.service.require(id).catch(() => undefined) },
    visitorAccess: runtime.quoteRequests.submissions.visitorAccess,
    reminderUnsubscribe: runtime.satisfactionSurveys.unsubscribe
  });
}

async function seedPartner(harness: RuntimeHttpHarness, seed: Seed, legalName: string, options: { tradeName?: string } = {}) {
  const partner = await harness.runtime.partners.service.create({
    legalName,
    ...(options.tradeName ? { tradeName: options.tradeName } : {}),
    plan: "pro",
    primaryEmail: `${legalName.replace(/\s+/g, "").toLowerCase()}@broker.example`,
    primaryWhatsApp: "+2250102030409",
    status: "active",
    quotaMonthlyLeads: 0
  }, superAdmin);
  await harness.runtime.partners.service.authorizeCountry(partner.id, seed.country.id, superAdmin);
  await harness.runtime.partners.service.authorizeProduct(partner.id, seed.product.id, superAdmin);
  const license = await harness.runtime.partnerLicenses.service.create({
    partnerTenantId: partner.id,
    licenseNumber: `LIC-${partner.id.slice(0, 8)}`,
    issuingAuthority: "Regulator",
    countryId: seed.country.id,
    productIds: [seed.product.id],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01"
  }, superAdmin);
  await seedAcceptedAccreditation(harness.runtime, partner.id, license.id);
  const offer = await publishOffer(harness.runtime.offers, {
    countryId: seed.country.id,
    productId: seed.product.id,
    partnerTenantId: partner.id,
    name: `Offre ${legalName}`,
    indicativePriceMin: 25000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    reason: "Offre du lot 1"
  }, superAdmin, superAdmin);
  return { partner, offer };
}

async function openMultiBroker(harness: RuntimeHttpHarness): Promise<void> {
  await harness.runtime.featureFlags.service.applyCompliancePolicy(
    { key: "multi_broker_routing_enabled", scopeType: "global", value: true, reason: "pilote multi-courtiers lot 1" },
    superAdmin,
    { reference: "TEST-067-MB", approvedBy: "compliance" }
  );
}

let sequence = 0;
async function submitQuote(
  harness: RuntimeHttpHarness,
  seed: Seed,
  extra: { contact?: Record<string, unknown>; consent?: Record<string, unknown> } & Record<string, unknown> = {}
): Promise<Confirmation> {
  sequence += 1;
  const suffix = String(sequence).padStart(2, "0");
  const { contact, consent, ...rest } = extra;
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: `Visiteur ${suffix}`, email: `visiteur067-${suffix}@example.test`, phone: `+22507080920${suffix}`, ...contact },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash, ...consent },
      ipAddress: `198.51.100.${sequence}`,
      sessionId: `journey-067-${suffix}`,
      ...rest
    })
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return readJson<Confirmation>(response);
}

async function lastQuote(harness: RuntimeHttpHarness, publicReference: string) {
  const quote = (await harness.runtime.quoteRequests.submissions.list()).find((item) => item.publicReference === publicReference)!;
  const decision = (await harness.runtime.leads.decisions.list()).find((item) => item.quoteRequestId === quote.id)!;
  const assignments = (await harness.runtime.leads.assignments.list()).filter((item) => item.quoteRequestId === quote.id);
  return { quote, decision, assignments };
}

describe("spec 067 visitor quote journey runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (previousCrmFlag === undefined) delete process.env.ASSURMATCH_BROKER_CRM_ENABLED;
    else process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  describe("quote options", () => {
    it("follows the multi-broker and document upload flags and exposes brokers by id and name only", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const second = await seedPartner(harness, seed, "Cabinet Kone SARL", { tradeName: "Kone Assurances" });
      const path = `/countries/CI/products/auto/quote-options?offerIds=${seed.offer.id},${second.offer.id},${crypto.randomUUID()},not-a-uuid`;

      const closed = quoteOptionsResponseSchema.parse(await readJson(await harness.request(path)));
      expect(closed.multiBrokerAvailable).toBe(false);
      expect(closed.documentUploadEnabled).toBe(false);
      expect(closed.brokers.map((broker) => broker.id).sort()).toEqual([seed.partner.id, second.partner.id].sort());
      for (const broker of closed.brokers) expect(Object.keys(broker).sort()).toEqual(["displayName", "id"]);
      expect(closed.offers.map((offer) => offer.offerId).sort()).toEqual([seed.offer.id, second.offer.id].sort());
      expect(closed.offers.find((offer) => offer.offerId === second.offer.id)).toMatchObject({ partnerId: second.partner.id, partnerName: "Kone Assurances" });

      await openMultiBroker(harness);
      // `product_document_upload_enabled` is a product flag (read through the effective product flags), not a global one.
      await harness.runtime.products.service.update(seed.product.id, {
        status: "public",
        flags: { ...seed.product.flags, product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true, product_manual_review_required: false, product_document_upload_enabled: true },
        reason: "documents facultatifs"
      }, superAdmin);
      const open = quoteOptionsResponseSchema.parse(await readJson(await harness.request(path)));
      expect(open.multiBrokerAvailable).toBe(true);
      expect(open.documentUploadEnabled).toBe(true);

      // A suspended broker is no longer proposed.
      await harness.runtime.partners.service.update(second.partner.id, { status: "suspended", suspensionReason: "controle", reason: "Suspension pour controle" }, superAdmin);
      const after = quoteOptionsResponseSchema.parse(await readJson(await harness.request(path)));
      expect(after.brokers.map((broker) => broker.id)).toEqual([seed.partner.id]);
      expect(after.offers.map((offer) => offer.offerId)).toEqual([seed.offer.id]);
    });
  });

  describe("multi-offer submission (COMP-009)", () => {
    it("ignores the additional offers while the multi-broker flag is closed, even with the consent box checked", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const second = await seedPartner(harness, seed, "Courtier Deux");

      const confirmation = await submitQuote(harness, seed, {
        selectedOfferId: seed.offer.id,
        additionalOfferIds: [second.offer.id],
        consent: { multiBrokerAccepted: true }
      });
      expect(confirmation).toMatchObject({ status: "routed", additionalOffersIgnored: true });
      const { quote, assignments } = await lastQuote(harness, confirmation.publicReference);
      expect(assignments.map((item) => item.partnerTenantId)).toEqual([seed.partner.id]);
      expect((await harness.runtime.consent.service.findRecord(quote.consentRecordId))?.intendedRecipient).not.toMatch(/^partners:/);
    });

    it("routes one assignment per broker when the flag is open and the consent names them", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const second = await seedPartner(harness, seed, "Courtier Deux");
      const third = await seedPartner(harness, seed, "Courtier Trois");
      await openMultiBroker(harness);

      const two = await submitQuote(harness, seed, {
        selectedOfferId: seed.offer.id,
        additionalOfferIds: [second.offer.id],
        consent: { multiBrokerAccepted: true }
      });
      expect(two).toMatchObject({ status: "routed", requestedPartnerCount: 2, retainedPartnerCount: 2 });
      expect(two.additionalOffersIgnored).not.toBe(true);
      const first = await lastQuote(harness, two.publicReference);
      expect(first.assignments.map((item) => item.partnerTenantId).sort()).toEqual([seed.partner.id, second.partner.id].sort());
      const consentRecord = await harness.runtime.consent.service.findRecord(first.quote.consentRecordId);
      expect(consentRecord?.intendedRecipient).toBe(`partners:${[seed.partner.id, second.partner.id].join(",")}`);
      const recorded = await harness.runtime.consent.service.searchRecords(seed.admin);
      expect(recorded.some((record) => record.intendedRecipient?.startsWith("partners:"))).toBe(true);

      const three = await submitQuote(harness, seed, {
        selectedOfferId: seed.offer.id,
        additionalOfferIds: [second.offer.id, third.offer.id],
        consent: { multiBrokerAccepted: true }
      });
      expect(three).toMatchObject({ requestedPartnerCount: 3, retainedPartnerCount: 3 });
      const triple = await lastQuote(harness, three.publicReference);
      expect(triple.assignments.map((item) => item.partnerTenantId).sort()).toEqual([seed.partner.id, second.partner.id, third.partner.id].sort());
      expect((await harness.runtime.consent.service.findRecord(triple.quote.consentRecordId))?.intendedRecipient).toMatch(/^partners:/);
    });

    it("keeps a single broker when the flag is open but the visitor did not check the multi-broker box", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const second = await seedPartner(harness, seed, "Courtier Deux");
      await openMultiBroker(harness);

      const confirmation = await submitQuote(harness, seed, {
        selectedOfferId: seed.offer.id,
        additionalOfferIds: [second.offer.id],
        consent: { multiBrokerAccepted: false }
      });
      expect(confirmation).toMatchObject({ status: "routed", additionalOffersIgnored: true });
      const { assignments } = await lastQuote(harness, confirmation.publicReference);
      expect(assignments.map((item) => item.partnerTenantId)).toEqual([seed.partner.id]);
    });
  });

  describe("direct broker choice (H2)", () => {
    it("routes an eligible chosen broker first and falls back to the standard routing when it is not eligible", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const chosen = await seedPartner(harness, seed, "Courtier Choisi");
      await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, productId: seed.product.id, mode: "priority", priorities: [{ partnerTenantId: seed.partner.id, priority: 1 }], reason: "Priorite au courtier historique" });

      const retained = await submitQuote(harness, seed, { preferredPartnerId: chosen.partner.id });
      expect(retained).toMatchObject({ status: "routed", chosenPartnerRetained: true });
      const kept = await lastQuote(harness, retained.publicReference);
      expect(kept.assignments.map((item) => item.partnerTenantId)).toEqual([chosen.partner.id]);
      expect(kept.decision.reasons).toContain("chosen_broker");
      expect(kept.quote.chosenPartnerTenantId).toBe(chosen.partner.id);

      // The broker stops being eligible: the visitor is not blocked, routing is standard.
      await harness.runtime.partners.service.update(chosen.partner.id, { status: "suspended", suspensionReason: "controle", reason: "Suspension pour controle" }, superAdmin);
      const fallback = await submitQuote(harness, seed, { preferredPartnerId: chosen.partner.id });
      expect(fallback).toMatchObject({ status: "routed", chosenPartnerRetained: false });
      const standard = await lastQuote(harness, fallback.publicReference);
      expect(standard.assignments.map((item) => item.partnerTenantId)).toEqual([seed.partner.id]);
      expect(standard.decision.reasons).not.toContain("chosen_broker");
    });
  });

  describe("generic fields (PRD section 16)", () => {
    it("composes the display name from first and last name and shows it to the broker", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const email = "prenom-nom@example.test";
      const confirmation = await submitQuote(harness, seed, { contact: { displayName: undefined, firstName: "Awa", lastName: "Kouassi", email } });
      const { quote, assignments } = await lastQuote(harness, confirmation.publicReference);
      const prospect = await harness.runtime.prospects.service.require(quote.prospectId);
      expect(prospect.displayName).toBe("Awa Kouassi");

      const broker: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
      const detail = await readJson<{ contact: Record<string, unknown> }>(await harness.request(`/broker/starter/leads/${assignments[0]!.id}`, { headers: actorHeaders(broker) }));
      expect(JSON.stringify(detail.contact)).toContain("Awa Kouassi");
      expect(detail.contact.email ?? detail.contact.emailNormalized).toBe(email);
    });

    it("leaves the legacy display name untouched when sent alone", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const confirmation = await submitQuote(harness, seed, { contact: { displayName: "Moussa Traore" } });
      const { quote } = await lastQuote(harness, confirmation.publicReference);
      expect((await harness.runtime.prospects.service.require(quote.prospectId)).displayName).toBe("Moussa Traore");
    });

    it("persists the marketing source on the request and never hands it to the broker", async () => {
      harness = await createRuntimeHttpHarness();
      const seed = await seedPublicRuntime(harness.runtime);
      const confirmation = await submitQuote(harness, seed, {
        marketingSource: { utmSource: "newsletter-oct", utmMedium: "email", utmCampaign: "rentree", referrerHost: "partenaire.example" }
      });
      const { quote, assignments } = await lastQuote(harness, confirmation.publicReference);
      expect(quote.marketingSource).toMatchObject({ utmSource: "newsletter-oct", utmMedium: "email", utmCampaign: "rentree", referrerHost: "partenaire.example" });

      const broker: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
      const detailText = await (await harness.request(`/broker/starter/leads/${assignments[0]!.id}`, { headers: actorHeaders(broker) })).text();
      expect(detailText).not.toContain("newsletter-oct");
      expect(detailText).not.toContain("rentree");
      expect(detailText).not.toContain("partenaire.example");
      expect(detailText).not.toContain("marketingSource");
      // Neither the assignment contact nor the stored answers carry it.
      expect(JSON.stringify(assignments[0]!.contact ?? {})).not.toContain("newsletter-oct");
      expect(JSON.stringify(quote.payload ?? {})).not.toContain("newsletter-oct");
    });
  });

  describe("missing documents reminder (PRD section 23)", () => {
    async function openDocumentRequest(email: string) {
      const active = harness!;
      const seed = await seedPublicRuntime(active.runtime);
      await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true, reason: "avis juridique L-08 obtenu" }, seed.admin);
      const mailer = new RecordingMailer();
      const mailDelivery = delivery(active.runtime, mailer);
      return { active, seed, mailer, mailDelivery, email };
    }

    async function requestDocuments(active: RuntimeHttpHarness, seed: Seed, email: string, label: string) {
      const confirmation = await submitQuote(active, seed, { contact: { email } });
      const { assignments } = await lastQuote(active, confirmation.publicReference);
      const broker: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
      const accepted = await active.request(`/broker/starter/leads/${assignments[0]!.id}/accept`, { method: "POST", headers: actorHeaders(broker) });
      expect(accepted.status, await accepted.clone().text()).toBe(201);
      const created = await active.request(`/broker/starter/leads/${assignments[0]!.id}/document-requests`, {
        method: "POST",
        headers: { ...actorHeaders(broker), "content-type": "application/json" },
        body: JSON.stringify({ label })
      });
      expect(created.status, await created.clone().text()).toBe(201);
      return confirmation;
    }

    it("queues a single reminder after three days, delivers it to the request address only and honours the opt-out", async () => {
      harness = await createRuntimeHttpHarness();
      const { active, seed, mailer, mailDelivery } = await openDocumentRequest("ignored");
      const label = "Carte grise du vehicule";
      const address = "relance-visiteur@example.test";
      await requestDocuments(active, seed, address, label);
      // A second, unrelated visitor with an open request of its own (F1 regression guard).
      const otherAddress = "autre-visiteur@example.test";
      const other = await requestDocuments(active, seed, otherAddress, "Permis de conduire");
      const reminderOf = async () => (await active.runtime.notifications.service.list()).filter((notification) => notification.type === "visitor_documents_reminder");
      const t0 = Date.now();

      const early = await active.runtime.documentReminders.run(new Date(t0 + 2 * DAY));
      expect(early.queued).toBe(0);
      expect(await reminderOf()).toHaveLength(0);

      const due = await active.runtime.documentReminders.run(new Date(t0 + 3 * DAY + 60_000));
      expect(due.queued).toBe(2);
      expect(await reminderOf()).toHaveLength(2);

      const again = await active.runtime.documentReminders.run(new Date(t0 + 3 * DAY + 120_000));
      expect(again.queued).toBe(0);
      const dueAgain = await active.runtime.documentReminders.runIfDue(new Date(t0 + 4 * DAY));
      expect(dueAgain.queued).toBe(0);
      expect(await reminderOf()).toHaveLength(2);

      const run = await mailDelivery.processDueNotifications({ limit: 100 });
      expect(run.failed).toBe(0);
      const reminders = mailer.sent.filter((mail) => mail.purpose === "quote_visitor_documents_reminder");
      expect(reminders.map((mail) => mail.to).sort()).toEqual([address, otherAddress].sort());
      const mine = reminders.find((mail) => mail.to === address)!;
      const text = `${mine.subject}\n${mine.body}\n${mine.html ?? ""}`;
      expect(text).not.toContain(label);
      expect(text).not.toContain("Permis de conduire");
      expect(text).toMatch(/unsubscribe|desinscri|désinscri/i);
      expect(text).toContain("http://public.test");
      // Each visitor receives exactly one reminder, with a different link.
      expect(mailer.sent.filter((mail) => mail.to === otherAddress && mail.purpose === "quote_visitor_documents_reminder")).toHaveLength(1);
      expect(other.publicReference).not.toBe("");

      // Unsubscribe the address before the J+3 of a third request: no reminder.
      const unsubscribed = "desinscrit@example.test";
      await active.runtime.satisfactionSurveys.unsubscribe.unsubscribe({ token: active.runtime.satisfactionSurveys.unsubscribe.reminderLinkToken(unsubscribed, "fr") });
      expect(await active.runtime.satisfactionSurveys.unsubscribe.isUnsubscribedFromReminders(unsubscribed)).toBe(true);
      await requestDocuments(active, seed, unsubscribed, "Attestation");
      const t1 = Date.now();
      const skipped = await active.runtime.documentReminders.run(new Date(t1 + 3 * DAY + 60_000));
      expect(skipped.queued).toBe(0);
      expect(await reminderOf()).toHaveLength(2);
      await mailDelivery.processDueNotifications({ limit: 100 });
      // Transactional e-mails (receipt, document request) still reach the address; the reminder never does.
      expect(mailer.sent.some((mail) => mail.to === unsubscribed && mail.purpose === "quote_visitor_documents_reminder")).toBe(false);
    });
  });
});
