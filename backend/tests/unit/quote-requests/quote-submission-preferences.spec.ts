import { describe, expect, it } from "vitest";
import { MULTI_BROKER_CONSENT, SINGLE_BROKER_CONSENT } from "../../../src/modules/leads/quote-routing.service";
import { composeContactDisplayName, pruneMarketingSource, selectedOfferRecipient, selectedOffersRecipient } from "../../../src/modules/quote-requests/quote-submission.service";
import { actor, createPreferencesHarness, ruleOf } from "./quote-preferences-harness";

describe("spec 067 quote submission: several offers (COMP-009)", () => {
  it("ignores the further offers when multi_broker_routing_enabled is closed, even with the multi-broker consent", async () => {
    const h = await createPreferencesHarness();
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const c = await h.addBroker("Broker C");
    const [offerA, offerB, offerC] = [h.addOffer(a), h.addOffer(b), h.addOffer(c)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB, offerC], multiBrokerAccepted: true }), actor);

    expect(confirmation).toMatchObject({ status: "routed", additionalOffersIgnored: true, requestedPartnerCount: 3, retainedPartnerCount: 1, selectedOfferPartnerRetained: true, chosenPartnerRetained: null });
    const { quote, assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(intendedRecipient).toBe(selectedOfferRecipient(a));
    expect(quote.additionalOfferIds).toBeUndefined();
    expect(h.ignoredAudits()).toEqual([
      { targetId: offerB, reason: "multi_broker_routing_disabled", role: "additional_offer" },
      { targetId: offerC, reason: "multi_broker_routing_disabled", role: "additional_offer" }
    ]);
  });

  it("ignores the further offers without the visitor's multi-broker consent, flag open", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const [offerA, offerB] = [h.addOffer(a), h.addOffer(b)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB], multiBrokerAccepted: false }), actor);

    expect(confirmation).toMatchObject({ additionalOffersIgnored: true, retainedPartnerCount: 1 });
    const { assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(intendedRecipient).toBe(`partner:${a}`);
    expect(h.ignoredAudits().map((entry) => entry.reason)).toEqual(["multi_broker_consent_missing"]);
  });

  it("routes up to three offers with flag and consent, naming every broker in the consent", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const c = await h.addBroker("Broker C");
    await h.addBroker("Broker Other");
    const [offerA, offerB, offerC] = [h.addOffer(a), h.addOffer(b), h.addOffer(c)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB, offerC], multiBrokerAccepted: true }), actor);

    expect(confirmation).toMatchObject({ status: "routed", additionalOffersIgnored: false, requestedPartnerCount: 3, retainedPartnerCount: 3, selectedOfferPartnerRetained: true });
    expect(confirmation.message).toContain("3 courtiers partenaires éligibles");
    const { quote, assignments, decision, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(intendedRecipient).toBe(selectedOffersRecipient([a, b, c]));
    expect(intendedRecipient).toBe(`partners:${a},${b},${c}`);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a, b, c]);
    expect(assignments.every((item) => item.assignmentReason === "selected_offer_partner" && item.recipientCount === 3)).toBe(true);
    expect(decision).toMatchObject({ selectedOfferId: offerA, selectedOfferOutcome: "retained", reasons: ["selected_offer_partner"], selectedPartnerTenantIds: [a, b, c] });
    expect(quote.additionalOfferIds).toEqual([offerB, offerC]);
  });

  it("caps the preferred brokers at three: a direct choice beyond three offers is ignored and audited", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const [a, b, c, d] = [await h.addBroker("Broker A"), await h.addBroker("Broker B"), await h.addBroker("Broker C"), await h.addBroker("Broker D")];
    const [offerA, offerB, offerC] = [h.addOffer(a), h.addOffer(b), h.addOffer(c)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB, offerC], preferredPartnerId: d, multiBrokerAccepted: true }), actor);

    const { assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments).toHaveLength(3);
    expect(assignments.map((item) => item.partnerTenantId)).not.toContain(d);
    expect(intendedRecipient).toBe(`partners:${a},${b},${c}`);
    expect(confirmation).toMatchObject({ chosenPartnerRetained: false, requestedPartnerCount: 4, retainedPartnerCount: 3 });
    expect(h.ignoredAudits()).toEqual([{ targetId: d, reason: "max_partners_reached", role: "chosen_broker" }]);
  });

  it("deduplicates two offers of the same broker into one recipient", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const [offerA1, offerA2, offerB] = [h.addOffer(a), h.addOffer(a), h.addOffer(b)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA1, additionalOfferIds: [offerA2, offerB], multiBrokerAccepted: true }), actor);

    const { assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a, b]);
    expect(intendedRecipient).toBe(`partners:${a},${b}`);
    expect(confirmation).toMatchObject({ requestedPartnerCount: 2, retainedPartnerCount: 2 });
  });

  it("drops and audits a further offer that fails verification", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const offerA = h.addOffer(a);
    const forged = crypto.randomUUID();

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [forged], multiBrokerAccepted: true }), actor);

    const { quote, assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(intendedRecipient).toBe(`partner:${a}`);
    expect(quote.additionalOfferIds).toBeUndefined();
    expect(h.ignoredAudits()).toEqual([{ targetId: forged, reason: "offer_not_found", role: "additional_offer" }]);
  });
});

describe("spec 067 quote submission: broker chosen directly (H2)", () => {
  it("routes the eligible chosen broker first, whatever the priority rule", async () => {
    const h = await createPreferencesHarness();
    const historical = await h.addBroker("Broker Historical");
    const chosen = await h.addBroker("Broker Chosen");
    h.switches.rule = ruleOf(h.countryId, h.productId, { mode: "priority", priorities: [{ partnerTenantId: historical, priority: 1 }] });

    const confirmation = await h.service.submit(h.submission({ preferredPartnerId: chosen }), actor);

    expect(confirmation).toMatchObject({ status: "routed", chosenPartnerRetained: true, requestedPartnerCount: 1, retainedPartnerCount: 1, selectedOfferPartnerRetained: null });
    expect(confirmation.message).not.toContain("sélectionné");
    const { quote, assignments, decision, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => [item.partnerTenantId, item.assignmentReason])).toEqual([[chosen, "chosen_broker"]]);
    expect(decision?.reasons).toEqual(["chosen_broker"]);
    expect(intendedRecipient).toBe(`partner:${chosen}`);
    expect(quote.chosenPartnerTenantId).toBe(chosen);
  });

  it("falls back to the standard routing when the chosen broker is not eligible", async () => {
    const h = await createPreferencesHarness();
    const standard = await h.addBroker("Broker Standard");
    const outOfScope = await h.addBroker("Broker Out Of Scope", { authorizeProduct: false });

    const confirmation = await h.service.submit(h.submission({ preferredPartnerId: outOfScope }), actor);

    expect(confirmation).toMatchObject({ status: "routed", chosenPartnerRetained: false, retainedPartnerCount: 0 });
    expect(confirmation.message).toContain("Le courtier que vous aviez sélectionné");
    const { quote, assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([standard]);
    expect(intendedRecipient).toBe(SINGLE_BROKER_CONSENT);
    expect(quote.chosenPartnerTenantId).toBeUndefined();
    expect(h.ignoredAudits()).toEqual([{ targetId: outOfScope, reason: "chosen_partner_not_eligible", role: "chosen_broker" }]);
  });

  it("ignores the direct choice, audited, when no broker-choice port is wired", async () => {
    const h = await createPreferencesHarness({ withBrokerChoice: false });
    const standard = await h.addBroker("Broker Standard");
    const chosen = await h.addBroker("Broker Chosen");
    h.switches.rule = ruleOf(h.countryId, h.productId, { mode: "priority", priorities: [{ partnerTenantId: standard, priority: 1 }] });

    const confirmation = await h.service.submit(h.submission({ preferredPartnerId: chosen }), actor);

    const { assignments } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([standard]);
    expect(confirmation.chosenPartnerRetained).toBe(false);
    expect(h.ignoredAudits().map((entry) => entry.reason)).toEqual(["broker_choice_unavailable"]);
  });

  it("keeps the offer's priority and ignores the direct choice when several brokers are not allowed", async () => {
    const h = await createPreferencesHarness();
    const a = await h.addBroker("Broker A");
    const chosen = await h.addBroker("Broker Chosen");
    const offerA = h.addOffer(a);

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, preferredPartnerId: chosen, multiBrokerAccepted: true }), actor);

    const { quote, assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(intendedRecipient).toBe(`partner:${a}`);
    expect(confirmation).toMatchObject({ chosenPartnerRetained: false, selectedOfferPartnerRetained: true });
    expect(quote.chosenPartnerTenantId).toBe(chosen);
    expect(h.ignoredAudits()).toEqual([{ targetId: chosen, reason: "multi_broker_routing_disabled", role: "chosen_broker" }]);
  });

  it("adds the chosen broker after the offer when flag and multi-broker consent allow it", async () => {
    const h = await createPreferencesHarness();
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const chosen = await h.addBroker("Broker Chosen");
    const offerA = h.addOffer(a);

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, preferredPartnerId: chosen, multiBrokerAccepted: true }), actor);

    const { assignments, decision, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => [item.partnerTenantId, item.assignmentReason])).toEqual([[a, "selected_offer_partner"], [chosen, "chosen_broker"]]);
    expect(decision?.reasons).toEqual(["selected_offer_partner", "chosen_broker"]);
    expect(intendedRecipient).toBe(`partners:${a},${chosen}`);
    expect(confirmation).toMatchObject({ chosenPartnerRetained: true, retainedPartnerCount: 2, requestedPartnerCount: 2 });
  });

  it("treats a chosen broker that is also the broker of the offer as one recipient", async () => {
    const h = await createPreferencesHarness();
    const a = await h.addBroker("Broker A");
    const offerA = h.addOffer(a);

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, preferredPartnerId: a }), actor);

    const { assignments, intendedRecipient } = await h.quoteOf(confirmation.publicReference);
    expect(assignments.map((item) => [item.partnerTenantId, item.assignmentReason])).toEqual([[a, "selected_offer_partner"]]);
    expect(intendedRecipient).toBe(`partner:${a}`);
    expect(confirmation).toMatchObject({ chosenPartnerRetained: true, requestedPartnerCount: 1 });
    expect(h.ignoredAudits()).toEqual([]);
  });

  it("keeps the category consent when nothing is preferred", async () => {
    const h = await createPreferencesHarness();
    await h.addBroker("Broker A");
    const confirmation = await h.service.submit(h.submission({ multiBrokerAccepted: true }), actor);
    expect((await h.quoteOf(confirmation.publicReference)).intendedRecipient).toBe(MULTI_BROKER_CONSENT);
    expect(confirmation.chosenPartnerRetained).toBeNull();
    expect(confirmation).not.toHaveProperty("requestedPartnerCount");
    expect(confirmation).not.toHaveProperty("additionalOffersIgnored");
  });
});

describe("spec 067 quote submission: generic fields", () => {
  it("composes the display name from first and last name and keeps the legacy display name", async () => {
    const h = await createPreferencesHarness();
    await h.addBroker("Broker A");
    const base = h.submission();
    await h.service.submit({ ...base, contact: { firstName: " Awa ", lastName: "Koné", email: "awa067@example.test", phone: "+2250708091901" } }, actor);
    await h.service.submit({ ...h.submission(), contact: { displayName: "Jean Test", email: "jean067@example.test", phone: "+2250708091902" } }, actor);
    await h.service.submit({ ...h.submission(), contact: { displayName: "Ancien", firstName: "Awa", lastName: "Traoré", email: "awa2067@example.test", phone: "+2250708091903" } }, actor);
    expect(h.prospectContacts.map((contact) => contact.displayName)).toEqual(["Awa Koné", "Jean Test", "Awa Traoré"]);
    expect(composeContactDisplayName({ firstName: "Awa" })).toBe("Awa");
    expect(composeContactDisplayName({})).toBeUndefined();
  });

  it("persists the pruned marketing source on the request and never in the broker payload", async () => {
    const h = await createPreferencesHarness();
    await h.addBroker("Broker A");
    const confirmation = await h.service.submit(h.submission({
      marketingSource: { utmSource: "google-ads-067", utmMedium: "", utmCampaign: "  ", referrerHost: "news.example" }
    }), actor);
    const { quote, assignments } = await h.quoteOf(confirmation.publicReference);
    expect(quote.marketingSource).toEqual({ utmSource: "google-ads-067", referrerHost: "news.example" });
    expect(JSON.stringify(quote.payload)).not.toContain("google-ads-067");
    expect(assignments).toHaveLength(1);
    expect(JSON.stringify(assignments)).not.toContain("google-ads-067");
    expect(JSON.stringify(assignments)).not.toContain("news.example");
    expect(pruneMarketingSource({ utmSource: " " })).toBeUndefined();
    expect(pruneMarketingSource(undefined)).toBeUndefined();
  });
});

describe("spec 067 manual review keeps the preferred brokers", () => {
  it("routes the preferred brokers persisted at submission after the review", async () => {
    const h = await createPreferencesHarness({ manualReview: true });
    h.switches.multiBroker = true;
    await h.addBroker("Broker Other");
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const chosen = await h.addBroker("Broker Chosen");
    const [offerA, offerB] = [h.addOffer(a), h.addOffer(b)];

    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB], preferredPartnerId: chosen, multiBrokerAccepted: true }), actor);
    expect(confirmation.status).toBe("manual_review");
    const before = await h.quoteOf(confirmation.publicReference);
    expect(before.assignments).toHaveLength(0);
    expect(before.intendedRecipient).toBe(`partners:${a},${b},${chosen}`);
    expect(before.quote).toMatchObject({ additionalOfferIds: [offerB], chosenPartnerTenantId: chosen });

    const outcome = await h.service.routeAfterReview(before.quote.id, actor, { reason: "Dossier vérifié" });

    expect(outcome.quote.status).toBe("routed");
    const after = await h.quoteOf(confirmation.publicReference);
    expect(after.assignments.map((item) => [item.partnerTenantId, item.assignmentReason])).toEqual([
      [a, "selected_offer_partner"],
      [b, "selected_offer_partner"],
      [chosen, "chosen_broker"]
    ]);
  });

  it("degrades to the first preferred broker when the flag was closed before the review", async () => {
    const h = await createPreferencesHarness({ manualReview: true });
    h.switches.multiBroker = true;
    await h.addBroker("Broker Other");
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const [offerA, offerB] = [h.addOffer(a), h.addOffer(b)];
    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB], multiBrokerAccepted: true }), actor);
    const { quote } = await h.quoteOf(confirmation.publicReference);

    h.switches.multiBroker = false;
    await h.service.routeAfterReview(quote.id, actor, { reason: "Dossier vérifié" });

    const after = await h.quoteOf(confirmation.publicReference);
    expect(after.assignments.map((item) => item.partnerTenantId)).toEqual([a]);
    expect(after.decision?.reasons).toEqual(["selected_offer_partner", "multi_broker_routing_disabled"]);
  });

  it("drops a further offer that is no longer public at review time", async () => {
    const h = await createPreferencesHarness({ manualReview: true });
    h.switches.multiBroker = true;
    const a = await h.addBroker("Broker A");
    const b = await h.addBroker("Broker B");
    const [offerA, offerB] = [h.addOffer(a), h.addOffer(b)];
    const confirmation = await h.service.submit(h.submission({ selectedOfferId: offerA, additionalOfferIds: [offerB], multiBrokerAccepted: true }), actor);
    const { quote } = await h.quoteOf(confirmation.publicReference);

    // The repository of offers forgets offer B (expired); only A stays preferred.
    const verify = (h.service as unknown as { deps: { selectedOffers: { verify: (id: string) => Promise<unknown> } } }).deps.selectedOffers;
    const original = verify.verify;
    verify.verify = async (id: string) => (id === offerB ? { accepted: false, reason: "offer_not_active" } : original(id));
    await h.service.routeAfterReview(quote.id, actor, { reason: "Dossier vérifié" });

    expect((await h.quoteOf(confirmation.publicReference)).assignments.map((item) => item.partnerTenantId)).toEqual([a]);
  });
});
