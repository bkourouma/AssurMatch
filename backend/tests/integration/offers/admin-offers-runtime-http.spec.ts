import { afterEach, describe, expect, it } from "vitest";
import type { AdminOfferDetailView, AdminOfferListItem } from "../../../../packages/shared/contracts/offer-content";
import type { ActorContext } from "../../../src/modules/common/types";
import { OfferAuditActions } from "../../../src/modules/offers/offer-lifecycle.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, seedWaitlistCountry, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance-052", roles: ["compliance_admin"], mfaVerified: true };
const contentAdmin: ActorContext = { actorId: "content-052", roles: ["content_admin"], mfaVerified: true };

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

function offerBody(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    countryId: seed.country.id,
    productId: seed.product.id,
    partnerTenantId: seed.partner.id,
    name: "Auto Admin",
    insurerName: "Allianz",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 20000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Fiche assureur",
    reason: "Preparation catalogue",
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

async function createSubmitted(harness: RuntimeHttpHarness, actor: ActorContext, body: Record<string, unknown>): Promise<AdminOfferDetailView> {
  const created = await call(harness, actor, "POST", "/admin/offers", body);
  expect(created.status).toBe(201);
  const offer = await readJson<AdminOfferDetailView>(created);
  expect((await call(harness, actor, "POST", `/admin/offers/${offer.id}/submit`, { reason: "Soumission conformite" })).status).toBe(201);
  return offer;
}

async function publicOffers(harness: RuntimeHttpHarness): Promise<Array<{ id: string; name: string; isSponsored: boolean; indicativePriceMin?: number }>> {
  return readJson(await harness.request("/countries/CI/products/auto/offers"));
}

describe("spec 052 admin offers runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("restricts reads and writes to the country scope, the stored country included", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const senegal = (await seedWaitlistCountry(harness.runtime)).country;
    const senegalOffer = await readJson<AdminOfferDetailView>(await call(harness, superAdmin, "POST", "/admin/offers", offerBody(seed, { countryId: senegal.id, partnerTenantId: undefined, name: "Offre SN" })));
    const adminPaysCi: ActorContext = { actorId: "ap-ci", roles: ["admin_pays"], mfaVerified: true, countryScopes: [seed.country.id] };

    const list = await readJson<AdminOfferListItem[]>(await call(harness, adminPaysCi, "GET", "/admin/offers"));
    expect(list.map((item) => item.countryId)).toEqual([seed.country.id]);
    expect((await call(harness, adminPaysCi, "GET", `/admin/offers/${senegalOffer.id}`)).status).toBe(403);
    // C3: the body names CI, but the stored offer is in SN.
    const patch = await call(harness, adminPaysCi, "PATCH", `/admin/offers/${senegalOffer.id}`, offerBody(seed, { partnerTenantId: undefined }));
    expect(patch.status).toBe(403);
    const all = await readJson<AdminOfferListItem[]>(await call(harness, superAdmin, "GET", "/admin/offers"));
    expect(all).toHaveLength(2);
    expect((await call(harness, superAdmin, "GET", `/admin/offers?countryId=${senegal.id}`)).ok).toBe(true);
    expect((await readJson<AdminOfferListItem[]>(await call(harness, superAdmin, "GET", `/admin/offers?countryId=${senegal.id}`))).map((item) => item.id)).toEqual([senegalOffer.id]);
    expect(harness.runtime.audit.writer.search({ action: OfferAuditActions.accessRefused }).map((entry) => entry.reason)).toContain("out_of_scope_country");
  });

  it("reserves validation, refusal and suspension to compliance and checks eligibility and dates", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const adminPays: ActorContext = { actorId: "ap-ci", roles: ["admin_pays"], mfaVerified: true, countryScopes: [seed.country.id] };
    const offer = await createSubmitted(harness, adminPays, offerBody(seed));

    for (const actor of [adminPays, contentAdmin]) {
      expect((await call(harness, actor, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Validation non autorisee" })).status).toBe(403);
      expect((await call(harness, actor, "POST", `/admin/offers/${seed.offer.id}/suspend`, { reason: "Suspension non autorisee" })).status).toBe(403);
    }

    // The broker is no longer eligible: validation is blocked with the reason.
    await harness.runtime.partners.service.update(seed.partner.id, { status: "suspended", suspensionReason: "controle", reason: "Suspension pour controle" }, superAdmin);
    const blocked = await call(harness, compliance, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Validation conformite" });
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({ code: "OFFER_VALIDATION_BLOCKED", blockers: expect.arrayContaining([{ code: "partner_not_active" }]) });
    await harness.runtime.partners.service.update(seed.partner.id, { status: "active", reason: "Reprise apres controle" }, superAdmin);

    // Expired since submission.
    const pending = (await harness.runtime.offers.repository.listVersions(offer.id))[0]!;
    await harness.runtime.offers.repository.updateVersion(pending.id, { validFrom: new Date("2020-01-01T00:00:00.000Z"), validUntil: new Date("2021-01-01T00:00:00.000Z") });
    const expired = await call(harness, compliance, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Validation conformite" });
    expect(expired.status).toBe(422);
    expect(await expired.json()).toMatchObject({ blockers: expect.arrayContaining([{ code: "offer_expired", field: "validUntil" }]) });
    await harness.runtime.offers.repository.updateVersion(pending.id, { validFrom: new Date("2026-01-01T00:00:00.000Z"), validUntil: new Date("2030-01-01T00:00:00.000Z") });

    const validated = await call(harness, compliance, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Validation conformite" });
    expect(validated.status).toBe(201);
    expect(await readJson<AdminOfferDetailView>(validated)).toMatchObject({ status: "published", published: { versionNumber: 1, lastDecision: "validated" } });
    expect((await publicOffers(harness)).map((item) => item.id)).toContain(offer.id);
    expect((await call(harness, compliance, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Deuxieme validation" })).status).toBe(409);

    const suspended = await call(harness, compliance, "POST", `/admin/offers/${offer.id}/suspend`, { reason: "Mention a corriger" });
    expect(suspended.status).toBe(201);
    expect(await readJson<AdminOfferDetailView>(suspended)).toMatchObject({ status: "suspended", suspensionReason: "Mention a corriger" });
    expect((await publicOffers(harness)).map((item) => item.id)).not.toContain(offer.id);
    const inbox = await harness.runtime.notifications.dispatch.listInApp(seed.partner.id);
    expect(inbox.map((item) => item.type)).toEqual(expect.arrayContaining(["offer_validated", "offer_suspended"]));
    expect(harness.runtime.audit.writer.search({ action: OfferAuditActions.accessRefused }).map((entry) => entry.reason)).toContain("compliance_required");
  });

  it("versions admin edits with a diff, keeps v1 on refusal, sponsors only through validation, and accepts the former validate body", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.setFlag({ key: "sponsored_offers_enabled", scopeType: "global", value: true, reason: "sponsorship pilot" }, superAdmin);
    const offerId = seed.offer.id;

    const edited = await call(harness, contentAdmin, "PATCH", `/admin/offers/${offerId}`, offerBody(seed, { name: "Auto Runtime", indicativePriceMin: 12000, isSponsored: true, sponsorLabel: "Sponsorise", reason: "Mise en avant" }));
    expect(edited.status).toBe(200);
    const detail = await readJson<AdminOfferDetailView>(edited);
    expect(detail.pending?.versionNumber).toBe(2);
    expect(detail.diff.map((entry) => entry.field)).toEqual(expect.arrayContaining(["indicativePriceMin", "isSponsored", "insurerName"]));
    expect(detail.diff.find((entry) => entry.field === "indicativePriceMin")).toEqual({ field: "indicativePriceMin", published: 10000, pending: 12000 });
    expect((await publicOffers(harness)).find((item) => item.id === offerId)).toMatchObject({ isSponsored: false, indicativePriceMin: 10000 });

    await call(harness, contentAdmin, "POST", `/admin/offers/${offerId}/submit`, { reason: "Soumission sponsorisation" });
    // Former body: `validationStatus: "rejected"` is a refusal.
    const rejected = await call(harness, compliance, "POST", `/admin/offers/${offerId}/validate`, { validationStatus: "rejected", reason: "Libelle a revoir" });
    expect(rejected.status).toBe(201);
    expect(await readJson<AdminOfferDetailView>(rejected)).toMatchObject({ status: "published", pending: { status: "draft", decisionReason: "Libelle a revoir" } });
    expect((await publicOffers(harness)).find((item) => item.id === offerId)).toMatchObject({ isSponsored: false, indicativePriceMin: 10000 });

    await call(harness, contentAdmin, "POST", `/admin/offers/${offerId}/submit`, { reason: "Nouvelle soumission" });
    expect((await call(harness, compliance, "POST", `/admin/offers/${offerId}/validate`, { validationStatus: "validated", reason: "Sponsorisation conforme" })).status).toBe(201);
    expect((await publicOffers(harness)).find((item) => item.id === offerId)).toMatchObject({ isSponsored: true, indicativePriceMin: 12000 });
    const sponsored = await readJson<AdminOfferListItem[]>(await call(harness, contentAdmin, "GET", "/admin/offers?sponsored=true"));
    expect(sponsored.map((item) => item.id)).toEqual([offerId]);
    const versions = (await readJson<AdminOfferDetailView>(await call(harness, contentAdmin, "GET", `/admin/offers/${offerId}`))).versions;
    expect(versions.map((version) => [version.versionNumber, version.status])).toEqual([[2, "published"], [1, "archived"]]);
  });

  it("filters offers expiring within N days; the scheduled job (spec 061) notifies the broker once per version", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const offer = await createSubmitted(harness, superAdmin, offerBody(seed, { name: "Auto Bientot", validUntil: soon }));
    await call(harness, compliance, "POST", `/admin/offers/${offer.id}/validate`, { reason: "Validation conformite" });

    const expiring = await readJson<AdminOfferListItem[]>(await call(harness, compliance, "GET", "/admin/offers?expiringWithinDays=15"));
    expect(expiring.map((item) => item.id)).toEqual([offer.id]);
    expect(expiring[0]).toMatchObject({ expiringSoon: true, status: "published" });
    await call(harness, compliance, "GET", "/admin/offers");
    // Spec 061 FR-001: reading a list no longer writes reminders; the worker job does, once.
    const inbox = async () => (await harness!.runtime.notifications.dispatch.listInApp(seed.partner.id)).filter((item) => item.type === "offer_expiring");
    expect(await inbox()).toHaveLength(0);
    await harness.runtime.scheduledAlerts.run();
    await harness.runtime.scheduledAlerts.run();
    expect(await inbox()).toHaveLength(1);
    expect((await call(harness, compliance, "GET", "/admin/offers?expiringWithinDays=abc")).status).toBe(400);
  });
});
