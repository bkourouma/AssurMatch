import { afterEach, describe, expect, it } from "vitest";
import type { BrokerOfferView } from "../../../../packages/shared/contracts/offer-content";
import type { ActorContext } from "../../../src/modules/common/types";
import { OfferAuditActions } from "../../../src/modules/offers/offer-lifecycle.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, seedWaitlistCountry, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance-052", roles: ["compliance_admin"], mfaVerified: true };

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

function broker(partnerTenantId: string, role: ActorContext["roles"][number] = "broker_owner_pro"): ActorContext {
  return { actorId: `${role}-${partnerTenantId.slice(0, 6)}`, roles: [role], partnerTenantId, partnerPlan: "pro", mfaVerified: true };
}

function completeContent(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    countryId: seed.country.id,
    productId: seed.product.id,
    name: "Auto Courtier",
    insurerName: "Sunu Assurances",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 30000,
    indicativePriceMax: 45000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Grille tarifaire du cabinet",
    ...overrides
  };
}

async function call(harness: RuntimeHttpHarness, actor: ActorContext, method: string, path: string, body?: unknown) {
  return harness.request(path, {
    method,
    headers: { ...actorHeaders(actor), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function publicNames(harness: RuntimeHttpHarness): Promise<Array<{ name: string; indicativePriceMin?: number }>> {
  return readJson(await harness.request("/countries/CI/products/auto/offers"));
}

describe("spec 052 broker offers runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lets the owner create a draft in its coverage only, with indicative mentions, and submit it complete", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const waitlist = await seedWaitlistCountry(harness.runtime);
    const health = await harness.runtime.products.service.create({ key: "sante", name: "Assurance sante" }, superAdmin);
    await harness.runtime.products.service.associateCountry(health.id, seed.country.id, superAdmin);
    const owner = broker(seed.partner.id);

    const created = await call(harness, owner, "POST", "/broker/offers", completeContent(seed, { insurerName: undefined }));
    expect(created.status).toBe(201);
    const view = await readJson<BrokerOfferView>(created);
    expect(view).toMatchObject({ status: "draft", offerStatus: "draft", isSponsored: false });
    expect(view.pending?.versionNumber).toBe(1);
    expect(view.pending?.content.publicDisclaimers).toContain("offre indicative");
    expect(view.pending?.authorId).toBeUndefined();
    expect((await publicNames(harness)).map((item) => item.name)).not.toContain("Auto Courtier");

    const otherCountry = await call(harness, owner, "POST", "/broker/offers", completeContent(seed, { countryId: waitlist.country.id }));
    expect(otherCountry.status).toBe(422);
    expect(await otherCountry.json()).toMatchObject({ code: "OFFER_SCOPE_NOT_COVERED", blockers: expect.arrayContaining([{ code: "partner_country_not_authorized" }]) });
    const otherProduct = await call(harness, owner, "POST", "/broker/offers", completeContent(seed, { productId: health.id }));
    expect(otherProduct.status).toBe(422);
    expect(await otherProduct.json()).toMatchObject({ code: "OFFER_SCOPE_NOT_COVERED", blockers: expect.arrayContaining([{ code: "partner_product_not_authorized" }]) });

    const forbidden = await call(harness, owner, "POST", "/broker/offers", completeContent(seed, { shortDescription: "Souscrire maintenant en ligne" }));
    expect(forbidden.status).toBe(400);
    expect((await forbidden.json() as { message: string }).message).toContain("souscrire maintenant");
    const sponsored = await call(harness, owner, "POST", "/broker/offers", completeContent(seed, { isSponsored: true }));
    expect(sponsored.status).toBe(403);

    const incomplete = await call(harness, owner, "POST", `/broker/offers/${view.id}/submit`, {});
    expect(incomplete.status).toBe(422);
    expect(await incomplete.json()).toMatchObject({ code: "OFFER_INCOMPLETE", blockers: [{ code: "missing_field", field: "insurerName" }] });

    const edited = await call(harness, owner, "PATCH", `/broker/offers/${view.id}`, { ...completeContent(seed), countryId: undefined, productId: undefined, expectedUpdatedAt: view.concurrencyToken });
    expect(edited.status).toBe(200);
    const submitted = await call(harness, owner, "POST", `/broker/offers/${view.id}/submit`, {});
    expect(submitted.status).toBe(200);
    expect(await readJson<BrokerOfferView>(submitted)).toMatchObject({ status: "submitted", pending: { status: "submitted" } });

    const queue = await readJson<Array<{ id: string; partnerName?: string }>>(await call(harness, compliance, "GET", "/admin/offers?queue=submitted"));
    expect(queue.map((item) => item.id)).toEqual([view.id]);
    expect(queue[0]?.partnerName).toBe("Broker CI Runtime");
    expect((await publicNames(harness)).map((item) => item.name)).not.toContain("Auto Courtier");
    expect(harness.runtime.audit.writer.search({ action: OfferAuditActions.actionRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["scope_not_covered", "offer_incomplete"]));
    expect(harness.runtime.audit.writer.search({ action: OfferAuditActions.accessRefused }).map((entry) => entry.reason)).toContain("sponsorship_admin_only");
  });

  it("lets agents and read-only users read only, hides other partners' offers and keeps a suspended partner read-only", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const other = await harness.runtime.partners.service.create({ legalName: "Autre Courtier", primaryEmail: "autre@broker.example", primaryWhatsApp: "+2250102030406", status: "active", quotaMonthlyLeads: 10 }, superAdmin);
    const owner = broker(seed.partner.id);
    const created = await readJson<BrokerOfferView>(await call(harness, owner, "POST", "/broker/offers", completeContent(seed)));

    for (const role of ["broker_agent", "broker_read_only"] as const) {
      const reader = broker(seed.partner.id, role);
      expect((await call(harness, reader, "POST", "/broker/offers", completeContent(seed))).status, role).toBe(403);
      expect((await call(harness, reader, "PATCH", `/broker/offers/${created.id}`, { ...completeContent(seed), countryId: undefined, productId: undefined })).status, role).toBe(403);
      const list = await call(harness, reader, "GET", "/broker/offers");
      expect(list.status, role).toBe(200);
      // The seeded "Auto Runtime" offer belongs to the same partner.
      expect((await readJson<BrokerOfferView[]>(list)).map((item) => item.id).sort(), role).toEqual([created.id, seed.offer.id].sort());
    }

    const stranger = broker(other.id);
    expect((await call(harness, stranger, "GET", `/broker/offers/${created.id}`)).status).toBe(404);
    const strangerWrite = await call(harness, stranger, "PATCH", `/broker/offers/${created.id}`, { ...completeContent(seed), countryId: undefined, productId: undefined });
    expect(strangerWrite.status).toBe(404);
    expect(await readJson<BrokerOfferView[]>(await call(harness, stranger, "GET", "/broker/offers"))).toEqual([]);
    expect(harness.runtime.audit.writer.search({ action: OfferAuditActions.accessRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["cross_tenant", "forbidden_role"]));

    await harness.runtime.partners.service.update(seed.partner.id, { status: "suspended", suspensionReason: "controle", reason: "Suspension pour controle" }, superAdmin);
    const refused = await call(harness, owner, "POST", `/broker/offers/${created.id}/submit`, {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "PARTNER_SUSPENDED" });
    expect((await call(harness, owner, "GET", "/broker/offers")).status).toBe(200);
  });

  it("versions a published offer: public content unchanged until validation, conflicts refused, refusal reason visible", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const owner = broker(seed.partner.id);
    const created = await readJson<BrokerOfferView>(await call(harness, owner, "POST", "/broker/offers", completeContent(seed)));
    await call(harness, owner, "POST", `/broker/offers/${created.id}/submit`, {});
    expect((await call(harness, compliance, "POST", `/admin/offers/${created.id}/validate`, { reason: "Offre conforme" })).status).toBe(201);
    expect((await publicNames(harness)).find((item) => item.name === "Auto Courtier")?.indicativePriceMin).toBe(30000);

    const published = await readJson<BrokerOfferView>(await call(harness, owner, "GET", `/broker/offers/${created.id}`));
    expect(published).toMatchObject({ status: "published", published: { versionNumber: 1 } });
    const inbox = await readJson<Array<{ type: string; targetId: string }>>(await call(harness, owner, "GET", "/broker/notifications/inbox"));
    expect(inbox.map((item) => item.type)).toContain("offer_validated");

    const v2 = await call(harness, owner, "PATCH", `/broker/offers/${created.id}`, { ...completeContent(seed, { indicativePriceMin: 35000 }), countryId: undefined, productId: undefined, expectedUpdatedAt: published.concurrencyToken });
    expect(v2.status).toBe(200);
    const v2View = await readJson<BrokerOfferView>(v2);
    expect(v2View).toMatchObject({ status: "published", pending: { versionNumber: 2, status: "draft" }, published: { versionNumber: 1 } });
    expect((await publicNames(harness)).find((item) => item.name === "Auto Courtier")?.indicativePriceMin).toBe(30000);

    const stale = await call(harness, owner, "PATCH", `/broker/offers/${created.id}`, { ...completeContent(seed, { indicativePriceMin: 36000 }), countryId: undefined, productId: undefined, expectedUpdatedAt: published.concurrencyToken });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "OFFER_VERSION_CONFLICT" });
    expect((await call(harness, owner, "POST", `/broker/offers/${created.id}/renew`, { validFrom: "2026-11-01T00:00:00.000Z", validUntil: "2031-01-01T00:00:00.000Z" })).status).toBe(409);

    await call(harness, owner, "POST", `/broker/offers/${created.id}/submit`, {});
    expect((await call(harness, compliance, "POST", `/admin/offers/${created.id}/reject`, { reason: "Tarif non documente" })).status).toBe(201);
    const afterReject = await readJson<BrokerOfferView>(await call(harness, owner, "GET", `/broker/offers/${created.id}`));
    expect(afterReject).toMatchObject({ status: "published", lastDecisionReason: "Tarif non documente", pending: { status: "draft", lastDecision: "rejected" } });
    expect((await publicNames(harness)).find((item) => item.name === "Auto Courtier")?.indicativePriceMin).toBe(30000);

    await call(harness, owner, "POST", `/broker/offers/${created.id}/submit`, {});
    await call(harness, compliance, "POST", `/admin/offers/${created.id}/validate`, { reason: "Offre conforme v2" });
    expect((await publicNames(harness)).find((item) => item.name === "Auto Courtier")?.indicativePriceMin).toBe(35000);
    const history = await readJson<BrokerOfferView>(await call(harness, owner, "GET", `/broker/offers/${created.id}`));
    expect(history.versions?.map((version) => [version.versionNumber, version.status])).toEqual([[2, "published"], [1, "archived"]]);

    const withdrawn = await call(harness, owner, "POST", `/broker/offers/${created.id}/withdraw`, { reason: "Fin de commercialisation" });
    expect(withdrawn.status).toBe(200);
    expect(await readJson<BrokerOfferView>(withdrawn)).toMatchObject({ status: "withdrawn" });
    expect((await publicNames(harness)).map((item) => item.name)).not.toContain("Auto Courtier");
  });
});
