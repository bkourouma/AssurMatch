import { afterEach, describe, expect, it } from "vitest";
import { adminQuoteDocumentsResponseSchema, quoteDocumentSchema, quoteDocumentsResponseSchema } from "../../../../packages/shared/contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { QuoteDocumentAuditActions } from "../../../src/modules/quote-documents/quote-documents-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };

async function enableUploads(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
  await harness.runtime.products.service.update(seed.product.id, {
    flags: { ...seed.product.flags, product_document_upload_enabled: true },
    reason: "document upload runtime test"
  }, seed.admin);
}

async function submitQuote(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, suffix: string) {
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: `Visitor ${suffix}`, email: `docs${suffix}@example.test`, phone: `+22501020305${suffix.padStart(2, "0")}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: "runtime-consent-hash" },
      ipAddress: `203.0.113.${suffix}`,
      sessionId: `documents-session-${suffix}`
    })
  });
  expect(response.status).toBe(201);
  return readJson<{ publicReference: string; verificationToken: string; routed: boolean }>(response);
}

// Binary magic bytes must be passed as raw bytes: a JS string would be UTF-8 encoded by Blob.
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function upload(harness: RuntimeHttpHarness, publicReference: string, token: string, file: { name: string; type: string; content: string | Uint8Array<ArrayBuffer> }, label = "Carte grise", documentKind = "vehicle_registration") {
  const form = new FormData();
  form.set("label", label);
  form.set("documentKind", documentKind);
  form.set("file", new Blob([file.content], { type: file.type }), file.name);
  return harness.request(`/quote-requests/${publicReference}/documents?token=${encodeURIComponent(token)}`, { method: "POST", body: form });
}

describe("visitor quote documents runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("accepts an allow-listed document, scans it and shares only clean files with the assigned broker", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableUploads(harness, seed);
    const quote = await submitQuote(harness, seed, "1");
    expect(quote.routed).toBe(true);
    expect(quote.verificationToken).toBeTruthy();

    const uploaded = await upload(harness, quote.publicReference, quote.verificationToken, { name: "carte-grise.pdf", type: "application/pdf", content: "%PDF-1.4\n%harmless" });
    expect(uploaded.status).toBe(201);
    const document = quoteDocumentSchema.parse(await readJson(uploaded));
    expect(document).toMatchObject({ scanStatus: "pending", status: "uploaded", sharedWithBroker: false, documentKind: "vehicle_registration" });

    const infected = await upload(harness, quote.publicReference, quote.verificationToken, { name: "test.pdf", type: "application/pdf", content: `%PDF-1.4\n${EICAR}` }, "Test antivirus", "other");
    expect(infected.status).toBe(201);

    expect(await harness.runtime.quoteDocuments.processPendingScans()).toBe(2);
    const listed = quoteDocumentsResponseSchema.parse(await readJson(await harness.request(`/quote-requests/${quote.publicReference}/documents?token=${encodeURIComponent(quote.verificationToken)}`)));
    expect(listed.uploadEnabled).toBe(true);
    expect(listed.remainingSlots).toBe(3);
    const clean = listed.items.find((item) => item.id === document.id);
    const quarantined = listed.items.find((item) => item.id !== document.id);
    expect(clean).toMatchObject({ scanStatus: "clean", status: "available", sharedWithBroker: true });
    expect(quarantined).toMatchObject({ scanStatus: "infected", status: "quarantined", sharedWithBroker: false });

    const [assignment] = await harness.runtime.leads.assignments.list();
    const crmDocuments = await harness.runtime.leads.crmActivityRepository.documentsForLead(assignment!.id);
    expect(crmDocuments).toHaveLength(1);
    expect(crmDocuments[0]).toMatchObject({ visibility: "prospect_provided" });
    expect(crmDocuments[0]?.storageKey).not.toContain("carte-grise");
    const notifications = await harness.runtime.notifications.service.list();
    expect(notifications.filter((notification) => notification.type === "broker_document_received" && notification.recipientScope === `partner:${seed.partner.id}`)).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: QuoteDocumentAuditActions.quarantined })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: QuoteDocumentAuditActions.shared })).toHaveLength(1);
  });

  it("refuses wrong tokens, disabled products, forbidden types, oversized and excess documents", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const quote = await submitQuote(harness, seed, "2");

    const disabled = await upload(harness, quote.publicReference, quote.verificationToken, { name: "id.pdf", type: "application/pdf", content: "%PDF-1.4" });
    expect(disabled.status).toBe(422);
    await enableUploads(harness, seed);

    expect((await upload(harness, quote.publicReference, "wrong-token", { name: "id.pdf", type: "application/pdf", content: "%PDF-1.4" })).status).toBe(404);
    expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: "tool.exe", type: "application/octet-stream", content: "MZ" })).status).toBe(400);
    expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: "fake.pdf", type: "application/pdf", content: "not a pdf" })).status).toBe(400);
    expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: "big.pdf", type: "application/pdf", content: `%PDF-1.4${"0".repeat(5 * 1024 * 1024)}` })).status).toBe(413);
    for (let index = 0; index < 5; index += 1) {
      expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: `doc-${index}.png`, type: "image/png", content: PNG_BYTES }, `Document ${index}`, "other")).status).toBe(201);
    }
    expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: "sixth.png", type: "image/png", content: PNG_BYTES })).status).toBe(400);
    expect(harness.runtime.audit.writer.search({ action: QuoteDocumentAuditActions.refused }).map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(["upload_disabled", "quote_token_invalid", "mime_not_allowed", "content_mismatch", "too_many_documents"])
    );
    expect((await harness.request(`/quote-requests/${quote.publicReference}/documents`)).status).toBe(404);
  });

  it("exposes metadata to admins with RBAC and shares later when a parked quote is assigned", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableUploads(harness, seed);
    await harness.runtime.routingRules.create(superAdmin, { countryId: seed.country.id, mode: "manual", reason: "Park quotes for manual assignment" });
    const quote = await submitQuote(harness, seed, "3");
    expect(quote.routed).toBe(false);
    expect((await upload(harness, quote.publicReference, quote.verificationToken, { name: "permis.jpg", type: "image/jpeg", content: JPEG_BYTES }, "Permis", "driving_license")).status).toBe(201);
    await harness.runtime.quoteDocuments.processPendingScans();
    expect((await harness.runtime.leads.assignments.list())).toHaveLength(0);

    const pending = await harness.runtime.manualRouting.queue(superAdmin);
    const quoteRequestId = pending.items[0]!.quoteRequestId;
    await harness.runtime.manualRouting.assign(superAdmin, quoteRequestId, { partnerTenantId: seed.partner.id, reason: "Assign parked quote" });
    const [assignment] = await harness.runtime.leads.assignments.list();
    expect(await harness.runtime.leads.crmActivityRepository.documentsForLead(assignment!.id)).toHaveLength(1);

    const supportAdmin: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
    const adminList = await harness.request(`/admin/quote-requests/${quoteRequestId}/documents`, { headers: actorHeaders(supportAdmin) });
    expect(adminList.status).toBe(200);
    const parsed = adminQuoteDocumentsResponseSchema.parse(await readJson(adminList));
    expect(parsed.items[0]).toMatchObject({ scanStatus: "clean", sharedWithBroker: true, documentKind: "driving_license" });
    expect(JSON.stringify(parsed)).not.toContain("storageKey");
    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await harness.request(`/admin/quote-requests/${quoteRequestId}/documents`, { headers: actorHeaders(broker) })).status).toBe(403);
  });
});
