import { afterEach, describe, expect, it } from "vitest";
import type { AdminAccreditationDocumentView, AdminPartnerDetailView, AdminPartnerLicenseView } from "../../../../packages/shared/contracts/partner.contracts";
import { EICAR_PDF, MINIMAL_PDF } from "../helpers/partner-onboarding-seed";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import {
  acceptedProof,
  adminPays,
  call,
  callJson,
  compliance,
  createLicense,
  createPartner,
  prepareActivatablePartner,
  seedOnboardingRuntime,
  superAdmin,
  support,
  uploadDocument
} from "./partner-admin-http-helpers";

/** Spec 051 US2 / T012: licences (validate, suspend, revoke, renew, history) and accreditation documents. */
describe("partner licences and accreditation documents over HTTP (spec 051 US2)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses to validate a licence without an accepted proof (US2 scenario 1), then validates it with history", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const license = await createLicense(harness, superAdmin, partner.id, seed.country.id, [seed.product.id]);
    expect(license.status).toBe("draft");

    const refused = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "validation sans preuve" });
    expect(refused.status).toBe(422);
    expect((await readJson<{ code: string }>(refused)).code).toBe("LICENSE_DOCUMENT_REQUIRED");
    expect(harness.runtime.audit.writer.search({ action: "partner_license.validate_refused", result: "refused" }).some((entry) => entry.reason === "license_document_required")).toBe(true);

    // A proof uploaded but not yet accepted is not enough either.
    const uploaded = await readJson<AdminAccreditationDocumentView>(await uploadDocument(harness, superAdmin, partner.id, { documentType: "license", licenseId: license.id }));
    expect(uploaded).toMatchObject({ scanStatus: "clean", status: "uploaded", quarantined: false, licenseId: license.id, mimeType: "application/pdf", sizeBytes: MINIMAL_PDF.length });
    expect(uploaded.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(uploaded).not.toHaveProperty("storageKey");
    expect((await call(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "validation sans acceptation" })).status).toBe(422);

    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/documents/${uploaded.id}/review`, { decision: "accepted", reason: "preuve conforme verifiee" }, 200);
    const validated = await callJson<AdminPartnerLicenseView>(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "licence verifiee aupres du regulateur" }, 200);
    expect(validated).toMatchObject({ status: "valid", effectiveStatus: "valid", validatedById: compliance.actorId, statusReason: "licence verifiee aupres du regulateur" });
    expect(validated.history.map((entry) => [entry.fromStatus, entry.toStatus])).toEqual([[null, "draft"], ["draft", "valid"]]);
    expect(harness.runtime.audit.writer.search({ action: "partner_license.validated", targetId: license.id })[0]?.result).toBe("success");
  });

  it("refuses to validate an expired licence (US2 scenario 2)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const license = await createLicense(harness, superAdmin, partner.id, seed.country.id, [], { effectiveDate: "2020-01-01", expirationDate: "2021-01-01" });
    await acceptedProof(harness, partner.id, license.id);
    const refused = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "validation licence expiree" });
    expect(refused.status).toBe(422);
    expect((await readJson<{ code: string }>(refused)).code).toBe("LICENSE_EXPIRED");
  });

  it("reserves licence validation and document review to compliance; the Admin Pays is refused and audited (US2 scenario 3)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const ci = adminPays(seed.country.id);
    const partner = await createPartner(harness, ci, seed.country.id);
    const license = await createLicense(harness, ci, partner.id, seed.country.id, [seed.product.id]);
    const uploadResponse = await uploadDocument(harness, ci, partner.id, { documentType: "license", licenseId: license.id });
    expect(uploadResponse.status).toBe(201);
    const document = await readJson<AdminAccreditationDocumentView>(uploadResponse);

    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/documents/${document.id}/review`, { decision: "accepted", reason: "acceptation par admin pays" })).status).toBe(403);
    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "validation par admin pays" })).status).toBe(403);
    expect((await call(harness, ci, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/revoke`, { reason: "revocation par admin pays" })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.review_refused", result: "refused" })[0]?.reason).toBe("document_review_requires_compliance");
    expect(harness.runtime.audit.writer.search({ action: "partner_license.validate_refused", result: "refused" })[0]?.reason).toBe("license_action_requires_compliance");
  });

  it("quarantines an infected file: never served, never accepted (US2 scenario 4)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const response = await uploadDocument(harness, superAdmin, partner.id, { documentType: "license" }, { bytes: EICAR_PDF, fileName: "eicar.pdf" });
    expect(response.status).toBe(201);
    const infected = await readJson<AdminAccreditationDocumentView>(response);
    expect(infected).toMatchObject({ scanStatus: "infected", quarantined: true, status: "uploaded" });
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.quarantined", targetId: infected.id })[0]?.reason).toBe("Eicar-Test-Signature");

    const review = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/documents/${infected.id}/review`, { decision: "accepted", reason: "acceptation document infecte" });
    expect(review.status).toBe(422);
    expect((await readJson<{ code: string }>(review)).code).toBe("DOCUMENT_QUARANTINED");
    const download = await call(harness, compliance, "GET", `/admin/partners/${partner.id}/documents/${infected.id}/file`);
    expect(download.status).toBe(422);
    expect((await readJson<{ code: string }>(download)).code).toBe("DOCUMENT_QUARANTINED");
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.download_refused", result: "refused" })[0]?.reason).toBe("document_quarantined");
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.downloaded" })).toHaveLength(0);
  });

  it("refuses a disallowed type, a spoofed MIME type or a missing file before storage (US2 scenario 5)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const text = await uploadDocument(harness, superAdmin, partner.id, { documentType: "license" }, { bytes: Buffer.from("plain text"), mimeType: "text/plain", fileName: "note.txt" });
    expect(text.status).toBe(422);
    expect((await readJson<{ code: string }>(text)).code).toBe("DOCUMENT_INVALID");
    const spoofed = await uploadDocument(harness, superAdmin, partner.id, { documentType: "license" }, { bytes: Buffer.from("MZ not really a pdf"), mimeType: "application/pdf", fileName: "fake.pdf" });
    expect(spoofed.status).toBe(422);
    const tooLarge = await uploadDocument(harness, superAdmin, partner.id, { documentType: "license" }, { bytes: Buffer.concat([MINIMAL_PDF, Buffer.alloc(5 * 1024 * 1024)]), fileName: "big.pdf" });
    expect([413, 422]).toContain(tooLarge.status);
    const missing = await harness.request(`/admin/partners/${partner.id}/documents`, { method: "POST", headers: { ...(await import("../runtime-http-test-utils")).actorHeaders(superAdmin), "content-type": "application/json" }, body: JSON.stringify({ documentType: "license", reason: "televersement sans fichier" }) });
    expect(missing.status).toBe(422);
    const refusals = harness.runtime.audit.writer.search({ action: "accreditation_document.upload_refused", result: "refused" }).map((entry) => entry.reason);
    expect(refusals).toEqual(expect.arrayContaining(["mime_not_allowed", "content_mismatch", "file_missing"]));
    expect((await harness.runtime.documents.service.listForPartner(partner.id))).toHaveLength(0);
  });

  it("refuses uploads without durable storage outside local and test (FR-008)", async () => {
    const { DocumentsService } = await import("../../../src/modules/documents/documents.module");
    const { AuditLogWriter } = await import("../../../src/modules/audit-logs/audit-log-writer.service");
    const documents = new DocumentsService(new AuditLogWriter(), { requireDurableStorage: true });
    await expect(documents.upload(superAdmin, "00000000-0000-4000-8000-000000005100", { buffer: MINIMAL_PDF, originalname: "a.pdf", mimetype: "application/pdf", size: MINIMAL_PDF.length }, { documentType: "license", reason: "televersement sans stockage" }))
      .rejects.toMatchObject({ status: 422, response: { code: "DOCUMENT_STORAGE_NOT_CONFIGURED" } });
  });

  it("serves a clean document to authorised admins only, each read audited; Support Admin is refused (US2 scenario 8)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const document = await readJson<AdminAccreditationDocumentView>(await uploadDocument(harness, superAdmin, partner.id, { documentType: "registration" }));

    const download = await call(harness, compliance, "GET", `/admin/partners/${partner.id}/documents/${document.id}/file`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("application/pdf");
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await download.arrayBuffer()).equals(MINIMAL_PDF)).toBe(true);
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.downloaded", targetId: document.id })[0]?.actorId).toBe(compliance.actorId);

    const supportRead = await call(harness, support, "GET", `/admin/partners/${partner.id}/documents/${document.id}/file`);
    expect(supportRead.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "accreditation_document.download_refused", result: "refused" })[0]?.reason).toBe("rbac_denied");
    // Support still reads the metadata on the partner page, never the storage key.
    const detail = await callJson<AdminPartnerDetailView>(harness, support, "GET", `/admin/partners/${partner.id}`, undefined, 200);
    expect(detail.documents[0]?.id).toBe(document.id);
    expect(JSON.stringify(detail)).not.toContain("storageKey");
    // A document of another partner is not reachable through this partner.
    const other = await createPartner(harness, superAdmin, seed.country.id);
    expect((await call(harness, compliance, "GET", `/admin/partners/${other.id}/documents/${document.id}/file`)).status).toBe(404);
  });

  it("suspends and revokes a valid licence: the partner leaves routing at the next decision, with history (US2 scenario 6)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner, license } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);

    const suspended = await callJson<AdminPartnerLicenseView>(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/suspend`, { reason: "controle regulateur en cours" }, 200);
    expect(suspended.status).toBe("suspended");
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).reasons).toContain("license_not_valid_for_scope");
    const detail = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${partner.id}`, undefined, 200);
    expect(detail.effectiveStatus).toBe("expired");

    // Suspension can be lifted while the licence is not expired; revocation is final.
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "controle regulateur termine" }, 200);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);
    const revoked = await callJson<AdminPartnerLicenseView>(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/revoke`, { reason: "retrait d'agrement par le regulateur" }, 200);
    expect(revoked.history.map((entry) => entry.toStatus)).toEqual(["draft", "valid", "suspended", "valid", "revoked"]);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(false);
    const again = await call(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "revalidation impossible" });
    expect(again.status).toBe(409);
    expect((await readJson<{ code: string }>(again)).code).toBe("LICENSE_TRANSITION_INVALID");
  });

  it("renews a licence without interruption and supersedes the previous one (US2 scenario 7)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner, license } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "active", reason: "activation apres verification" }, 200);

    const renewal = await callJson<AdminPartnerLicenseView>(harness, superAdmin, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/renew`, {
      licenseNumber: "LIC-RENEW-2030", issuingAuthority: "Direction des assurances", productIds: [seed.product.id], effectiveDate: "2029-12-01", expirationDate: "2033-01-01", reason: "renouvellement de la licence"
    }, 201);
    expect(renewal).toMatchObject({ status: "draft", renewsLicenseId: license.id, countryId: seed.country.id });
    // The old licence keeps the partner eligible while the renewal is reviewed.
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);
    await acceptedProof(harness, partner.id, renewal.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${renewal.id}/validate`, { reason: "renouvellement verifie" }, 200);
    expect((await harness.runtime.leads.eligibility.evaluate(partner.id, seed.country.id, seed.product.id)).eligible).toBe(true);
    const detail = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${partner.id}`, undefined, 200);
    expect(detail.licenses.find((candidate) => candidate.id === license.id)?.status).toBe("superseded");
    expect(detail.licenses.find((candidate) => candidate.id === renewal.id)?.status).toBe("valid");
    expect(detail.effectiveStatus).toBe("active");
    expect(harness.runtime.audit.writer.search({ action: "partner_license.superseded", targetId: license.id })[0]?.result).toBe("success");
  });
});
