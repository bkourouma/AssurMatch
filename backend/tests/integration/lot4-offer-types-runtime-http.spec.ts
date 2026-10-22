import { afterEach, describe, expect, it } from "vitest";
import type { AdminOfferDetailView, BrokerOfferView } from "../../../packages/shared/contracts/offer-content";
import type { AdminInsurerView } from "../../../packages/shared/contracts/insurer.contracts";
import type { ActorContext } from "../../src/modules/common/types";
import { OfferAuditActions } from "../../src/modules/offers/offer-lifecycle.service";
import { auditEntries, call, countryAdmin, superAdmin } from "./catalog/catalog-http-helpers";
import { OFFER_REVIEWER } from "./helpers/offer-test-helpers";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";

// Lot 4 (spec 070): PRD section 13, offer types (indicative, partner, insurer, private).
type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;
type ErrorBody = { code: string; message: string };

function broker(partnerTenantId: string): ActorContext {
  return { actorId: "broker-owner-types", roles: ["broker_owner_pro"], partnerTenantId, partnerPlan: "pro", mfaVerified: true };
}

function content(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    countryId: seed.country.id,
    productId: seed.product.id,
    name: "Auto lot 4",
    insurerName: "Sunu Assurances",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 30000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Grille tarifaire du cabinet",
    ...overrides
  };
}

describe("lot 4: offer types over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function publicIds(h: RuntimeHttpHarness): Promise<string[]> {
    const response = await h.request("/countries/CI/products/auto/offers");
    expect(response.status).toBe(200);
    return ((await response.json()) as Array<{ id: string }>).map((offer) => offer.id);
  }

  it("lets a broker create indicative and private offers only, never insurer or partner offers", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const owner = broker(seed.partner.id);

    for (const offerType of ["insurer", "partner"] as const) {
      const refused = await call<ErrorBody>(harness, owner, "POST", "/broker/offers", content(seed, { offerType, name: `Offre ${offerType}` }));
      expect(refused.status, offerType).toBe(403);
    }
    expect(auditEntries(harness, OfferAuditActions.accessRefused, "refused").some((entry) => entry.reason === "offer_type_admin_only")).toBe(true);

    const indicative = await call<BrokerOfferView>(harness, owner, "POST", "/broker/offers", content(seed, { name: "Offre indicative" }));
    expect(indicative.status, JSON.stringify(indicative.body)).toBe(201);
    expect(indicative.body.offerType).toBe("indicative");
    const privateOffer = await call<BrokerOfferView>(harness, owner, "POST", "/broker/offers", content(seed, { offerType: "private", name: "Offre privee" }));
    expect(privateOffer.status, JSON.stringify(privateOffer.body)).toBe(201);
    expect(privateOffer.body.offerType).toBe("private");

    // The type is fixed at creation.
    const retype = await call<ErrorBody>(harness, owner, "PATCH", `/broker/offers/${privateOffer.body.id}`, { ...content(seed, { offerType: "indicative" }), countryId: undefined, productId: undefined, expectedUpdatedAt: privateOffer.body.concurrencyToken });
    expect(retype.status).toBe(422);
    expect(retype.body.code).toBe("OFFER_TYPE_IMMUTABLE");
  });

  it("never exposes a validated private offer to visitors: not listed, not readable, not comparable", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const owner = broker(seed.partner.id);
    const before = await publicIds(harness);
    expect(before).toContain(seed.offer.id);

    const created = await call<BrokerOfferView>(harness, owner, "POST", "/broker/offers", content(seed, { offerType: "private", name: "Offre privee ouverte" }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await call(harness, owner, "POST", `/broker/offers/${created.body.id}/submit`, {})).status).toBe(200);
    const validated = await call(harness, OFFER_REVIEWER, "POST", `/admin/offers/${created.body.id}/validate`, { reason: "validation de l'offre privee" });
    expect(validated.status, JSON.stringify(validated.body)).toBe(201);

    // The most open conditions: public country and product, every journey flag open, offer validated and active.
    const stored = await harness.runtime.offers.repository.require(created.body.id);
    expect(stored.validationStatus).toBe("validated");
    expect(await publicIds(harness)).toEqual(before);

    const detail = await harness.request(`/offers/${created.body.id}`);
    expect(detail.status).toBe(404);
    expect((await harness.request(`/offers/${seed.offer.id}`)).status).toBe(200);

    const compare = await harness.request(`/offers/compare?ids=${seed.offer.id},${created.body.id}`);
    expect(compare.status).toBeGreaterThanOrEqual(400);
    const compareBody = JSON.stringify(await compare.json());
    expect(compareBody).not.toContain("Offre privee ouverte");

    // The owner still sees it in its own back-office.
    const own = await call<BrokerOfferView>(harness, owner, "GET", `/broker/offers/${created.body.id}`);
    expect(own.status).toBe(200);
    expect(own.body.offerType).toBe("private");
  });

  it("validates an insurer offer by compliance only, then publishes it", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const sunu = await call<AdminInsurerView>(harness, superAdmin, "POST", "/admin/insurers", { countryId: seed.country.id, name: "Sunu Assurances", code: "sunu-ci", reason: "referencement assureur lot 4" });
    expect(sunu.status).toBe(201);
    const countryOnly = countryAdmin(seed.country.id);

    const created = await call<AdminOfferDetailView>(harness, countryOnly, "POST", "/admin/offers", {
      ...content(seed, { insurerName: undefined, name: "Offre directe assureur" }),
      offerType: "insurer",
      // A publicly visible offer always has a responsible partner (validation blocker partner_missing).
      partnerTenantId: seed.partner.id,
      insurerId: sunu.body.id,
      reason: "offre portee par l'assureur"
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await harness.runtime.offers.repository.require(created.body.id)).offerType).toBe("insurer");
    expect((await call(harness, countryOnly, "POST", `/admin/offers/${created.body.id}/submit`, { reason: "soumission conformite" })).status).toBe(201);

    const refused = await call(harness, countryOnly, "POST", `/admin/offers/${created.body.id}/validate`, { reason: "validation par admin pays" });
    expect(refused.status).toBe(403);
    expect(await publicIds(harness)).not.toContain(created.body.id);

    const validated = await call(harness, OFFER_REVIEWER, "POST", `/admin/offers/${created.body.id}/validate`, { reason: "validation conformite" });
    expect(validated.status, JSON.stringify(validated.body)).toBe(201);
    expect(await publicIds(harness)).toContain(created.body.id);
    const detail = await harness.request(`/offers/${created.body.id}`);
    expect(detail.status).toBe(200);
  });
});
