import { afterEach, describe, expect, it } from "vitest";
import { OFFER_AI_SUMMARY_DISCLAIMER, OFFER_AI_SUMMARY_LABEL, type OfferAiSummaryView } from "../../../packages/shared/contracts/ai.contracts";
import type { ActorContext } from "../../src/modules/common/types";
import { auditEntries, call, complianceAdmin, countryAdmin, superAdmin } from "./catalog/catalog-http-helpers";
import { createRuntimeHttpHarness, seedPublicRuntime, seedWaitlistCountry, type RuntimeHttpHarness } from "./runtime-http-test-utils";

// Lot 4 (spec 070): OFFER-010, read-only AI summary of a validated offer. Closed by default.
function broker(partnerTenantId: string, actorId = "broker-owner-summary"): ActorContext {
  return { actorId, roles: ["broker_owner_pro"], partnerTenantId, partnerPlan: "pro", mfaVerified: true };
}

describe("lot 4: offer AI summary over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("is closed by default for an admin and for the owner broker, and audits the read without any text", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const admin = await call<OfferAiSummaryView>(harness, complianceAdmin, "GET", `/admin/offers/${seed.offer.id}/ai-summary`);
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    expect(admin.body).toMatchObject({ enabled: false, available: false, label: OFFER_AI_SUMMARY_LABEL, disclaimer: OFFER_AI_SUMMARY_DISCLAIMER });
    expect(admin.body.reasons).toEqual(expect.arrayContaining(["ai_summary_enabled_off"]));
    expect(admin.body.summary).toBeUndefined();

    const owner = await call<OfferAiSummaryView>(harness, broker(seed.partner.id), "GET", `/broker/offers/${seed.offer.id}/ai-summary`);
    expect(owner.status, JSON.stringify(owner.body)).toBe(200);
    expect(owner.body).toMatchObject({ enabled: false, available: false });

    const reads = auditEntries(harness, "ai.offer_summary.read", "success");
    expect(reads.map((entry) => entry.scope.audience)).toEqual(expect.arrayContaining(["admin", "broker"]));
    expect(JSON.stringify(reads)).not.toContain("summary\":");
  });

  it("answers 404 to a broker of another firm, like for a missing offer, and refuses unauthorised callers", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const otherPartner = await harness.runtime.partners.service.create({ legalName: "Autre cabinet", primaryEmail: "autre@broker.example", primaryWhatsApp: "+2250102030406", status: "active", quotaMonthlyLeads: 10 }, superAdmin);

    const crossTenant = await call(harness, broker(otherPartner.id, "broker-other"), "GET", `/broker/offers/${seed.offer.id}/ai-summary`);
    expect(crossTenant.status).toBe(404);
    const missing = await call(harness, broker(seed.partner.id), "GET", "/broker/offers/12345678-1234-4234-8234-123456789012/ai-summary");
    expect(missing.status).toBe(404);
    expect((await call(harness, broker(seed.partner.id), "GET", "/broker/offers/not-a-uuid/ai-summary")).status).toBe(400);

    // A broker has no access to the admin route, an admin none to the broker route, an anonymous visitor to neither.
    expect((await call(harness, broker(seed.partner.id), "GET", `/admin/offers/${seed.offer.id}/ai-summary`)).status).toBe(403);
    expect((await call(harness, superAdmin, "GET", `/broker/offers/${seed.offer.id}/ai-summary`)).status).toBe(403);
    expect((await harness.request(`/admin/offers/${seed.offer.id}/ai-summary`)).status).toBe(401);
    expect((await harness.request(`/broker/offers/${seed.offer.id}/ai-summary`)).status).toBe(401);
    expect(auditEntries(harness, "offer.access_refused", "refused").length).toBeGreaterThan(0);

    // An admin scoped to another country is refused.
    const other = await seedWaitlistCountry(harness.runtime);
    expect((await call(harness, countryAdmin(other.country.id), "GET", `/admin/offers/${seed.offer.id}/ai-summary`)).status).toBe(403);
  });

  it("stays closed while the country has not enabled AI, and opens (without text) once the global and country flags are on", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_summary_enabled", scopeType: "global", value: true, reason: "test resume IA offre" }, superAdmin, { reference: "TEST-POL-070", approvedBy: "compliance" });

    const countryClosed = await call<OfferAiSummaryView>(harness, complianceAdmin, "GET", `/admin/offers/${seed.offer.id}/ai-summary`);
    expect(countryClosed.body).toMatchObject({ enabled: false, available: false });
    expect(countryClosed.body.reasons).toContain("country_ai_disabled");

    const country = await harness.runtime.countries.service.require(seed.country.id);
    await harness.runtime.countries.service.update(country.id, { status: country.status, flags: { ...country.flags, country_ai_enabled: true }, reason: "test resume IA offre" }, superAdmin);
    const open = await call<OfferAiSummaryView>(harness, complianceAdmin, "GET", `/admin/offers/${seed.offer.id}/ai-summary`);
    expect(open.status).toBe(200);
    // Nothing has been generated and validated yet: the route never triggers a generation.
    expect(open.body).toMatchObject({ enabled: true, available: false, reasons: ["no_validated_summary"] });
    expect(open.body.summary).toBeUndefined();
    const brokerView = await call<OfferAiSummaryView>(harness, broker(seed.partner.id), "GET", `/broker/offers/${seed.offer.id}/ai-summary`);
    expect(brokerView.body).toMatchObject({ enabled: true, available: false });
  });
});
