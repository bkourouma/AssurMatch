import { afterEach, describe, expect, it } from "vitest";
import type { AdminInsurerView, InsurerChoice } from "../../../packages/shared/contracts/insurer.contracts";
import type { ActorContext } from "../../src/modules/common/types";
import { auditEntries, call, complianceAdmin, countryAdmin, superAdmin } from "./catalog/catalog-http-helpers";
import { createRuntimeHttpHarness, seedPublicRuntime, seedWaitlistCountry, type RuntimeHttpHarness } from "./runtime-http-test-utils";

// Lot 4 (spec 070): PRD section 8, the insurer referential.
type ErrorBody = { code: string; message: string };
type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

function broker(partnerTenantId: string): ActorContext {
  return { actorId: "broker-owner-lot4", roles: ["broker_owner_pro"], partnerTenantId, partnerPlan: "pro", mfaVerified: true };
}

function offerBody(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    countryId: seed.country.id,
    productId: seed.product.id,
    partnerTenantId: seed.partner.id,
    name: "Auto assureur lie",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 20000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Fiche assureur",
    reason: "Preparation catalogue lot 4",
    ...overrides
  };
}

describe("lot 4: insurers over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function createInsurer(h: RuntimeHttpHarness, countryId: string, code: string, name: string): Promise<AdminInsurerView> {
    const created = await call<AdminInsurerView>(h, superAdmin, "POST", "/admin/insurers", { countryId, name, code, approvalNumber: "AGR-001", reason: "referencement assureur lot 4" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return created.body;
  }

  it("creates, lists, reads, edits and retires an insurer, refuses duplicates and audits every write", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const other = await seedWaitlistCountry(harness.runtime);

    const sunu = await createInsurer(harness, seed.country.id, "sunu-ci", "Sunu Assurances");
    expect(sunu).toMatchObject({ countryId: seed.country.id, code: "sunu-ci", name: "Sunu Assurances", status: "active" });
    expect(auditEntries(harness, "insurer.created", "success")).toHaveLength(1);

    // The code is unique within a country, not across countries.
    const duplicate = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/insurers", { countryId: seed.country.id, name: "Autre", code: "sunu-ci", reason: "doublon de code" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("CONFLICT");
    const sameCodeElsewhere = await createInsurer(harness, other.country.id, "sunu-ci", "Sunu Senegal");
    expect(sameCodeElsewhere.countryId).toBe(other.country.id);
    expect((await call(harness, superAdmin, "POST", "/admin/insurers", { countryId: seed.country.id, name: "X", code: "Bad Code", reason: "code invalide" })).status).toBe(400);

    const all = await call<AdminInsurerView[]>(harness, complianceAdmin, "GET", "/admin/insurers");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(2);
    const filtered = await call<AdminInsurerView[]>(harness, superAdmin, "GET", `/admin/insurers?countryId=${seed.country.id}&status=active`);
    expect(filtered.body.map((insurer) => insurer.id)).toEqual([sunu.id]);
    expect((await call(harness, superAdmin, "GET", "/admin/insurers?status=unknown")).status).toBe(400);
    const detail = await call<AdminInsurerView>(harness, superAdmin, "GET", `/admin/insurers/${sunu.id}`);
    expect(detail.status).toBe(200);
    expect((await call(harness, superAdmin, "GET", "/admin/insurers/88888888-8888-4888-8888-888888888888")).status).toBe(404);

    const updated = await call<AdminInsurerView>(harness, superAdmin, "PATCH", `/admin/insurers/${sunu.id}`, { name: "Sunu Assurances CI", status: "active", expectedUpdatedAt: sunu.updatedAt, reason: "changement de raison sociale" });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.name).toBe("Sunu Assurances CI");
    const stale = await call<ErrorBody>(harness, superAdmin, "PATCH", `/admin/insurers/${sunu.id}`, { name: "Sunu", status: "active", expectedUpdatedAt: sunu.updatedAt, reason: "ecriture obsolete" });
    expect(stale.status).toBe(409);

    const retired = await call<AdminInsurerView>(harness, superAdmin, "POST", `/admin/insurers/${sunu.id}/retire`, { reason: "fin de partenariat" });
    expect(retired.status, JSON.stringify(retired.body)).toBe(200);
    expect(retired.body.status).toBe("retired");
    expect((await call(harness, superAdmin, "POST", `/admin/insurers/${sunu.id}/retire`, { reason: "deuxieme retrait" })).status).toBe(409);
    expect(auditEntries(harness, "insurer.retired", "success").length).toBeGreaterThan(0);
  });

  it("refuses out-of-scope admins and brokers on the admin routes, with an audited refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const other = await seedWaitlistCountry(harness.runtime);
    const sunu = await createInsurer(harness, seed.country.id, "sunu-ci", "Sunu Assurances");

    const outOfScope = await call<ErrorBody>(harness, countryAdmin(other.country.id), "POST", "/admin/insurers", { countryId: seed.country.id, name: "Hors perimetre", code: "hors-perimetre", reason: "tentative hors perimetre" });
    expect(outOfScope.status).toBe(403);
    expect((await call(harness, countryAdmin(other.country.id), "GET", `/admin/insurers/${sunu.id}`)).status).toBe(403);
    const scopedList = await call<AdminInsurerView[]>(harness, countryAdmin(other.country.id), "GET", "/admin/insurers");
    expect(scopedList.body).toEqual([]);
    expect((await call(harness, broker(seed.partner.id), "GET", "/admin/insurers")).status).toBe(403);
    expect((await call(harness, broker(seed.partner.id), "POST", "/admin/insurers", { countryId: seed.country.id, name: "Courtier", code: "courtier", reason: "tentative courtier" })).status).toBe(403);
    expect(auditEntries(harness, "insurer.access_refused", "refused").length).toBeGreaterThan(0);
    expect((await harness.request("/admin/insurers")).status).toBe(401);
  });

  it("links an offer to an insurer of its own country, fills the displayed name, and refuses another country or a retired insurer", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const other = await seedWaitlistCountry(harness.runtime);
    const sunu = await createInsurer(harness, seed.country.id, "sunu-ci", "Sunu Assurances");
    const senegalese = await createInsurer(harness, other.country.id, "sunu-sn", "Sunu Senegal");

    const linked = await call<{ id: string }>(harness, superAdmin, "POST", "/admin/offers", offerBody(seed, { insurerId: sunu.id }));
    expect(linked.status, JSON.stringify(linked.body)).toBe(201);
    const stored = await harness.runtime.offers.repository.require(linked.body.id);
    expect(stored).toMatchObject({ insurerId: sunu.id, insurerName: "Sunu Assurances" });

    const wrongCountry = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/offers", offerBody(seed, { insurerId: senegalese.id }));
    expect(wrongCountry.status).toBe(422);
    expect(wrongCountry.body.code).toBe("OFFER_INSURER_INVALID");
    expect(wrongCountry.body.message).toMatch(/insurer/i);
    const unknown = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/offers", offerBody(seed, { insurerId: "99999999-9999-4999-8999-999999999999" }));
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe("OFFER_INSURER_INVALID");

    // The same rule applies to a broker, with the displayed name coming from the referential too.
    const owner = broker(seed.partner.id);
    const brokerOffer = await call<{ id: string }>(harness, owner, "POST", "/broker/offers", offerBody(seed, { insurerId: sunu.id, name: "Auto courtier lie", partnerTenantId: undefined, reason: undefined }));
    expect(brokerOffer.status, JSON.stringify(brokerOffer.body)).toBe(201);
    const brokerWrongCountry = await call<ErrorBody>(harness, owner, "POST", "/broker/offers", offerBody(seed, { insurerId: senegalese.id, partnerTenantId: undefined, reason: undefined }));
    expect(brokerWrongCountry.status).toBe(422);
    expect(brokerWrongCountry.body.code).toBe("OFFER_INSURER_INVALID");

    await call(harness, superAdmin, "POST", `/admin/insurers/${sunu.id}/retire`, { reason: "fin de partenariat" });
    const retiredInsurer = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/offers", offerBody(seed, { insurerId: sunu.id, name: "Auto assureur retire" }));
    expect(retiredInsurer.status).toBe(422);
    // The offer already linked keeps its link.
    expect((await harness.runtime.offers.repository.require(linked.body.id)).insurerId).toBe(sunu.id);
  });

  it("lists to a broker only the active insurers of the requested country", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const other = await seedWaitlistCountry(harness.runtime);
    const active = await createInsurer(harness, seed.country.id, "sunu-ci", "Sunu Assurances");
    const suspended = await createInsurer(harness, seed.country.id, "nsia-ci", "NSIA");
    const retired = await createInsurer(harness, seed.country.id, "saham-ci", "Saham");
    await createInsurer(harness, other.country.id, "sunu-sn", "Sunu Senegal");
    expect((await call(harness, superAdmin, "PATCH", `/admin/insurers/${suspended.id}`, { name: "NSIA", status: "suspended", expectedUpdatedAt: suspended.updatedAt, reason: "suspension temporaire" })).status).toBe(200);
    expect((await call(harness, superAdmin, "POST", `/admin/insurers/${retired.id}/retire`, { reason: "retrait definitif" })).status).toBe(200);

    const owner = broker(seed.partner.id);
    const choices = await call<InsurerChoice[]>(harness, owner, "GET", `/broker/insurers?countryId=${seed.country.id}`);
    expect(choices.status).toBe(200);
    expect(choices.body).toEqual([{ id: active.id, name: "Sunu Assurances", code: "sunu-ci", countryId: seed.country.id }]);
    expect((await call(harness, owner, "GET", "/broker/insurers")).status).toBe(400);
    expect((await call(harness, owner, "GET", "/broker/insurers?countryId=not-a-uuid")).status).toBe(400);
    expect((await harness.request(`/broker/insurers?countryId=${seed.country.id}`)).status).toBe(401);

    // A suspended partner keeps its reads, like the other broker reads.
    await harness.runtime.partners.service.update(seed.partner.id, { status: "suspended", suspensionReason: "controle de conformite", reason: "Suspension pour controle" }, superAdmin);
    expect((await call(harness, owner, "GET", `/broker/insurers?countryId=${seed.country.id}`)).status).toBe(200);
  });
});
