import { describe, expect, it } from "vitest";
import type { VirusScannerPort } from "../../../src/modules/quote-documents/virus-scanner.port";
import { OTHER_TENANT, INFECTED_PDF, PDF, TENANT, actors, createKit, file, visitorToken } from "./lead-messaging-kit";

const ref = "QR-1";
const request = { label: "Carte grise", note: "Recto verso, lisible" };

describe("document requests service (spec 062)", () => {
  it("creates a request, notifies the visitor once with a pointer and lists it for the broker and the visitor", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
    expect(created).toMatchObject({ label: "Carte grise", status: "open", documents: [] });
    const pointers = kit.queued.filter((entry) => entry.method === "queueVisitorDocumentsRequested");
    expect(pointers).toEqual([{ method: "queueVisitorDocumentsRequested", event: { assignmentId: assignment.id, partnerTenantId: TENANT, requestId: created.id, bucket: expect.stringMatching(/^[0-9]+$/) } }]);
    expect(JSON.stringify(kit.queued)).not.toContain("Carte grise");
    // A document request is not a first visible reply (only proposals and messages count).
    expect(kit.firstReplies).toEqual([]);

    const broker = await kit.requests.listForBroker("starter", assignment.id, actors.starter);
    expect(broker).toMatchObject({ openCount: 1, maxOpen: 10, canCreate: true, blockers: [] });
    const visitor = await kit.requests.visitorList(ref, visitorToken());
    expect(visitor.items).toEqual([expect.objectContaining({ id: created.id, partnerName: "Cabinet Kone", label: "Carte grise", status: "open", canUpload: true, uploadedCount: 0 })]);
  });

  it("is fulfilled by the visitor's clean upload, shares the file with the broker and notifies it", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("crm", assignment.id, request, actors.pro);
    const result = await kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF, "carte-grise.pdf")], {});
    expect(result).toEqual({ requestId: created.id, status: "fulfilled", uploaded: 1 });
    expect(kit.queued.filter((entry) => entry.method === "queueBrokerDocumentReceived")).toHaveLength(1);

    const broker = await kit.requests.listForBroker("crm", assignment.id, actors.pro);
    expect(broker.items[0]).toMatchObject({ status: "fulfilled", documents: [expect.objectContaining({ fileName: "carte-grise.pdf", mimeType: "application/pdf" })] });
    const documentId = broker.items[0]!.documents[0]!.id;
    const downloaded = await kit.requests.brokerDocument("crm", assignment.id, created.id, documentId, actors.pro);
    expect(downloaded.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(kit.audit.search({ action: "lead_document_request.document_downloaded" })).toHaveLength(1);
    expect(kit.audit.search({ action: "lead_document_request.fulfilled" })).toHaveLength(1);
    // Fulfilled: no second upload, and another broker cannot fetch the file.
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_NOT_OPEN" } });
    await expect(kit.requests.brokerDocument("crm", assignment.id, created.id, documentId, actors.other)).rejects.toThrow(/denied/);
  });

  it("keeps the request open when the upload is infected or invalid and stores nothing", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(INFECTED_PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_QUARANTINED" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(Buffer.from("x"), "x.txt", "text/plain")], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_INVALID" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [], {})).rejects.toMatchObject({ response: { code: "VALIDATION_FAILED" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF), file(PDF), file(PDF), file(PDF)], {})).rejects.toMatchObject({ response: { code: "VALIDATION_FAILED" } });
    expect(kit.provided).toEqual([]);
    expect(kit.storage.size()).toBe(0);
    expect((await kit.requests.listForBroker("starter", assignment.id, actors.starter)).items[0]?.status).toBe("open");
    expect(kit.audit.search({ action: "lead_document_request.upload_quarantined" })).toHaveLength(1);
    expect(kit.queued.filter((entry) => entry.method === "queueBrokerDocumentReceived")).toEqual([]);
  });

  it("blocks forbidden wording in the label and the note, and caps the open requests at ten", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await expect(kit.requests.create("starter", assignment.id, { label: "Contrat validé", note: undefined }, actors.starter)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING", details: { wording: ["contrat valide"] } } });
    await expect(kit.requests.create("starter", assignment.id, { label: "Pièce d'identité", note: "Prix garanti" }, actors.starter)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING" } });
    for (let index = 0; index < 10; index += 1) await kit.requests.create("starter", assignment.id, { label: `Document ${index}` }, actors.starter);
    await expect(kit.requests.create("starter", assignment.id, { label: "Le onzieme" }, actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_LIMIT_REACHED" } });
    const list = await kit.requests.listForBroker("starter", assignment.id, actors.starter);
    expect(list).toMatchObject({ openCount: 10, canCreate: false, blockers: ["limit_reached"] });
    // Cancelling one frees a slot.
    await kit.requests.cancel("starter", assignment.id, list.items[0]!.id, actors.starter);
    await kit.requests.create("starter", assignment.id, { label: "Le onzieme" }, actors.starter);
  });

  it("cancels an open request for the broker, history kept, and the visitor can no longer upload", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
    const cancelled = await kit.requests.cancel("starter", assignment.id, created.id, actors.starter);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "broker" });
    await expect(kit.requests.cancel("starter", assignment.id, created.id, actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_NOT_OPEN" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_NOT_OPEN" } });
    expect((await kit.requests.visitorList(ref, visitorToken())).items[0]).toMatchObject({ status: "cancelled", canUpload: false });
  });

  it("cancels the previous broker's open requests on a reassignment (lazily and on demand) and hides them from the new broker", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("crm", assignment.id, request, actors.pro);
    await kit.assignments.reassign(assignment.id, { partnerTenantId: OTHER_TENANT, routingDecisionId: "d1", reason: "reaffectation", previousPartnerTenantId: TENANT }, actors.compliance);
    // Lazy: the visitor read closes it, and the upload is refused.
    expect((await kit.requests.visitorList(ref, visitorToken())).items[0]).toMatchObject({ status: "cancelled", canUpload: false });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_NOT_OPEN" } });
    expect(kit.audit.search({ action: "lead_document_request.cancelled" }).map((entry) => entry.context)).toEqual([{ reason: "reassigned", by: "system" }]);
    // The new broker starts clean and cannot cancel the previous broker's request.
    await kit.assignments.updateStatus(assignment.id, "accepted", actors.other, "test");
    const fresh = await kit.requests.listForBroker("crm", assignment.id, actors.other);
    expect(fresh.items).toEqual([]);
    await expect(kit.requests.cancel("crm", assignment.id, created.id, actors.other)).rejects.toMatchObject({ response: { code: "NOT_FOUND" } });

    // On demand, for the reassignment and closure paths.
    const second = await kit.assign("q2");
    const open = await kit.requests.create("crm", second.id, request, actors.pro);
    expect(await kit.requests.closeForAssignment(second.id, "closed")).toBe(1);
    expect(await kit.requests.closeForAssignment(second.id, "closed")).toBe(0);
    expect((await kit.repository.findDocumentRequest(open.id))?.cancelReason).toBe("closed");
  });

  it("refuses requests and uploads when the lead is closed, the consent withdrawn or the flag off, and isolates another visitor", async () => {
    let enabled = true;
    const kit = await createKit({ enabled: () => enabled });
    const assignment = await kit.assign();
    const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
    // Another visitor's token never reaches the request.
    await expect(kit.requests.visitorUpload("QR-2", visitorToken("q2"), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "VISITOR_ACCESS_DENIED" } });
    await expect(kit.requests.visitorUpload(ref, "wrong", created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "VISITOR_ACCESS_DENIED" } });
    await expect(kit.requests.visitorList(ref, "wrong")).rejects.toMatchObject({ response: { code: "VISITOR_ACCESS_DENIED" } });

    enabled = false;
    await expect(kit.requests.create("starter", assignment.id, { label: "Autre" }, actors.starter)).rejects.toMatchObject({ response: { code: "MESSAGING_DISABLED" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "MESSAGING_DISABLED" } });
    expect((await kit.requests.visitorList(ref, visitorToken())).items[0]).toMatchObject({ status: "open", canUpload: false });
    enabled = true;

    kit.quotes.q1!.status = "cancelled";
    await expect(kit.requests.create("starter", assignment.id, { label: "Autre" }, actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_CONSENT_WITHDRAWN" } });
    await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_NOT_OPEN" } });
    expect((await kit.requests.listForBroker("starter", assignment.id, actors.starter)).items[0]).toMatchObject({ status: "cancelled", cancelReason: "closed" });
    const closed = await kit.assign("q2", "closed");
    await expect(kit.requests.create("starter", closed.id, { label: "Autre" }, actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_CLOSED" } });
    const waiting = await kit.assign("q2", "assigned");
    await expect(kit.requests.create("starter", waiting.id, { label: "Autre" }, actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_NOT_ACCEPTED" } });
  });

  it("refuses another tenant and a read-only role, and keeps the audit free of labels and notes", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await expect(kit.requests.create("crm", assignment.id, request, actors.other)).rejects.toThrow(/denied/);
    await expect(kit.requests.create("crm", assignment.id, request, actors.readOnly)).rejects.toThrow();
    await expect(kit.requests.listForBroker("crm", assignment.id, actors.other)).rejects.toThrow(/denied/);
    const created = await kit.requests.create("crm", assignment.id, { label: "Libelle sensible", note: "Note sensible" }, actors.pro);
    await kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF, "fichier-sensible.pdf")], {});
    await kit.requests.brokerDocument("crm", assignment.id, created.id, (await kit.requests.listForBroker("crm", assignment.id, actors.pro)).items[0]!.documents[0]!.id, actors.pro);
    const trail = JSON.stringify([kit.audit.search({}), kit.queued]);
    for (const needle of ["sensible"]) expect(trail).not.toContain(needle);
  });

  it("anonymizes labels and notes but keeps statuses and timestamps", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
    await kit.requests.anonymizeForAssignments([assignment.id], "[anonymise]", new Date());
    expect(await kit.repository.findDocumentRequest(created.id)).toMatchObject({ label: "[anonymise]", status: "open", anonymizedAt: expect.any(Date) });
    expect((await kit.repository.findDocumentRequest(created.id))?.note).toBeUndefined();
  });
});

describe("document requests service hardening (spec 062 review fixes)", () => {
  it("caps the creations at 20 per lead in 24 hours, cancelled ones included, and hands the same bucket to the pointer e-mail", async () => {
    let now = new Date("2026-10-15T10:00:00.000Z");
    const kit = await createKit({ now: () => now });
    const assignment = await kit.assign();
    for (let index = 0; index < 20; index += 1) {
      const created = await kit.requests.create("starter", assignment.id, { label: `Piece ${index}` }, actors.starter);
      await kit.requests.cancel("starter", assignment.id, created.id, actors.starter);
      now = new Date(now.getTime() + 60_000);
    }
    // Cancelling frees the open slots but not the creation budget.
    const list = await kit.requests.listForBroker("starter", assignment.id, actors.starter);
    expect(list).toMatchObject({ openCount: 0, canCreate: false, blockers: ["limit_reached"] });
    await expect(kit.requests.create("starter", assignment.id, { label: "Une de trop" }, actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_REQUEST_LIMIT_REACHED" } });
    expect(kit.audit.search({ action: "lead_document_request.refused" }).map((entry) => entry.reason)).toEqual(["creation_limit_reached"]);
    expect(await kit.repository.listDocumentRequestsForAssignment(assignment.id)).toHaveLength(20);

    // The pointers carry the 15-minute bucket (the notification service dedupes on it), and the request id for the in-app side.
    const pointers = kit.queued.filter((entry) => entry.method === "queueVisitorDocumentsRequested").map((entry) => entry.event as { bucket: string; requestId: string });
    expect(pointers).toHaveLength(20);
    expect(new Set(pointers.map((event) => event.bucket)).size).toBeLessThanOrEqual(2);
    expect(new Set(pointers.map((event) => event.requestId)).size).toBe(20);

    // The budget slides: 24 hours after the first requests, creating works again.
    now = new Date(now.getTime() + 24 * 3_600_000);
    await kit.requests.create("starter", assignment.id, { label: "Le lendemain" }, actors.starter);
    // Another lead has its own budget.
    const other = await kit.assign("q2");
    await kit.requests.create("starter", other.id, { label: "Autre dossier" }, actors.starter);
  });

  it("applies the assigned-only scope of an agent on the Starter channel too (E-07)", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await kit.assignments.updateCrmMetadata(assignment.id, { assignedAdvisorId: actors.agentA.actorId! }, actors.pro);
    for (const channel of ["starter", "crm"] as const) {
      const created = await kit.requests.create(channel, assignment.id, { label: `Piece ${channel}` }, actors.agentA);
      expect((await kit.requests.listForBroker(channel, assignment.id, actors.agentA)).items.length).toBeGreaterThan(0);
      for (const run of [
        () => kit.requests.listForBroker(channel, assignment.id, actors.agentB),
        () => kit.requests.create(channel, assignment.id, { label: "Pas assigne" }, actors.agentB),
        () => kit.requests.cancel(channel, assignment.id, created.id, actors.agentB),
        () => kit.requests.brokerDocument(channel, assignment.id, created.id, crypto.randomUUID(), actors.agentB)
      ]) {
        await expect(run()).rejects.toThrow(/denied/);
      }
      await kit.requests.cancel(channel, assignment.id, created.id, actors.agentA);
    }
    expect((await kit.repository.listDocumentRequestsForAssignment(assignment.id)).every((entry) => entry.authorId === "agent-a")).toBe(true);
  });

  it("keeps the request open and stores nothing when the antivirus fails or crashes (scan_failed)", async () => {
    const scanners: VirusScannerPort[] = [
      { engine: "clamav", scan: async () => ({ verdict: "failed" as const, engine: "clamav", detail: "timeout" }) },
      { engine: "clamav", scan: async () => { throw new Error("socket hang up"); } }
    ];
    for (const scanner of scanners) {
      const kit = await createKit({ scanner });
      const assignment = await kit.assign();
      const created = await kit.requests.create("starter", assignment.id, request, actors.starter);
      await expect(kit.requests.visitorUpload(ref, visitorToken(), created.id, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_QUARANTINED" } });
      expect(kit.provided).toEqual([]);
      expect(kit.storage.size()).toBe(0);
      expect((await kit.requests.listForBroker("starter", assignment.id, actors.starter)).items[0]).toMatchObject({ status: "open", documents: [] });
      expect(kit.audit.search({ action: "lead_document_request.upload_quarantined" }).map((entry) => entry.reason)).toEqual(["scan_failed"]);
      expect(kit.queued.filter((entry) => entry.method === "queueBrokerDocumentReceived")).toEqual([]);
    }
  });

  it("catches the promise wording hidden by separators or invisible characters in the label and the note", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    for (const input of [{ label: "Remboursement-garanti" }, { label: "Carte grise", note: "Prix garanti" }, { label: "Rembour​sement garanti" }]) {
      await expect(kit.requests.create("starter", assignment.id, input, actors.starter)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING" } });
    }
    // Ordinary technical wording is fine.
    await kit.requests.create("starter", assignment.id, { label: "Liste des risques garantis" }, actors.starter);
    expect(await kit.repository.listDocumentRequestsForAssignment(assignment.id)).toHaveLength(1);
  });
});
