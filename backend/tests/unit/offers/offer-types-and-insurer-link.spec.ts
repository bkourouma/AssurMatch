import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { InsurersModule } from "../../../src/modules/insurers/insurers.module";
import { OffersModule } from "../../../src/modules/offers/offers.module";

const countryId = "00000000-0000-4000-8000-0000000070c1";
const otherCountryId = "00000000-0000-4000-8000-0000000070c2";
const productId = "00000000-0000-4000-8000-0000000070d1";
const partnerTenantId = "00000000-0000-4000-8000-0000000070e1";

const superAdmin: ActorContext = { actorId: "root", roles: ["super_admin"], mfaVerified: true };
const preparer: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
const adminPays: ActorContext = { actorId: "admin-pays", roles: ["admin_pays"], countryScopes: [countryId], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId, mfaVerified: true };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    countryId,
    productId,
    partnerTenantId,
    name: "Auto Essentiel",
    insurerName: "NSIA",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 10000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Fiche produit",
    reason: "Preparation de l'offre",
    ...overrides
  };
}

function brokerPayload(overrides: Record<string, unknown> = {}) {
  const { partnerTenantId: _partner, ...rest } = payload();
  void _partner;
  return { ...rest, ...overrides };
}

function brokerUpdate(overrides: Record<string, unknown> = {}) {
  const { countryId: _c, productId: _p, ...rest } = brokerPayload();
  void _c;
  void _p;
  return { ...rest, ...overrides };
}

async function setup(withInsurerLookup = true) {
  const audit = new AuditLogWriter();
  const insurers = new InsurersModule(audit);
  const offers = new OffersModule(audit, undefined, undefined, {
    partnerEligibility: async () => ({ eligible: true, reasons: [] }),
    ...(withInsurerLookup ? { insurer: (id: string) => insurers.service.resolve(id) } : {})
  });
  const insurer = await insurers.service.create({ countryId, name: "NSIA Assurances", code: "nsia", reason: "Ajout au referentiel" }, superAdmin);
  return { audit, insurers, offers, insurer };
}

describe("spec 070 offer to insurer link", () => {
  it("keeps an offer without insurerId unchanged (insurerName alone)", async () => {
    const { offers } = await setup();
    const offer = await offers.adminService.create(payload(), preparer);
    expect(offer.insurerName).toBe("NSIA");
    expect(offer.insurerId).toBeUndefined();
    const detail = await offers.adminService.detailView(offer);
    expect(detail.pending?.content.insurerId).toBeUndefined();
    expect(detail.pending?.completeness.missing).toEqual([]);
  });

  it("links an active insurer of the same country and fills insurerName with its name (admin and broker)", async () => {
    const { offers, insurer } = await setup();
    const offer = await offers.adminService.create(payload({ insurerName: "Texte libre", insurerId: insurer.id }), preparer);
    expect(offer).toMatchObject({ insurerId: insurer.id, insurerName: "NSIA Assurances" });
    const updated = await offers.adminService.update(offer.id, payload({ insurerId: insurer.id, insurerName: undefined, reason: "Nouvelle version" }), preparer);
    expect(updated.insurerName).toBe("NSIA Assurances");
    const view = await offers.brokerService.create(brokerPayload({ insurerId: insurer.id, insurerName: "Autre" }), broker);
    expect(view.pending?.content).toMatchObject({ insurerId: insurer.id, insurerName: "NSIA Assurances" });
    const edited = await offers.brokerService.update(view.id, brokerUpdate({ insurerId: insurer.id, name: "Auto Plus" }), broker);
    expect(edited.pending?.content).toMatchObject({ insurerId: insurer.id, insurerName: "NSIA Assurances", name: "Auto Plus" });
  });

  it("refuses an unknown insurer, an insurer of another country and a suspended or retired one, with an audited 422", async () => {
    const { audit, offers, insurers, insurer } = await setup();
    const foreign = await insurers.service.create({ countryId: otherCountryId, name: "Saham", code: "saham", reason: "Ajout au referentiel" }, superAdmin);
    await expect(offers.adminService.create(payload({ insurerId: crypto.randomUUID() }), preparer)).rejects.toMatchObject({ status: 422, response: { code: "OFFER_INSURER_INVALID", blockers: [{ code: "insurer_not_found" }] } });
    await expect(offers.adminService.create(payload({ insurerId: foreign.id }), preparer)).rejects.toMatchObject({ status: 422, response: { blockers: [{ code: "insurer_country_mismatch" }] } });
    await expect(offers.brokerService.create(brokerPayload({ insurerId: foreign.id }), broker)).rejects.toMatchObject({ status: 422 });

    const offer = await offers.adminService.create(payload({ insurerId: insurer.id }), preparer);
    await insurers.service.update(insurer.id, { name: "NSIA Assurances", status: "suspended", expectedUpdatedAt: insurer.concurrencyToken, reason: "Controle en cours" }, superAdmin);
    await expect(offers.adminService.create(payload({ insurerId: insurer.id }), preparer)).rejects.toMatchObject({ status: 422, response: { blockers: [{ code: "insurer_not_active" }] } });
    // A new version cannot pick the suspended insurer either, but the existing offer keeps its link.
    await expect(offers.adminService.update(offer.id, payload({ insurerId: insurer.id, reason: "Nouvelle version" }), preparer)).rejects.toMatchObject({ status: 422 });
    expect((await offers.repository.require(offer.id)).insurerId).toBe(insurer.id);
    expect(audit.all().filter((entry) => entry.action === "offer.action_refused" && entry.reason === "insurer_invalid").length).toBeGreaterThanOrEqual(5);
  });

  it("accepts the insurerId as given when no insurer integration is wired (bare module)", async () => {
    const { offers } = await setup(false);
    const id = crypto.randomUUID();
    const offer = await offers.adminService.create(payload({ insurerId: id }), preparer);
    expect(offer).toMatchObject({ insurerId: id, insurerName: "NSIA" });
  });

  it("clears the link when a later version drops insurerId", async () => {
    const { offers, insurer } = await setup();
    const offer = await offers.adminService.create(payload({ insurerId: insurer.id }), preparer);
    await offers.adminService.update(offer.id, payload({ reason: "Lien retire" }), preparer);
    expect((await offers.repository.require(offer.id)).insurerId).toBeUndefined();
  });
});

describe("spec 070 offer types", () => {
  it("lets a broker create indicative (default) and private offers but never partner or insurer ones", async () => {
    const { audit, offers } = await setup();
    expect((await offers.brokerService.create(brokerPayload(), broker)).offerType).toBe("indicative");
    const privateOffer = await offers.brokerService.create(brokerPayload({ offerType: "private", name: "Offre privee" }), broker);
    expect(privateOffer.offerType).toBe("private");
    await expect(offers.brokerService.create(brokerPayload({ offerType: "insurer" }), broker)).rejects.toMatchObject({ status: 403 });
    await expect(offers.brokerService.create(brokerPayload({ offerType: "partner" }), broker)).rejects.toMatchObject({ status: 403 });
    expect(audit.all().filter((entry) => entry.reason === "offer_type_admin_only")).toHaveLength(2);
    expect((await offers.brokerService.list({ offerType: "private" }, broker)).map((view) => view.id)).toEqual([privateOffer.id]);
  });

  it("requires a partner for a private offer and refuses sponsoring it (admin)", async () => {
    const { offers } = await setup();
    await expect(offers.adminService.create(payload({ offerType: "private", partnerTenantId: undefined }), preparer)).rejects.toMatchObject({ status: 422, response: { code: "OFFER_TYPE_INVALID", blockers: [{ code: "partner_missing" }] } });
    await expect(offers.adminService.create(payload({ offerType: "private", isSponsored: true }), preparer)).rejects.toMatchObject({ status: 422, response: { blockers: [{ code: "private_offer_not_sponsorable" }] } });
    expect(await offers.adminService.create(payload({ offerType: "private" }), preparer)).toMatchObject({ offerType: "private", partnerTenantId });
  });

  it("creates insurer offers for the admin only, naming an insurer", async () => {
    const { offers, insurer } = await setup();
    await expect(offers.adminService.create(payload({ offerType: "insurer", insurerName: undefined }), preparer)).rejects.toMatchObject({ status: 422, response: { code: "OFFER_TYPE_INVALID", blockers: [{ code: "insurer_missing" }] } });
    const byName = await offers.adminService.create(payload({ offerType: "insurer" }), preparer);
    const byId = await offers.adminService.create(payload({ offerType: "insurer", insurerId: insurer.id, insurerName: undefined, name: "Offre assureur" }), preparer);
    expect(byName.offerType).toBe("insurer");
    expect(byId).toMatchObject({ offerType: "insurer", insurerName: "NSIA Assurances" });
  });

  it("keeps insurer offers away from the broker (edit, renew, submit) while the admin can write them", async () => {
    const { offers } = await setup();
    const offer = await offers.adminService.create(payload({ offerType: "insurer" }), preparer);
    await expect(offers.brokerService.update(offer.id, brokerUpdate({ name: "Modifiee" }), broker)).rejects.toMatchObject({ status: 403 });
    await expect(offers.brokerService.submit(offer.id, {}, broker)).rejects.toMatchObject({ status: 403 });
    await expect(offers.adminService.update(offer.id, payload({ offerType: "insurer", name: "Modifiee par admin", reason: "Mise a jour" }), preparer)).resolves.toMatchObject({ offerType: "insurer" });
    await expect(offers.adminService.submit(offer.id, "Soumission", preparer)).resolves.toBeDefined();
  });

  it("reserves the validation of an insurer offer to compliance (a country admin cannot validate it)", async () => {
    const { audit, offers } = await setup();
    const offer = await offers.adminService.create(payload({ offerType: "insurer" }), adminPays);
    await offers.adminService.submit(offer.id, "Soumission", adminPays);
    await expect(offers.adminService.validate(offer.id, { reason: "Je valide" }, adminPays)).rejects.toMatchObject({ status: 403 });
    await expect(offers.adminService.validate(offer.id, { reason: "Je valide" }, preparer)).rejects.toMatchObject({ status: 403 });
    expect(audit.all().filter((entry) => entry.action === "offer.access_refused" && entry.reason === "compliance_required")).toHaveLength(2);
    expect((await offers.repository.require(offer.id)).validationStatus).toBe("pending");
    await expect(offers.adminService.validate(offer.id, { reason: "Validation conformite" }, compliance)).resolves.toMatchObject({ status: "active", validationStatus: "validated", offerType: "insurer" });
  });

  it("makes the type immutable after creation (admin and broker), accepting the stored one", async () => {
    const { audit, offers } = await setup();
    const adminOffer = await offers.adminService.create(payload({ offerType: "indicative" }), preparer);
    await expect(offers.adminService.update(adminOffer.id, payload({ offerType: "private" }), preparer)).rejects.toMatchObject({ status: 422, response: { code: "OFFER_TYPE_IMMUTABLE" } });
    await expect(offers.adminService.update(adminOffer.id, payload({ offerType: "indicative", reason: "Meme type" }), preparer)).resolves.toBeDefined();
    await expect(offers.adminService.update(adminOffer.id, payload({ reason: "Sans type" }), preparer)).resolves.toBeDefined();
    const brokerOffer = await offers.brokerService.create(brokerPayload({ offerType: "private" }), broker);
    await expect(offers.brokerService.update(brokerOffer.id, brokerUpdate({ offerType: "indicative" }), broker)).rejects.toMatchObject({ status: 422, response: { code: "OFFER_TYPE_IMMUTABLE" } });
    await expect(offers.brokerService.update(brokerOffer.id, brokerUpdate({ offerType: "insurer" }), broker)).rejects.toMatchObject({ status: 403 });
    await expect(offers.brokerService.update(brokerOffer.id, brokerUpdate({ offerType: "private", name: "Renommee" }), broker)).resolves.toMatchObject({ offerType: "private" });
    expect(audit.all().filter((entry) => entry.reason === "offer_type_immutable")).toHaveLength(2);
  });

  it("filters the admin and broker lists by offerType", async () => {
    const { offers } = await setup();
    await offers.adminService.create(payload(), preparer);
    const priv = await offers.adminService.create(payload({ offerType: "private", name: "Privee" }), preparer);
    const insurer = await offers.adminService.create(payload({ offerType: "insurer", name: "Assureur" }), preparer);
    expect((await offers.adminService.listViews({ offerType: "private" }, preparer)).map((item) => item.id)).toEqual([priv.id]);
    expect((await offers.adminService.listViews({ offerType: "insurer" }, preparer)).map((item) => item.id)).toEqual([insurer.id]);
    expect(await offers.adminService.listViews({ offerType: "indicative" }, preparer)).toHaveLength(1);
    await expect(offers.adminService.listViews({ offerType: "bogus" }, preparer)).rejects.toMatchObject({ status: 400 });
    expect(await offers.brokerService.list({ offerType: "insurer" }, broker)).toHaveLength(1);
  });
});
