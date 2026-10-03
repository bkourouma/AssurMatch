import { afterEach, describe, expect, it } from "vitest";
import type { BrokerLicenseDocumentView, BrokerLicenseView } from "../../../../packages/shared/contracts/broker-self-service.contracts";
import type { AdminPartnerDetailView } from "../../../../packages/shared/contracts/partner.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { EICAR_PDF, MINIMAL_PDF } from "../helpers/partner-onboarding-seed";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { call, callJson, compliance, superAdmin } from "../partners/partner-admin-http-helpers";
import { seedSelfService } from "./self-service-helpers";

const renewal = {
  licenseNumber: "LIC-CI-2031",
  issuingAuthority: "Direction des assurances",
  productIds: [] as string[],
  effectiveDate: "2026-06-01",
  expirationDate: "2031-06-01",
  reason: "renouvellement annuel"
};

async function uploadProof(harness: RuntimeHttpHarness, actor: ActorContext, licenseId: string, bytes: Buffer = MINIMAL_PDF, mimeType = "application/pdf"): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), "licence.pdf");
  form.append("reason", "preuve du renouvellement");
  return harness.request(`/broker/licenses/${licenseId}/documents`, { method: "POST", headers: actorHeaders(actor), body: form });
}

describe("spec 053 broker licences and renewals", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lets an owner submit a renewal that ends pending compliance validation, never self-validated", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    const listed = await callJson<BrokerLicenseView[]>(harness, ctx.readOnlyA, "GET", "/broker/licenses", undefined, 200);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: ctx.licenseA.id, effectiveStatus: "valid", canRenew: true, canUploadProof: false });
    expect(listed[0]!.history.map((entry) => entry.toStatus)).toEqual(["draft", "valid"]);
    // Internal compliance reasons are not exposed to the broker.
    expect(JSON.stringify(listed)).not.toContain("licence verifiee aupres du regulateur");
    expect(JSON.stringify(listed)).not.toContain("storageKey");

    const draft = await callJson<BrokerLicenseView>(harness, ctx.managerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, renewal, 201);
    expect(draft).toMatchObject({ status: "draft", renewsLicenseId: ctx.licenseA.id, countryId: ctx.seed.country.id, canUploadProof: true });
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, renewal)).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: "broker_license.renewal_submitted", targetId: draft.id })).toHaveLength(1);

    const uploaded = await uploadProof(harness, ctx.ownerA, draft.id);
    expect(uploaded.status).toBe(201);
    const body = await readJson<{ license: BrokerLicenseView; document: BrokerLicenseDocumentView }>(uploaded);
    expect(body.license.status).toBe("pending_review");
    expect(body.document).toMatchObject({ scanStatus: "clean", status: "uploaded" });

    // Still pending: the previous licence stays valid, the renewal is not eligible yet.
    expect(await harness.runtime.partnerLicenses.service.eligible(ctx.partnerA.id, ctx.seed.country.id)).toBe(true);
    const adminView = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${ctx.partnerA.id}`, undefined, 200);
    expect(adminView.licenses.find((license) => license.id === draft.id)).toMatchObject({ status: "pending_review", renewsLicenseId: ctx.licenseA.id });
    expect(adminView.documents.find((document) => document.licenseId === draft.id)).toMatchObject({ documentType: "license", scanStatus: "clean" });

    // No broker route validates; the admin routes refuse a broker.
    expect((await call(harness, ctx.ownerA, "POST", `/admin/partners/${ctx.partnerA.id}/licenses/${draft.id}/validate`, { reason: "auto validation courtier" })).status).toBe(403);
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${draft.id}/validate`, { reason: "auto validation courtier" })).status).toBe(404);

    // Compliance accepts the proof and validates: the previous licence is superseded.
    await callJson(harness, compliance, "POST", `/admin/partners/${ctx.partnerA.id}/documents/${body.document.id}/review`, { decision: "accepted", reason: "preuve conforme verifiee" }, 200);
    await callJson(harness, compliance, "POST", `/admin/partners/${ctx.partnerA.id}/licenses/${draft.id}/validate`, { reason: "renouvellement verifie" }, 200);
    const after = await callJson<BrokerLicenseView[]>(harness, ctx.agentA, "GET", "/broker/licenses", undefined, 200);
    expect(after.find((license) => license.id === ctx.licenseA.id)).toMatchObject({ status: "superseded", canRenew: false });
    expect(after.find((license) => license.id === draft.id)).toMatchObject({ status: "valid", canUploadProof: false });
  });

  it("refuses renewals of revoked licences, past expirations, unknown products and other partners' licences", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, { ...renewal, expirationDate: "2020-01-01", effectiveDate: "2019-01-01" })).status).toBe(422);
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, { ...renewal, productIds: ["00000000-0000-4000-8000-0000000053aa"] })).status).toBe(422);
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, { ...renewal, countryId: ctx.seed.senegal.id })).status).toBe(400);
    // Another partner's licence answers 404, for renewals and for proofs.
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseB.id}/renewals`, renewal)).status).toBe(404);
    expect((await uploadProof(harness, ctx.ownerA, ctx.licenseB.id)).status).toBe(404);
    // Agents and read-only users never write.
    expect((await call(harness, ctx.agentA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, renewal)).status).toBe(403);
    expect((await uploadProof(harness, ctx.readOnlyA, ctx.licenseA.id)).status).toBe(403);
    // A valid licence is not open for a proof (only drafts and pending reviews are).
    expect((await uploadProof(harness, ctx.ownerA, ctx.licenseA.id)).status).toBe(409);

    await callJson(harness, compliance, "POST", `/admin/partners/${ctx.partnerA.id}/licenses/${ctx.licenseA.id}/revoke`, { reason: "licence retiree par le regulateur" }, 200);
    expect((await call(harness, ctx.ownerA, "POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, renewal)).status).toBe(409);
  });

  it("quarantines an infected proof and keeps the renewal in draft; refuses a wrong file type", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    // Partner B's draft licence (from the admin) can receive its first proof from the broker.
    const infected = await uploadProof(harness, ctx.ownerB, ctx.licenseB.id, EICAR_PDF);
    expect(infected.status).toBe(201);
    const body = await readJson<{ license: BrokerLicenseView; document: BrokerLicenseDocumentView }>(infected);
    expect(body.document).toMatchObject({ scanStatus: "infected", quarantined: true });
    expect(body.license.status).toBe("draft");
    expect((await uploadProof(harness, ctx.ownerB, ctx.licenseB.id, Buffer.from("not an image"), "text/plain")).status).toBe(422);
    const clean = await readJson<{ license: BrokerLicenseView }>(await uploadProof(harness, ctx.ownerB, ctx.licenseB.id));
    expect(clean.license.status).toBe("pending_review");
  });
});
