import { describe, expect, it } from "vitest";
import { RETENTION_CATEGORIES } from "../../../../packages/shared/contracts/data-retention.contracts";
import { ANONYMIZED_MARKER } from "../../../src/modules/data-retention/retention-subjects.repository";
import { DEFAULT_RETENTION_POLICIES } from "../../../src/modules/data-retention/retention-policies";
import { compliance, createRetentionWorld, NOW, TENANT_A, TENANT_B } from "../data-retention/retention-world";

const reason = "Revue trimestrielle de conservation";
const NEW_CATEGORIES = ["lead_message_threads", "lead_document_requests", "data_requests"] as const;

function selected(batch: { counts: Array<{ subject: string; selected: number; anonymized: number; skipped: number }> }): Record<string, number> {
  return Object.fromEntries(batch.counts.map((count) => [count.subject, count.selected]));
}

describe("spec 062 retention of conversations, document requests and data requests", () => {
  it("lists the three provisional policies with their durations", async () => {
    const world = createRetentionWorld();
    const policies = await world.service.getPolicies(compliance);

    expect(policies.items).toHaveLength(RETENTION_CATEGORIES.length);
    expect(Object.fromEntries(policies.items.filter((item) => (NEW_CATEGORIES as readonly string[]).includes(item.category)).map((item) => [item.category, [item.retentionDays, item.source]])))
      .toEqual({ lead_message_threads: [730, "default"], lead_document_requests: [180, "default"], data_requests: [1825, "default"] });
    expect(DEFAULT_RETENTION_POLICIES.data_requests.retentionDays).toBeGreaterThan(DEFAULT_RETENTION_POLICIES.lead_message_threads.retentionDays);
  });

  it("selects a thread only once its latest message is past the duration, and a closed data request only", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const old = await world.addQuote({ prospect, ageDays: 20, tenants: [TENANT_A, TENANT_B] });
    const [oldThread, recentThread] = old.assignments as [typeof old.assignments[number], typeof old.assignments[number]];
    await world.addLeadMessage({ quote: old.quote, assignment: oldThread, ageDays: 900 });
    await world.addLeadMessage({ quote: old.quote, assignment: oldThread, ageDays: 800 });
    // One recent message keeps the whole thread.
    await world.addLeadMessage({ quote: old.quote, assignment: recentThread, ageDays: 900 });
    await world.addLeadMessage({ quote: old.quote, assignment: recentThread, ageDays: 5 });
    await world.addLeadDocumentRequest({ quote: old.quote, assignment: oldThread, ageDays: 200 });
    await world.addLeadDocumentRequest({ quote: old.quote, assignment: recentThread, ageDays: 20 });
    const closed = await world.addDataRequest({ quote: old.quote, ageDays: 2000, status: "completed", type: "access" });
    await world.addDataRequest({ quote: old.quote, ageDays: 2000, status: "in_review", type: "erasure" });
    await world.addDataRequest({ quote: old.quote, ageDays: 400, status: "completed", type: "rectification" });

    const preview = await world.service.previewRetention({ categories: [...NEW_CATEGORIES], reason }, compliance);

    expect(selected(preview)).toEqual({ lead_message_threads: 1, lead_document_requests: 1, data_requests: 1 });
    const targets = (await world.module.repository.findBatch(preview.id))?.targets;
    expect(targets?.lead_message_threads).toEqual([oldThread.id]);
    expect(targets?.lead_document_requests).toEqual([oldThread.id]);
    expect(targets?.data_requests).toEqual([closed.id]);
  });

  it("anonymizes an eligible thread, deletes its attachment objects and keeps ids, authors and timestamps", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const { quote, assignments } = await world.addQuote({ prospect, ageDays: 20, tenants: [TENANT_A] });
    const [assignment] = assignments as [typeof assignments[number]];
    const { message, attachments } = await world.addLeadMessage({ quote, assignment, ageDays: 900, withAttachment: true });
    const request = await world.addLeadDocumentRequest({ quote, assignment, ageDays: 400 });
    const data = await world.addDataRequest({ quote, ageDays: 2000, reference: "DR-RETAIN01" });
    world.enablePurge();

    const preview = await world.service.previewRetention({ categories: [...NEW_CATEGORIES], reason }, compliance);
    expect(selected(preview)).toEqual({ lead_message_threads: 1, lead_document_requests: 1, data_requests: 1 });
    const executed = await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    expect(executed.status).toBe("executed");
    expect(executed.counts.map((count) => [count.subject, count.anonymized, count.failed])).toEqual([["lead_message_threads", 1, 0], ["lead_document_requests", 1, 0], ["data_requests", 1, 0]]);
    const [storedMessage] = await world.messaging.listForQuote(quote.id);
    expect(storedMessage).toMatchObject({ id: message.id, senderType: "visitor", body: ANONYMIZED_MARKER, createdAt: message.createdAt });
    expect(storedMessage?.anonymizedAt).toEqual(NOW);
    expect(storedMessage?.attachments[0]).toMatchObject({ id: attachments[0]?.id, fileName: ANONYMIZED_MARKER });
    expect(await world.storage.get(attachments[0]?.storageKey ?? "")).toBeUndefined();
    const [storedRequest] = await world.messaging.listDocumentRequestsForQuote(quote.id);
    expect(storedRequest).toMatchObject({ id: request.id, label: ANONYMIZED_MARKER, status: "open" });
    expect(storedRequest?.note).toBeUndefined();
    const [storedData] = await world.dataRequests.listForQuote(quote.id);
    expect(storedData).toMatchObject({ id: data.id, reference: "DR-RETAIN01", type: "access", status: "completed", detail: ANONYMIZED_MARKER, decisionNote: ANONYMIZED_MARKER });
    expect(storedData?.anonymizedAt).toEqual(NOW);
    expect(storedData?.createdAt).toEqual(data.createdAt);
    expect(storedData?.dueAt).toEqual(data.dueAt);
    expect(storedData?.decidedAt).toEqual(data.decidedAt);
  });

  it("cascades from the anonymization of a quote request: messages, attachments, document requests and data requests", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const { quote, assignments } = await world.addQuote({ prospect, ageDays: 800, tenants: [TENANT_A] });
    const [assignment] = assignments as [typeof assignments[number]];
    // All of it is recent: only the quote request cascade can reach it.
    const { attachments } = await world.addLeadMessage({ quote, assignment, ageDays: 3, withAttachment: true });
    await world.addLeadMessage({ quote, assignment, ageDays: 2, senderType: "broker", body: "Bonjour Ama, pouvez-vous confirmer votre adresse ?" });
    await world.addLeadDocumentRequest({ quote, assignment, ageDays: 2 });
    const open = await world.addDataRequest({ quote, ageDays: 1, status: "received", type: "erasure", reference: "DR-CASCADE1" });
    world.enablePurge();

    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    expect(selected(preview)).toEqual({ quote_requests: 1 });
    await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    for (const message of await world.messaging.listForQuote(quote.id)) {
      expect(message.body).toBe(ANONYMIZED_MARKER);
      expect(message.anonymizedAt).toBeDefined();
      for (const attachment of message.attachments) expect(attachment.fileName).toBe(ANONYMIZED_MARKER);
    }
    expect(await world.storage.get(attachments[0]?.storageKey ?? "")).toBeUndefined();
    expect((await world.messaging.listDocumentRequestsForQuote(quote.id))[0]).toMatchObject({ label: ANONYMIZED_MARKER });
    const [stored] = await world.dataRequests.listForQuote(quote.id);
    // The request is still open: only its free text is gone, the proof of the request stays.
    expect(stored).toMatchObject({ id: open.id, reference: "DR-CASCADE1", type: "erasure", status: "received", detail: ANONYMIZED_MARKER });
    expect(stored?.createdAt).toEqual(open.createdAt);
  });

  it("counts the new subjects in an erasure preview and erases nothing before the explicit approval", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const { quote, assignments } = await world.addQuote({ prospect, ageDays: 30, tenants: [TENANT_A, TENANT_B] });
    const [first, second] = assignments as [typeof assignments[number], typeof assignments[number]];
    await world.addLeadMessage({ quote, assignment: first, ageDays: 3, withAttachment: true });
    await world.addLeadMessage({ quote, assignment: second, ageDays: 2 });
    await world.addLeadDocumentRequest({ quote, assignment: first, ageDays: 2 });
    await world.addDataRequest({ quote, ageDays: 1, status: "received", type: "erasure" });
    const other = world.addProspect("autre@example.test");
    const stranger = await world.addQuote({ prospect: other, ageDays: 30, tenants: [TENANT_A] });
    await world.addLeadMessage({ quote: stranger.quote, assignment: stranger.assignments[0] as never, ageDays: 3 });
    await world.addDataRequest({ quote: stranger.quote, ageDays: 1, status: "received", type: "access" });
    const before = JSON.stringify([await world.messaging.listForQuote(quote.id), await world.dataRequests.listAll()]);

    const preview = await world.service.previewErasure({ publicReference: quote.publicReference, reason: "Demande d'effacement de la personne concernee" }, compliance);

    expect(selected(preview)).toMatchObject({ quote_requests: 1, lead_message_threads: 2, lead_document_requests: 1, data_requests: 1 });
    expect(preview.status).toBe("previewed");
    expect(JSON.stringify([await world.messaging.listForQuote(quote.id), await world.dataRequests.listAll()])).toBe(before);
    expect(quote.anonymizedAt).toBeUndefined();
    // Another person's conversation and request are not part of the batch.
    expect((await world.module.repository.findBatch(preview.id))?.targets.data_requests).toHaveLength(1);

    // The same preview by e-mail reaches the same rows.
    const byEmail = await world.service.previewErasure({ email: "ama@example.test", reason: "Demande d'effacement de la personne concernee" }, compliance);
    expect(selected(byEmail)).toMatchObject({ lead_message_threads: 2, lead_document_requests: 1, data_requests: 1 });
  });
});
