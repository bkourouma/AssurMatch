import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { MULTI_BROKER_CONSENT } from "../../../src/modules/leads/quote-routing.service";
import { createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { seedAcceptedAccreditation } from "../helpers/partner-onboarding-seed";
import { publishOffer } from "../helpers/offer-test-helpers";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

interface Confirmation {
  publicReference: string;
  status: string;
  routed: boolean;
  selectedOfferPartnerRetained: boolean | null;
}

async function seedPartner(harness: RuntimeHttpHarness, seed: Seed, legalName: string, options: { tradeName?: string; quotaMonthlyLeads?: number } = {}) {
  const partner = await harness.runtime.partners.service.create({
    legalName,
    ...(options.tradeName ? { tradeName: options.tradeName } : {}),
    plan: "pro",
    primaryEmail: `${legalName.replace(/\s+/g, "").toLowerCase()}@broker.example`,
    primaryWhatsApp: "+2250102030409",
    status: "active",
    quotaMonthlyLeads: options.quotaMonthlyLeads ?? 0
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
    reason: "Offre du courtier choisi"
  }, superAdmin, superAdmin);
  return { partner, offer };
}

let sequence = 0;
async function submitQuote(harness: RuntimeHttpHarness, seed: Seed, selectedOfferId?: string): Promise<Confirmation> {
  sequence += 1;
  const suffix = String(sequence).padStart(2, "0");
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      ...(selectedOfferId ? { selectedOfferId } : {}),
      contact: { displayName: `Visiteur ${suffix}`, email: `visiteur052-${suffix}@example.test`, phone: `+22507080910${suffix}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
      ipAddress: `198.51.100.${sequence}`,
      sessionId: `offer-session-${suffix}`
    })
  });
  expect(response.status).toBe(201);
  return readJson<Confirmation>(response);
}

async function lastQuote(harness: RuntimeHttpHarness, publicReference: string) {
  const quote = (await harness.runtime.quoteRequests.submissions.list()).find((item) => item.publicReference === publicReference)!;
  const decision = (await harness.runtime.leads.decisions.list()).find((item) => item.quoteRequestId === quote.id)!;
  const assignments = (await harness.runtime.leads.assignments.list()).filter((item) => item.quoteRequestId === quote.id);
  return { quote, decision, assignments };
}

describe("spec 052 selected offer routing and named consent", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("retains the broker of the selected offer whatever the round-robin or priority rule", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const chosen = await seedPartner(harness, seed, "Courtier Choisi");
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, productId: seed.product.id, mode: "priority", priorities: [{ partnerTenantId: seed.partner.id, priority: 1 }], reason: "Priorite au courtier historique" });

    const confirmation = await submitQuote(harness, seed, chosen.offer.id);
    expect(confirmation).toMatchObject({ status: "routed", selectedOfferPartnerRetained: true });
    const { quote, decision, assignments } = await lastQuote(harness, confirmation.publicReference);
    expect(quote).toMatchObject({ selectedOfferId: chosen.offer.id, selectedOfferOutcome: "accepted" });
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([chosen.partner.id]);
    expect(decision).toMatchObject({ selectedOfferId: chosen.offer.id, selectedOfferOutcome: "retained", reasons: ["selected_offer_partner"] });
    expect((await harness.runtime.consent.service.findRecord(quote.consentRecordId))?.intendedRecipient).toBe(`partner:${chosen.partner.id}`);

    // Without an offer the priority rule applies unchanged.
    const standard = await submitQuote(harness, seed);
    expect(standard.selectedOfferPartnerRetained).toBeNull();
    expect((await lastQuote(harness, standard.publicReference)).assignments.map((item) => item.partnerTenantId)).toEqual([seed.partner.id]);
  });

  it("falls back to the standard routing with a logged reason when the offer's broker reached its quota", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const chosen = await seedPartner(harness, seed, "Courtier Plein", { quotaMonthlyLeads: 1 });
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, productId: seed.product.id, mode: "round_robin", reason: "Distribution equitable" });

    expect((await submitQuote(harness, seed, chosen.offer.id)).selectedOfferPartnerRetained).toBe(true);
    const second = await submitQuote(harness, seed, chosen.offer.id);
    expect(second).toMatchObject({ status: "routed", selectedOfferPartnerRetained: false });
    const { decision, assignments } = await lastQuote(harness, second.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([seed.partner.id]);
    expect(decision.selectedOfferOutcome).toBe("unavailable");
    expect(decision.reasons).toContain("selected_offer_partner_unavailable:partner_quota_exhausted");
  });

  it("ignores a forged, unpublished or other-scope offer without blocking the visitor", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const moto = await harness.runtime.products.service.create({ key: "moto", name: "Assurance moto" }, superAdmin);
    await harness.runtime.products.service.associateCountry(moto.id, seed.country.id, superAdmin);
    const otherScope = await harness.runtime.offers.adminService.create({
      countryId: seed.country.id,
      productId: moto.id,
      name: "Offre moto",
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      reason: "Offre d'un autre produit"
    }, superAdmin);
    const draft = await harness.runtime.offers.adminService.create({
      countryId: seed.country.id,
      productId: seed.product.id,
      partnerTenantId: seed.partner.id,
      name: "Offre brouillon",
      currency: "XOF",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      reason: "Offre jamais publiee"
    }, superAdmin);

    for (const [offerId, reason] of [[crypto.randomUUID(), "offer_not_found"], [otherScope.id, "offer_scope_mismatch"], [draft.id, "offer_not_active"]] as const) {
      const confirmation = await submitQuote(harness, seed, offerId);
      expect(confirmation, reason).toMatchObject({ status: "routed", selectedOfferPartnerRetained: false });
      const { quote, decision } = await lastQuote(harness, confirmation.publicReference);
      expect(quote, reason).toMatchObject({ selectedOfferOutcome: "ignored", selectedOfferIgnoredReason: reason });
      expect(decision.selectedOfferId, reason).toBeUndefined();
      expect((await harness.runtime.consent.service.findRecord(quote.consentRecordId))?.intendedRecipient).toBe("courtier_partenaire_eligible");
    }
    expect(harness.runtime.audit.writer.search({ action: "quote_request.selected_offer_ignored" }).map((entry) => entry.reason)).toEqual(["offer_not_found", "offer_scope_mismatch", "offer_not_active"]);
  });

  it("keeps a manual rule manual and never fans out a request carrying an offer", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const chosen = await seedPartner(harness, seed, "Courtier Manuel");
    const manual = await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, productId: seed.product.id, mode: "manual", reason: "Affectation manuelle" });
    const parked = await submitQuote(harness, seed, chosen.offer.id);
    expect(parked.selectedOfferPartnerRetained).toBe(false);
    const { quote, decision, assignments } = await lastQuote(harness, parked.publicReference);
    expect(quote.routingStatus).toBe("pending_manual_assignment");
    expect(assignments).toHaveLength(0);
    expect(decision).toMatchObject({ result: "pending_manual_assignment", selectedOfferId: chosen.offer.id, selectedOfferOutcome: "unavailable" });

    await harness.runtime.routingRules.update(superAdmin, manual.id, { status: "disabled", reason: "Fin du mode manuel" });
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, productId: seed.product.id, mode: "multi_send", maxRecipients: 3, priorities: [], reason: "Pilote multi-courtiers" });
    await harness.runtime.featureFlags.service.applyCompliancePolicy(
      { key: "multi_broker_routing_enabled", scopeType: "global", value: true, reason: "multi broker pilot" },
      superAdmin,
      { reference: "TEST-052-MB", approvedBy: "compliance" }
    );
    const consent = await harness.runtime.consent.service.record({
      consentTextId: seed.consentText.id,
      subjectReference: "subject-052-multi",
      purpose: "lead_transmission",
      countryId: seed.country.id,
      productId: seed.product.id,
      channel: "public_web",
      intendedRecipient: MULTI_BROKER_CONSENT,
      status: "granted",
      grantedAt: new Date().toISOString()
    }, superAdmin);
    const base = { countryId: seed.country.id, productId: seed.product.id, consentRecordId: consent.id, status: "created", routingStatus: "not_started" };
    const fanOut = await harness.runtime.leads.routing.route({ ...base, id: `quote-${crypto.randomUUID()}` }, superAdmin);
    expect(fanOut.assignments.length).toBeGreaterThan(1);
    const single = await harness.runtime.leads.routing.route({
      ...base,
      id: `quote-${crypto.randomUUID()}`,
      selectedOfferId: chosen.offer.id,
      selectedOfferOutcome: "accepted",
      preferredPartnerTenantId: chosen.partner.id
    }, superAdmin);
    expect(single.assignments.map((item) => item.partnerTenantId)).toEqual([chosen.partner.id]);
    expect(single.selectedOfferOutcome).toBe("retained");
  });

  it("names the broker of an eligible selected offer in the consent of the quote form", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const chosen = await seedPartner(harness, seed, "Cabinet Kone SARL", { tradeName: "Kone Assurances" });
    const generic = await readJson<{ consent: { content: string; contentHash: string }; offerPartnerName?: string }>(await harness.request("/countries/CI/products/auto/quote-form?language=fr"));
    const named = await readJson<{ consent: { content: string; contentHash: string }; offerPartnerName?: string }>(await harness.request(`/countries/CI/products/auto/quote-form?language=fr&offerId=${chosen.offer.id}`));
    expect(named.offerPartnerName).toBe("Kone Assurances");
    expect(named.consent.content).toContain("Kone Assurances");
    expect(generic.offerPartnerName).toBeUndefined();
    expect(generic.consent.content).not.toContain("Kone Assurances");
    expect(named.consent.contentHash).toBe(generic.consent.contentHash);

    const forged = await readJson<{ offerPartnerName?: string }>(await harness.request(`/countries/CI/products/auto/quote-form?language=fr&offerId=${crypto.randomUUID()}`));
    expect(forged.offerPartnerName).toBeUndefined();
    const invalid = await harness.request("/countries/CI/products/auto/quote-form?language=fr&offerId=not-a-uuid");
    expect(invalid.status).toBe(200);

    // A broker that stopped being eligible is no longer named.
    await harness.runtime.partners.service.update(chosen.partner.id, { status: "suspended", suspensionReason: "controle", reason: "Suspension pour controle" }, superAdmin);
    const after = await readJson<{ offerPartnerName?: string }>(await harness.request(`/countries/CI/products/auto/quote-form?language=fr&offerId=${chosen.offer.id}`));
    expect(after.offerPartnerName).toBeUndefined();
  });
});
