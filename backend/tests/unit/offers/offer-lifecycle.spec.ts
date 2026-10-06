import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { OffersModule } from "../../../src/modules/offers/offers.module";
import { PublicOfferCatalogService } from "../../../src/modules/offers/public-offer-catalog.service";

const preparer: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const countryId = "00000000-0000-4000-8000-0000000052c1";
const productId = "00000000-0000-4000-8000-0000000052a1";
const partnerTenantId = "00000000-0000-4000-8000-0000000052b1";

function content(overrides: Record<string, unknown> = {}) {
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

async function setup() {
  const audit = new AuditLogWriter();
  const offers = new OffersModule(audit, undefined, undefined, {
    partnerEligibility: async () => ({ eligible: true, reasons: [] })
  });
  const catalog = new PublicOfferCatalogService(offers.repository, audit);
  const created = await offers.adminService.create(content(), preparer);
  await offers.adminService.submit(created.id, "Soumission", preparer);
  await offers.adminService.validate(created.id, { reason: "Validation conformite" }, compliance);
  return { audit, offers, catalog, offerId: created.id };
}

async function publicPrice(catalog: PublicOfferCatalogService) {
  const [item] = await catalog.list(countryId, productId);
  return item?.indicativePriceMin;
}

describe("spec 052 offer lifecycle (versions)", () => {
  it("keeps the published content unchanged until the new version is validated", async () => {
    const { offers, catalog, offerId } = await setup();
    expect(await publicPrice(catalog)).toBe(10000);

    await offers.adminService.update(offerId, content({ indicativePriceMin: 15000, reason: "Nouveau tarif" }), preparer);
    expect(await publicPrice(catalog)).toBe(10000);
    await offers.adminService.submit(offerId, "Soumission v2", preparer);
    expect(await publicPrice(catalog)).toBe(10000);

    await offers.adminService.validate(offerId, { reason: "Validation v2" }, compliance);
    expect(await publicPrice(catalog)).toBe(15000);
    const versions = await offers.repository.listVersions(offerId);
    expect(versions.map((version) => [version.versionNumber, version.status])).toEqual([[1, "archived"], [2, "published"]]);
    expect((await offers.repository.require(offerId)).publishedVersionId).toBe(versions[1]?.id);
  });

  it("keeps a single version in progress and clears optional fields on publication", async () => {
    const { offers, catalog, offerId } = await setup();
    await offers.adminService.update(offerId, content({ shortDescription: "Texte", reason: "Premiere edition" }), preparer);
    await offers.adminService.update(offerId, content({ reason: "Deuxieme edition" }), preparer);
    const versions = await offers.repository.listVersions(offerId);
    expect(versions.filter((version) => version.status === "draft" || version.status === "submitted")).toHaveLength(1);
    expect(versions).toHaveLength(2);
    await offers.adminService.submit(offerId, "Soumission", preparer);
    await offers.adminService.validate(offerId, { reason: "Validation" }, compliance);
    const [item] = await catalog.list(countryId, productId);
    expect(item?.name).toBe("Auto Essentiel");
    expect((await offers.repository.require(offerId)).shortDescription).toBeUndefined();
  });

  it("keeps the published version when the submitted one is rejected, with the reason on the draft", async () => {
    const { offers, catalog, offerId } = await setup();
    await offers.adminService.update(offerId, content({ indicativePriceMin: 99000, reason: "Hausse tarifaire" }), preparer);
    await offers.adminService.submit(offerId, "Soumission", preparer);
    await offers.adminService.validate(offerId, { validationStatus: "rejected", reason: "Tarif non justifie" }, compliance);
    expect(await publicPrice(catalog)).toBe(10000);
    const pending = (await offers.repository.listVersions(offerId)).find((version) => version.versionNumber === 2);
    expect(pending).toMatchObject({ status: "draft", lastDecision: "rejected", decisionReason: "Tarif non justifie" });
  });

  it("refuses to validate without a submitted version, an incomplete submission and a non compliance decider", async () => {
    const { offers, offerId } = await setup();
    await expect(offers.adminService.validate(offerId, { reason: "Rien a valider" }, compliance)).rejects.toMatchObject({ status: 409 });
    await offers.adminService.update(offerId, content({ insurerName: undefined, guarantees: [], reason: "Incomplet" }), preparer);
    await expect(offers.adminService.submit(offerId, "Soumission", preparer)).rejects.toMatchObject({ status: 422 });
    await expect(offers.adminService.suspend(offerId, "Suspension refusee", preparer)).rejects.toMatchObject({ status: 403 });
  });

  it("suspends, reinstates after the same controls, withdraws and renews with history", async () => {
    const { offers, catalog, offerId } = await setup();
    await offers.adminService.suspend(offerId, "Controle en cours", compliance);
    expect(await catalog.list(countryId, productId)).toHaveLength(0);
    await offers.adminService.validate(offerId, { reason: "Levee de suspension" }, compliance);
    expect(await catalog.list(countryId, productId)).toHaveLength(1);

    const offer = await offers.repository.require(offerId);
    await offers.lifecycle.withdraw(offer, preparer, "Retrait commercial");
    expect(await catalog.list(countryId, productId)).toHaveLength(0);
    await offers.lifecycle.renew(offer, { validFrom: new Date("2026-11-01T00:00:00.000Z"), validUntil: new Date("2031-01-01T00:00:00.000Z") }, preparer, "admin", "Renouvellement");
    await expect(offers.lifecycle.renew(offer, { validFrom: new Date("2026-11-01T00:00:00.000Z"), validUntil: new Date("2031-01-01T00:00:00.000Z") }, preparer, "admin", "Second renouvellement")).rejects.toMatchObject({ status: 409 });
    const history = (await offers.repository.history()).filter((entry) => entry.offerId === offerId).map((entry) => entry.changeType);
    expect(history).toEqual(expect.arrayContaining(["created", "submitted", "validated", "suspended", "reinstated", "withdrawn", "version_created"]));
  });

  it("refuses validation of an expired version", async () => {
    const audit = new AuditLogWriter();
    const offers = new OffersModule(audit, undefined, undefined, { partnerEligibility: async () => ({ eligible: true, reasons: [] }) });
    const created = await offers.adminService.create(content(), preparer);
    await offers.adminService.submit(created.id, "Soumission", preparer);
    const pending = (await offers.repository.listVersions(created.id))[0]!;
    await offers.repository.updateVersion(pending.id, { validFrom: new Date("2020-01-01T00:00:00.000Z"), validUntil: new Date("2021-01-01T00:00:00.000Z") });
    await expect(offers.adminService.validate(created.id, { reason: "Validation" }, compliance)).rejects.toMatchObject({
      status: 422,
      response: { code: "OFFER_VALIDATION_BLOCKED", blockers: expect.arrayContaining([{ code: "offer_expired", field: "validUntil" }]) }
    });
  });
});
