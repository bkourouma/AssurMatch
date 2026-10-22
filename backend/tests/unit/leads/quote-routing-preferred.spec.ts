import { describe, expect, it } from "vitest";
import { consentNamedPartners, MULTI_BROKER_CONSENT, type RoutableQuoteRequest } from "../../../src/modules/leads/quote-routing.service";
import { actor, createPreferencesHarness, ruleOf } from "../quote-requests/quote-preferences-harness";

type Harness = Awaited<ReturnType<typeof createPreferencesHarness>>;

async function consentFor(h: Harness, intendedRecipient: string): Promise<string> {
  const record = await h.consent.record({
    consentTextId: crypto.randomUUID(),
    subjectReference: `subject-${crypto.randomUUID()}`,
    purpose: "lead_transmission",
    countryId: h.countryId,
    productId: h.productId,
    channel: "public_web",
    intendedRecipient,
    status: "granted",
    grantedAt: new Date().toISOString()
  }, actor);
  return record.id;
}

function quoteFor(h: Harness, consentRecordId: string, overrides: Partial<RoutableQuoteRequest> = {}): RoutableQuoteRequest {
  return { id: crypto.randomUUID(), countryId: h.countryId, productId: h.productId, consentRecordId, status: "created", routingStatus: "not_started", ...overrides };
}

function degradeAudits(h: Harness): string[] {
  return h.audit.search({ action: "routing.evaluated" })
    .filter((entry) => (entry.context as { degradedToSingleBroker?: boolean } | undefined)?.degradedToSingleBroker === true)
    .map((entry) => entry.reason ?? "");
}

describe("spec 067 routing of several preferred brokers", () => {
  it("never fans out to several preferred brokers while multi_broker_routing_enabled is closed", async () => {
    const h = await createPreferencesHarness();
    const [a, b] = [await h.addBroker("Broker A"), await h.addBroker("Broker B")];
    const consentRecordId = await consentFor(h, `partners:${a},${b}`);

    const result = await h.routing.route(quoteFor(h, consentRecordId, { preferredPartnerTenantIds: [a, b], preferredPartnerTenantId: a }), actor);

    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(result.retainedPartnerTenantIds).toEqual([a]);
    expect(result.reasons).toEqual(["selected_offer_partner", "multi_broker_routing_disabled"]);
    expect(degradeAudits(h)).toEqual(["multi_broker_routing_disabled"]);
  });

  it("degrades to the first preferred broker when the consent names a single broker", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const [a, b] = [await h.addBroker("Broker A"), await h.addBroker("Broker B")];
    for (const recipient of [`partner:${a}`, MULTI_BROKER_CONSENT]) {
      const result = await h.routing.route(quoteFor(h, await consentFor(h, recipient), { preferredPartnerTenantIds: [a, b] }), actor);
      expect(result.assignments.map((item) => item.partnerTenantId), recipient).toEqual([a]);
      expect(result.reasons, recipient).toContain("consent_covers_single_broker");
    }
  });

  it("retains every preferred broker the consent names when the flag is open, capped at three", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const ids = [await h.addBroker("Broker A"), await h.addBroker("Broker B"), await h.addBroker("Broker C"), await h.addBroker("Broker D")];
    const consentRecordId = await consentFor(h, `partners:${ids.join(",")}`);

    const result = await h.routing.route(quoteFor(h, consentRecordId, { preferredPartnerTenantIds: ids }), actor);

    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual(ids.slice(0, 3));
    expect(result.assignments.every((item) => item.recipientCount === 3)).toBe(true);
  });

  it("keeps only the preferred brokers the consent names", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const [a, b, c] = [await h.addBroker("Broker A"), await h.addBroker("Broker B"), await h.addBroker("Broker C")];
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partners:${a},${b}`), { preferredPartnerTenantIds: [a, b, c] }), actor);
    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual([a, b]);
    expect(result.reasons).toContain("preferred_partner_skipped:consent_not_covering");
  });

  it("skips an ineligible preferred broker (quota included) and keeps the next one", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const full = await h.addBroker("Broker Full", { quotaMonthlyLeads: 1 });
    const b = await h.addBroker("Broker B");
    await h.routing.route(quoteFor(h, await consentFor(h, `partner:${full}`), { preferredPartnerTenantIds: [full] }), actor);

    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partners:${full},${b}`), { preferredPartnerTenantIds: [full, b] }), actor);

    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual([b]);
    expect(result.reasons).toEqual(["selected_offer_partner", "preferred_partner_skipped:partner_quota_exhausted"]);
  });

  it("falls back to the standard routing with the unavailable reason when no preferred broker is usable", async () => {
    const h = await createPreferencesHarness();
    const standard = await h.addBroker("Broker Standard");
    const outOfScope = await h.addBroker("Broker Out", { authorizeProduct: false });
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partner:${outOfScope}`), { preferredPartnerTenantIds: [outOfScope], chosenBrokerPartnerTenantId: outOfScope }), actor);
    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual([standard]);
    expect(result.reasons).toContain("selected_offer_partner_unavailable:partner_product_not_authorized");
    expect(result.retainedPartnerTenantIds).toBeUndefined();
  });

  it("honours an exclusive rule: only the exclusive partner can be retained", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const [a, b] = [await h.addBroker("Broker A"), await h.addBroker("Broker B")];
    h.switches.rule = ruleOf(h.countryId, h.productId, { mode: "exclusive", exclusivePartnerTenantId: b });
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partners:${a},${b}`), { preferredPartnerTenantIds: [a, b] }), actor);
    expect(result.assignments.map((item) => item.partnerTenantId)).toEqual([b]);
    expect(result.reasons).toContain("preferred_partner_skipped:exclusive_rule");
  });

  it("keeps a manual rule manual", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const [a, b] = [await h.addBroker("Broker A"), await h.addBroker("Broker B")];
    h.switches.rule = ruleOf(h.countryId, h.productId, { mode: "manual" });
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partners:${a},${b}`), { preferredPartnerTenantIds: [a, b] }), actor);
    expect(result.routingStatus).toBe("pending_manual_assignment");
    expect(result.assignments).toHaveLength(0);
  });

  it("uses the chosen_broker reason for a broker that comes from the direct choice", async () => {
    const h = await createPreferencesHarness();
    const chosen = await h.addBroker("Broker Chosen");
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partner:${chosen}`), { preferredPartnerTenantIds: [chosen], chosenBrokerPartnerTenantId: chosen }), actor);
    expect(result.assignments.map((item) => item.assignmentReason)).toEqual(["chosen_broker"]);
    expect(result.reasons).toEqual(["chosen_broker"]);
    expect(result.selectedOfferOutcome).toBeUndefined();
  });

  it("leaves the single selected-offer behaviour of spec 052 unchanged", async () => {
    const h = await createPreferencesHarness();
    await h.addBroker("Broker Other");
    const a = await h.addBroker("Broker A");
    const offerId = crypto.randomUUID();
    const result = await h.routing.route(quoteFor(h, await consentFor(h, `partner:${a}`), { selectedOfferId: offerId, selectedOfferOutcome: "accepted", preferredPartnerTenantId: a }), actor);
    expect(result).toMatchObject({ routingStatus: "assigned", reasons: ["selected_offer_partner"], selectedOfferOutcome: "retained" });
    expect(result.assignments.map((item) => [item.partnerTenantId, item.recipientCount])).toEqual([[a, 1]]);
    // Without an accepted offer the legacy single field is not a preference.
    const ignored = await h.routing.route(quoteFor(h, await consentFor(h, `partner:${a}`), { preferredPartnerTenantId: a }), actor);
    expect(ignored.reasons).not.toContain("selected_offer_partner");
  });

  it("parses named consents", () => {
    expect(consentNamedPartners("partners:a, b,c")).toEqual(["a", "b", "c"]);
    expect(consentNamedPartners("partner:a")).toEqual(["a"]);
    expect(consentNamedPartners(MULTI_BROKER_CONSENT)).toEqual([]);
    expect(consentNamedPartners(undefined)).toEqual([]);
  });
});
