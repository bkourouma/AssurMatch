import { describe, expect, it, vi } from "vitest";
import type { VirusScannerPort } from "../../../src/modules/quote-documents/virus-scanner.port";
import { conversationIdFor } from "../../../src/modules/lead-messaging/lead-messaging.rules";
import { messageNotificationBucket } from "../../../src/modules/lead-messaging/lead-messaging.ports";
import { INFECTED_PDF, OTHER_TENANT, PDF, TENANT, actors, createKit, file, query, tickingClock, visitorToken } from "./lead-messaging-kit";

const ref = "QR-1";

describe("lead messaging service (spec 062)", () => {
  it("lets a Starter and a CRM broker write to the visitor, notify once per bucket and count only the first broker message for the SLA", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const first = await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour, pouvez-vous me rappeler votre usage du vehicule ?" }, [], actors.starter);
    expect(first.message).toMatchObject({ senderType: "broker", mine: true, readAt: null, attachments: [] });
    await kit.messages.brokerSend("crm", assignment.id, { body: "Second message dans la meme tranche." }, [], actors.pro);
    // Pointers only: identifiers and a bucket, never the text.
    const visitorPointers = kit.queued.filter((entry) => entry.method === "queueVisitorBrokerMessage");
    expect(visitorPointers).toHaveLength(2);
    expect(JSON.stringify(visitorPointers)).not.toContain("Bonjour");
    expect(visitorPointers[0]?.event).toEqual({ assignmentId: assignment.id, partnerTenantId: TENANT, bucket: messageNotificationBucket(new Date(first.message.createdAt)) });
    // The port is idempotent: it is called for every broker message and only the first call writes.
    expect(kit.firstReplies).toEqual([assignment.id, assignment.id]);

    const list = await kit.messages.visitorList(ref, visitorToken());
    expect(list.messagingEnabled).toBe(true);
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]).toMatchObject({ partnerName: "Cabinet Kone", state: "open", canSend: true, unreadCount: 2 });
    expect(list.conversations[0]?.conversationId).toBe(conversationIdFor(assignment.id, TENANT));
    expect(list.conversations[0]?.conversationId).not.toContain(TENANT);
  });

  it("does not count a visitor message for the SLA and notifies the assigned broker", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Bonjour, j'ai une question." }, [], {});
    expect(kit.firstReplies).toEqual([]);
    expect(kit.queued.map((entry) => entry.method)).toEqual(["queueBrokerVisitorMessage"]);
    const view = await kit.messages.brokerConversation("starter", assignment.id, query, actors.starter);
    expect(view.unreadCount).toBe(1);
    expect(view.messages[0]).toMatchObject({ senderType: "visitor", mine: false, body: "Bonjour, j'ai une question." });
  });

  it("refuses a lead that is not accepted, closed or whose consent was withdrawn, and writes nothing", async () => {
    const kit = await createKit();
    const fresh = await kit.assign("q1", "assigned");
    await expect(kit.messages.brokerSend("starter", fresh.id, { body: "Bonjour" }, [], actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_NOT_ACCEPTED" } });
    const closed = await kit.assign("q2", "closed");
    await expect(kit.messages.brokerSend("starter", closed.id, { body: "Bonjour" }, [], actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_CLOSED" } });
    await kit.assignments.updateStatus(fresh.id, "accepted", actors.pro, "test");
    kit.quotes.q1!.status = "cancelled";
    await expect(kit.messages.brokerSend("starter", fresh.id, { body: "Bonjour" }, [], actors.starter)).rejects.toMatchObject({ response: { code: "LEAD_CONSENT_WITHDRAWN" } });
    expect(await kit.repository.listForQuote("q1")).toEqual([]);
    expect(await kit.repository.listForQuote("q2")).toEqual([]);
    expect(kit.audit.search({ action: "lead_message.refused" }).map((entry) => entry.reason)).toEqual(["not_accepted", "lead_closed", "consent_withdrawn"]);
  });

  it("isolates tenants, unassigned agents and read-only roles; a reassigned broker loses read and write at once", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour" }, [], actors.other)).rejects.toThrow(/denied/);
    await expect(kit.messages.brokerConversation("crm", assignment.id, query, actors.other)).rejects.toThrow(/denied/);
    await expect(kit.messages.brokerSend("crm", assignment.id, { body: "Bonjour" }, [], actors.readOnly)).rejects.toThrow(/denied|read_only|permission/i);
    // Starter has no CRM route.
    await expect(kit.messages.brokerConversation("crm", assignment.id, query, actors.starter)).rejects.toThrow();
    await kit.messages.brokerSend("crm", assignment.id, { body: "Message de l'ancien courtier." }, [], actors.pro);

    await kit.assignments.reassign(assignment.id, { partnerTenantId: OTHER_TENANT, routingDecisionId: "d1", reason: "reaffectation", previousPartnerTenantId: TENANT }, actors.compliance);
    await expect(kit.messages.brokerConversation("crm", assignment.id, query, actors.pro)).rejects.toThrow(/denied/);
    await expect(kit.messages.brokerSend("crm", assignment.id, { body: "Encore moi" }, [], actors.pro)).rejects.toThrow(/denied/);
    // The new broker starts from an empty conversation.
    const fresh = await kit.messages.brokerConversation("crm", assignment.id, query, actors.other);
    expect(fresh.messages).toEqual([]);
    expect(fresh).toMatchObject({ readOnlyReason: "not_accepted", canSend: false });
    // The visitor keeps reading the previous conversation, read-only and marked "reassigned".
    const list = await kit.messages.visitorList(ref, visitorToken());
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]).toMatchObject({ partnerName: "Cabinet Kone", state: "read_only", readOnlyReason: "reassigned", canSend: false });
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationIdFor(assignment.id, TENANT), { body: "Bonjour ?" }, [], {})).rejects.toMatchObject({ response: { code: "CONVERSATION_READ_ONLY" } });
  });

  it("answers the neutral 404 to a bad token, another request's token and another request's conversation", async () => {
    const kit = await createKit();
    const mine = await kit.assign("q1");
    const theirs = await kit.assign("q2");
    const denied = { response: { code: "VISITOR_ACCESS_DENIED" } };
    await expect(kit.messages.visitorList(ref, "wrong")).rejects.toMatchObject(denied);
    await expect(kit.messages.visitorList(ref, visitorToken("q2"))).rejects.toMatchObject(denied);
    await expect(kit.messages.visitorConversation(ref, visitorToken(), conversationIdFor(theirs.id, TENANT), query)).rejects.toMatchObject(denied);
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationIdFor(theirs.id, TENANT), { body: "Bonjour" }, [], {})).rejects.toMatchObject(denied);
    await expect(kit.messages.visitorConversation(ref, visitorToken(), "0".repeat(32), query)).rejects.toMatchObject(denied);
    await expect(kit.messages.visitorMarkRead(ref, visitorToken(), conversationIdFor(theirs.id, TENANT))).rejects.toMatchObject(denied);
    expect((await kit.messages.visitorConversation(ref, visitorToken(), conversationIdFor(mine.id, TENANT), query)).messages).toEqual([]);
  });

  it("switches writes off with the flag, keeps reads, and reports the read-only reason", async () => {
    let enabled = true;
    const kit = await createKit({ enabled: () => enabled });
    const assignment = await kit.assign();
    await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour" }, [], actors.starter);
    enabled = false;
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Encore" }, [], actors.starter)).rejects.toMatchObject({ response: { code: "MESSAGING_DISABLED" } });
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationIdFor(assignment.id, TENANT), { body: "Merci" }, [], {})).rejects.toMatchObject({ response: { code: "MESSAGING_DISABLED" } });
    const view = await kit.messages.brokerConversation("starter", assignment.id, query, actors.starter);
    expect(view).toMatchObject({ state: "read_only", readOnlyReason: "messaging_disabled", canSend: false });
    expect(view.messages).toHaveLength(1);
    expect((await kit.messages.visitorList(ref, visitorToken())).messagingEnabled).toBe(false);
    expect(await kit.messages.summaryForVisitorStatus(kit.quotes.q1!)).toEqual({ enabled: false, unreadCount: 1 });
  });

  it("blocks forbidden wording in French (accented) and English and quotes the expression, without writing", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    for (const [body, expression] of [["Votre contrat validé vous attend.", "contrat valide"], ["Un prix garanti pour vous.", "prix garanti"], ["This is a guaranteed price.", "guaranteed"], ["Please buy now before it ends", "buy now"]] as const) {
      const error = await kit.messages.brokerSend("starter", assignment.id, { body }, [], actors.starter).catch((caught: unknown) => caught as { response: { code: string; message: string; details: { wording: string[] } } });
      expect(error).toHaveProperty("response");
      const response = (error as { response: { code: string; message: string; details: { wording: string[] } } }).response;
      expect(response.code).toBe("FORBIDDEN_WORDING");
      expect(response.message).toContain(expression);
      expect(response.details.wording).toContain(expression);
    }
    expect(await kit.repository.listForQuote("q1")).toEqual([]);
    // The neutral noun and ordinary prose still pass.
    await kit.messages.brokerSend("starter", assignment.id, { body: "Les garanties incluses sont detaillees dans ma proposition." }, [], actors.starter);
    // The audit keeps the reason and the number of expressions, never the text.
    const audit = JSON.stringify(kit.audit.search({ action: "lead_message.refused" }));
    expect(audit).toContain("forbidden_wording");
    expect(audit).not.toContain("prix garanti");
  });

  it("stores clean attachments, refuses the whole send when one is infected or invalid, and caps them at three", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const sent = await kit.messages.brokerSend("starter", assignment.id, { body: "Voici deux documents." }, [file(PDF, "devis.pdf"), file(PDF, "annexe.pdf")], actors.starter);
    expect(sent.message.attachments.map((attachment) => attachment.fileName)).toEqual(["devis.pdf", "annexe.pdf"]);

    const stored = await kit.repository.listForQuote("q1");
    expect(stored).toHaveLength(1);
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Un fichier suspect." }, [file(PDF, "ok.pdf"), file(INFECTED_PDF, "virus.pdf")], actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_QUARANTINED" } });
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Mauvais type." }, [file(Buffer.from("hello"), "note.txt", "text/plain")], actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_INVALID" } });
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Faux pdf." }, [file(Buffer.from("not a pdf"), "x.pdf")], actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_INVALID" } });
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Trop gros." }, [file(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), "gros.pdf")], actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_INVALID" } });
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Quatre." }, [file(PDF), file(PDF), file(PDF), file(PDF)], actors.starter)).rejects.toMatchObject({ response: { code: "VALIDATION_FAILED" } });
    // Nothing was written by any refusal, and the clean file of the infected batch was removed again.
    expect(await kit.repository.listForQuote("q1")).toHaveLength(1);
    expect(kit.storage.size()).toBe(2);
    expect(kit.audit.search({ action: "lead_message.attachment_quarantined" })).toHaveLength(1);
  });

  it("serves only clean attachments to the right side and audits each download", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    const sent = await kit.messages.brokerSend("starter", assignment.id, { body: "Document joint" }, [file(PDF, "devis.pdf")], actors.starter);
    const attachmentId = sent.message.attachments[0]!.id;
    const fromBroker = await kit.messages.brokerAttachment("starter", assignment.id, sent.message.id, attachmentId, actors.starter);
    expect(fromBroker).toMatchObject({ fileName: "devis.pdf", mimeType: "application/pdf" });
    const fromVisitor = await kit.messages.visitorAttachment(ref, visitorToken(), conversationId, sent.message.id, attachmentId, {});
    expect(fromVisitor.bytes.subarray(0, 4).toString()).toBe("%PDF");
    await expect(kit.messages.visitorAttachment(ref, visitorToken(), conversationId, sent.message.id, "unknown", {})).rejects.toMatchObject({ response: { code: "VISITOR_ACCESS_DENIED" } });
    await expect(kit.messages.brokerAttachment("starter", assignment.id, sent.message.id, attachmentId, actors.other)).rejects.toThrow(/denied/);
    expect(kit.audit.search({ action: "lead_message.attachment_downloaded" }).map((entry) => entry.context.by)).toEqual(["broker", "visitor"]);
    // A file that is not clean is never served nor listed.
    const record = (await kit.repository.findMessage(sent.message.id))!;
    await kit.repository.markAttachmentScanStatusForTest(record.attachments[0]!.id, "infected");
    await expect(kit.messages.brokerAttachment("starter", assignment.id, sent.message.id, attachmentId, actors.starter)).rejects.toMatchObject({ response: { code: "NOT_FOUND" } });
    expect((await kit.messages.brokerConversation("starter", assignment.id, query, actors.starter)).messages[0]?.attachments).toEqual([]);
  });

  it("is idempotent on clientRequestId, refuses an identical visitor repeat within five minutes and caps a thread at 300", async () => {
    let now = new Date("2026-10-15T10:00:00.000Z");
    const kit = await createKit({ now: () => now });
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    const first = await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour", clientRequestId: "retry-key-0001" }, [], actors.starter);
    const retry = await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour", clientRequestId: "retry-key-0001" }, [], actors.starter);
    expect(retry.message.id).toBe(first.message.id);
    expect(await kit.repository.countForConversation(assignment.id, TENANT)).toBe(1);
    expect(kit.queued.filter((entry) => entry.method === "queueVisitorBrokerMessage")).toHaveLength(1);

    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Merci beaucoup" }, [], {});
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Merci beaucoup" }, [], {})).rejects.toMatchObject({ response: { code: "DUPLICATE_MESSAGE" } });
    now = new Date(now.getTime() + 6 * 60_000);
    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Merci beaucoup" }, [], {});

    for (let index = 0; index < 300 - 3; index += 1) {
      await kit.repository.appendMessage({ id: crypto.randomUUID(), quoteRequestId: "q1", leadAssignmentId: assignment.id, partnerTenantId: TENANT, senderType: "broker", body: `m${index}`, createdAt: new Date(now.getTime() + index) }, []);
    }
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Un de trop" }, [], actors.starter)).rejects.toMatchObject({ response: { code: "THREAD_LIMIT_REACHED" } });
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Un de trop aussi" }, [], {})).rejects.toMatchObject({ response: { code: "THREAD_LIMIT_REACHED" } });
  });

  it("answers a filled honeypot with a fake success and writes nothing", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const result = await kit.messages.visitorSend(ref, visitorToken(), conversationIdFor(assignment.id, TENANT), { body: "Achetez ma crypto", website: "https://spam.example" }, [], {});
    expect(result.message.mine).toBe(true);
    expect(await kit.repository.listForQuote("q1")).toEqual([]);
    expect(kit.queued).toEqual([]);
  });

  it("marks messages read by the recipient only, on both sides, and paginates from the most recent", async () => {
    const kit = await createKit({ now: tickingClock() });
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    for (let index = 0; index < 3; index += 1) await kit.messages.brokerSend("starter", assignment.id, { body: `Message courtier ${index}` }, [], actors.starter);
    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Reponse du visiteur" }, [], {});

    expect((await kit.messages.visitorConversation(ref, visitorToken(), conversationId, query)).unreadCount).toBe(3);
    expect(await kit.messages.visitorMarkRead(ref, visitorToken(), conversationId)).toEqual({ markedRead: 3, unreadCount: 0 });
    // The broker sees the read receipts of its own messages; the visitor's message is still unread for the broker.
    const brokerView = await kit.messages.brokerConversation("starter", assignment.id, query, actors.starter);
    expect(brokerView.unreadCount).toBe(1);
    expect(brokerView.messages.filter((message) => message.senderType === "broker").every((message) => message.readAt !== null)).toBe(true);
    expect(brokerView.messages.find((message) => message.senderType === "visitor")?.readAt).toBeNull();
    expect(await kit.messages.brokerMarkRead("starter", assignment.id, actors.starter)).toEqual({ markedRead: 1, unreadCount: 0 });
    expect(await kit.messages.brokerMarkRead("starter", assignment.id, actors.starter)).toEqual({ markedRead: 0, unreadCount: 0 });

    const page = await kit.messages.visitorConversation(ref, visitorToken(), conversationId, { limit: 2 });
    expect(page.messages.map((message) => message.body)).toEqual(["Message courtier 2", "Reponse du visiteur"]);
    expect(page.nextCursor).not.toBeNull();
    const older = await kit.messages.visitorConversation(ref, visitorToken(), conversationId, { limit: 2, before: page.nextCursor! });
    expect(older.messages.map((message) => message.body)).toEqual(["Message courtier 0", "Message courtier 1"]);
    expect(older.nextCursor).toBeNull();
    await expect(kit.messages.visitorConversation(ref, visitorToken(), conversationId, { limit: 2, before: "unknown" })).rejects.toThrow(/Invalid/);
  });

  it("keeps message text, file names and visitor data out of audit entries and notification payloads", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    await kit.messages.brokerSend("crm", assignment.id, { body: "Texte secret du courtier" }, [file(PDF, "carte-grise-awa.pdf")], actors.pro);
    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Texte secret du visiteur" }, [file(PDF, "passeport-awa.pdf")], {});
    await kit.messages.brokerMarkRead("crm", assignment.id, actors.pro);
    const trail = JSON.stringify([kit.audit.search({}), kit.queued]);
    for (const needle of ["Texte secret", "carte-grise", "passeport"]) expect(trail).not.toContain(needle);
    expect(kit.audit.search({ action: "lead_message.sent" })).toHaveLength(1);
    expect(kit.audit.search({ action: "lead_message.visitor_sent" })).toHaveLength(1);
  });

  it("opens the exchange to the visitor before the first message, but only once the lead is accepted", async () => {
    const kit = await createKit();
    await kit.assign("q1", "assigned");
    expect((await kit.messages.visitorList(ref, visitorToken())).conversations).toEqual([]);
    const accepted = await kit.assign("q2", "accepted");
    const second = await kit.messages.visitorList("QR-2", visitorToken("q2"));
    expect(second.conversations).toHaveLength(1);
    expect(second.conversations[0]).toMatchObject({ conversationId: conversationIdFor(accepted.id, TENANT), canSend: true, lastMessage: null });
  });

  it("goes read-only for the visitor once the lead is closed or the consent is withdrawn", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour" }, [], actors.starter);
    await kit.assignments.updateStatus(assignment.id, "closed", actors.pro, "test");
    expect(await kit.messages.visitorConversation(ref, visitorToken(), conversationId, query)).toMatchObject({ state: "read_only", readOnlyReason: "lead_closed", canSend: false });
    kit.quotes.q1!.status = "cancelled";
    const view = await kit.messages.visitorConversation(ref, visitorToken(), conversationId, query);
    expect(view).toMatchObject({ readOnlyReason: "consent_withdrawn" });
    expect(view.messages).toHaveLength(1);
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Encore" }, [], {})).rejects.toMatchObject({ response: { code: "CONVERSATION_READ_ONLY" } });
  });

  it("reads a conversation as compliance (audited), masked for support, and refuses every other role", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await kit.messages.brokerSend("starter", assignment.id, { body: "Contenu confidentiel" }, [file(PDF)], actors.starter);
    const compliance = await kit.messages.adminConversations(actors.compliance, "q1");
    expect(compliance.masked).toBe(false);
    expect(compliance.conversations[0]?.messages[0]).toMatchObject({ body: "Contenu confidentiel", bodyMasked: false, attachmentCount: 1 });
    const support = await kit.messages.adminConversations(actors.support, "q1");
    expect(support.masked).toBe(true);
    expect(support.conversations[0]?.messages[0]).toMatchObject({ body: "[masqué]", bodyMasked: true });
    expect(JSON.stringify(support)).not.toContain("confidentiel");
    expect(kit.audit.search({ action: "lead_messaging.admin_viewed" })).toHaveLength(2);
    for (const actor of [actors.starter, actors.finance, { ...actors.compliance, mfaVerified: false }]) {
      await expect(kit.messages.adminConversations(actor, "q1")).rejects.toThrow(/denied/);
    }
    expect(kit.audit.search({ action: "lead_messaging.admin_view_refused" })).toHaveLength(3);
    await expect(kit.messages.adminConversations(actors.compliance, "missing")).rejects.toMatchObject({ response: { code: "NOT_FOUND" } });
  });

  it("anonymizes bodies and file names but keeps ids, authors and timestamps", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await kit.messages.brokerSend("starter", assignment.id, { body: "Texte a effacer" }, [file(PDF, "nom-personnel.pdf")], actors.starter);
    await kit.messages.anonymizeForAssignments([assignment.id], "[anonymise]", new Date());
    const [message] = await kit.repository.listForQuote("q1");
    expect(message).toMatchObject({ body: "[anonymise]", senderType: "broker", authorId: "starter-owner" });
    expect(message?.attachments[0]).toMatchObject({ fileName: "[anonymise]" });
    expect(message?.anonymizedAt).toBeInstanceOf(Date);
  });
});

describe("lead messaging service hardening (spec 062 review fixes)", () => {
  async function assignedTo(kit: Awaited<ReturnType<typeof createKit>>, advisorId: string) {
    const assignment = await kit.assign();
    await kit.assignments.updateCrmMetadata(assignment.id, { assignedAdvisorId: advisorId }, actors.pro);
    return assignment;
  }

  it("applies the assigned-only scope of an agent on the Starter channel too (E-07): the assigned agent works, another agent is refused and audited", async () => {
    const kit = await createKit();
    const assignment = await assignedTo(kit, actors.agentA.actorId!);
    const conversationId = conversationIdFor(assignment.id, TENANT);
    for (const channel of ["starter", "crm"] as const) {
      const sent = await kit.messages.brokerSend(channel, assignment.id, { body: `Bonjour par ${channel}` }, [file(PDF, "devis.pdf")], actors.agentA);
      expect((await kit.messages.brokerConversation(channel, assignment.id, query, actors.agentA)).messages.length).toBeGreaterThan(0);
      await kit.messages.brokerAttachment(channel, assignment.id, sent.message.id, sent.message.attachments[0]!.id, actors.agentA);
      for (const run of [
        () => kit.messages.brokerConversation(channel, assignment.id, query, actors.agentB),
        () => kit.messages.brokerSend(channel, assignment.id, { body: "Je ne suis pas assigne" }, [], actors.agentB),
        () => kit.messages.brokerMarkRead(channel, assignment.id, actors.agentB),
        () => kit.messages.brokerAttachment(channel, assignment.id, sent.message.id, sent.message.attachments[0]!.id, actors.agentB)
      ]) {
        await expect(run()).rejects.toThrow(/denied/);
      }
      expect(await kit.messages.brokerMarkRead(channel, assignment.id, actors.agentA)).toEqual({ markedRead: 0, unreadCount: 0 });
    }
    // Nothing was written by the refused agent.
    expect((await kit.repository.listForConversation(assignment.id, TENANT)).every((message) => message.authorId === "agent-a")).toBe(true);
    // The refusal of the Starter channel names the scope rule and is audited like the CRM one.
    const refusals = JSON.stringify(kit.audit.search({ result: "refused" }));
    expect(refusals).toContain("assigned_scope_required");
    // The visitor is not affected by who is assigned.
    expect((await kit.messages.visitorConversation(ref, visitorToken(), conversationId, query)).messages.length).toBeGreaterThan(0);
    // Roles with the whole CRM read scope (owner, manager) keep reaching a lead assigned to someone else.
    await kit.messages.brokerConversation("starter", assignment.id, query, actors.starter);
    await kit.messages.brokerConversation("crm", assignment.id, query, actors.pro);
  });

  it("refuses to leave a read receipt to a read-only role, on both channels", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await kit.messages.visitorSend(ref, visitorToken(), conversationIdFor(assignment.id, TENANT), { body: "Bonjour" }, [], {});
    await expect(kit.messages.brokerMarkRead("crm", assignment.id, actors.readOnly)).rejects.toThrow(/denied/);
    await expect(kit.messages.brokerMarkRead("starter", assignment.id, actors.readOnly)).rejects.toThrow(/denied/);
    expect((await kit.messages.brokerConversation("crm", assignment.id, query, actors.readOnly)).unreadCount).toBe(1);
    expect(kit.audit.search({ action: "lead_message.read" })).toEqual([]);
    expect(await kit.messages.brokerMarkRead("crm", assignment.id, actors.pro)).toEqual({ markedRead: 1, unreadCount: 0 });
  });

  it("runs the wording guard on the names of the attachments too and stores nothing when one is refused", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    for (const name of ["remboursement-garanti.pdf", "contrat valide.pdf", "Prix_garanti.pdf", "devis garanti a vie.pdf"]) {
      const error = await kit.messages.brokerSend("starter", assignment.id, { body: "Voici le document." }, [file(PDF, "ok.pdf"), file(PDF, name)], actors.starter).catch((caught: unknown) => caught as { response: { code: string; details: { wording: string[] } } });
      expect((error as { response: { code: string } }).response.code, name).toBe("FORBIDDEN_WORDING");
      expect((error as { response: { details: { wording: string[] } } }).response.details.wording.length, name).toBeGreaterThan(0);
    }
    expect(await kit.repository.listForQuote("q1")).toEqual([]);
    expect(kit.storage.size()).toBe(0);
    expect(kit.audit.search({ action: "lead_message.refused" }).every((entry) => entry.reason === "forbidden_wording" && entry.context.inFileName === true)).toBe(true);
    // An ordinary file name goes through.
    await kit.messages.brokerSend("starter", assignment.id, { body: "Voici le document." }, [file(PDF, "conditions-generales.pdf")], actors.starter);
    expect(kit.storage.size()).toBe(1);
  });

  it("lets the technical wording through that the old bare « garanti » check blocked", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    for (const body of ["Les risques garantis sont detailles en page 2.", "Capital garanti en cas de deces.", "Les dommages garantis incluent le vol."]) {
      await kit.messages.brokerSend("starter", assignment.id, { body }, [], actors.starter);
    }
    expect(await kit.repository.countForConversation(assignment.id, TENANT)).toBe(3);
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Un remboursement garanti sous 24 h." }, [], actors.starter)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING" } });
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Un remboursement​-garanti." }, [], actors.starter)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING" } });
  });

  it("deletes the stored objects when the write fails, for the broker and for the visitor", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const conversationId = conversationIdFor(assignment.id, TENANT);
    const failing = vi.spyOn(kit.repository, "appendMessage").mockRejectedValue(new Error("database unavailable"));
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Avec pieces" }, [file(PDF, "a.pdf"), file(PDF, "b.pdf")], actors.starter)).rejects.toThrow(/database unavailable/);
    await expect(kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Avec piece" }, [file(PDF, "c.pdf")], {})).rejects.toThrow(/database unavailable/);
    expect(kit.storage.size()).toBe(0);
    expect(kit.queued).toEqual([]);
    expect(kit.firstReplies).toEqual([]);
    expect(kit.audit.search({ action: "lead_message.sent" })).toEqual([]);
    expect(kit.audit.search({ action: "lead_message.visitor_sent" })).toEqual([]);
    failing.mockRestore();
    await kit.messages.brokerSend("starter", assignment.id, { body: "Une fois la base revenue" }, [file(PDF, "d.pdf")], actors.starter);
    expect(kit.storage.size()).toBe(1);
  });

  it("returns the message of a concurrent retry (same clientRequestId) without storing its files, auditing or notifying twice", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    const first = await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour", clientRequestId: "retry-key-0002" }, [], actors.starter);
    const queuedBefore = kit.queued.length;
    // The race: the pre-check does not see the first message yet, the repository replays it on the unique key.
    const stored = (await kit.repository.findMessage(first.message.id))!;
    vi.spyOn(kit.repository, "findByClientRequestId").mockResolvedValueOnce(undefined);
    vi.spyOn(kit.repository, "appendMessage").mockResolvedValueOnce(stored);
    const replay = await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour", clientRequestId: "retry-key-0002" }, [file(PDF, "doublon.pdf")], actors.starter);
    expect(replay.message.id).toBe(first.message.id);
    expect(kit.storage.size()).toBe(0);
    expect(kit.queued).toHaveLength(queuedBefore);
    expect(kit.audit.search({ action: "lead_message.sent" })).toHaveLength(1);
  });

  it("answers a failed or crashing antivirus with DOCUMENT_QUARANTINED and writes nothing (scan_failed)", async () => {
    const scanners: VirusScannerPort[] = [
      { engine: "clamav", scan: async () => ({ verdict: "failed" as const, engine: "clamav", detail: "timeout" }) },
      { engine: "clamav", scan: async () => { throw new Error("socket hang up"); } }
    ];
    for (const scanner of scanners) {
      const kit = await createKit({ scanner });
      const assignment = await kit.assign();
      const conversationId = conversationIdFor(assignment.id, TENANT);
      await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Avec piece" }, [file(PDF)], actors.starter)).rejects.toMatchObject({ response: { code: "DOCUMENT_QUARANTINED" } });
      await expect(kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Avec piece" }, [file(PDF)], {})).rejects.toMatchObject({ response: { code: "DOCUMENT_QUARANTINED" } });
      expect(await kit.repository.listForQuote("q1")).toEqual([]);
      expect(kit.storage.size()).toBe(0);
      expect(kit.queued).toEqual([]);
      expect(kit.audit.search({ action: "lead_message.attachment_quarantined" }).map((entry) => entry.reason)).toEqual(["scan_failed", "scan_failed"]);
    }
  });

  it("reads only the assignments of the quote request, never the whole table", async () => {
    const kit = await createKit();
    const mine = await kit.assign("q1");
    await kit.assign("q2");
    const everything = vi.spyOn(kit.assignments, "list");
    const scoped = vi.spyOn(kit.assignments, "listForQuote");
    const list = await kit.messages.visitorList(ref, visitorToken());
    expect(list.conversations.map((conversation) => conversation.conversationId)).toEqual([conversationIdFor(mine.id, TENANT)]);
    expect(await kit.requests.visitorList(ref, visitorToken())).toEqual({ items: [] });
    expect(scoped).toHaveBeenCalledWith("q1");
    expect(everything).not.toHaveBeenCalled();
    expect((await kit.assignments.listForQuote("q2")).map((assignment) => assignment.quoteRequestId)).toEqual(["q2"]);
    expect(await kit.assignments.listForQuote("unknown")).toEqual([]);
  });

  it("returns the whole thread to a reader asking for limit=300 and keeps 50 as the page default", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    for (let index = 0; index < 120; index += 1) {
      await kit.repository.appendMessage({ id: crypto.randomUUID(), quoteRequestId: "q1", leadAssignmentId: assignment.id, partnerTenantId: TENANT, senderType: index % 2 === 0 ? "broker" : "visitor", body: `m${index}`, createdAt: new Date(Date.UTC(2026, 9, 15, 10, 0, index)) }, []);
    }
    const defaultPage = await kit.messages.brokerConversation("starter", assignment.id, { limit: 50 }, actors.starter);
    expect(defaultPage.messages).toHaveLength(50);
    expect(defaultPage.nextCursor).not.toBeNull();
    const whole = await kit.messages.brokerConversation("starter", assignment.id, { limit: 300 }, actors.starter);
    expect(whole.messages).toHaveLength(120);
    expect(whole.nextCursor).toBeNull();
    expect(whole.messages[0]?.body).toBe("m0");
  });

  it("keeps the messages and the document requests from changing the status of the lead (FR-017) and never shows CRM vocabulary to the visitor", async () => {
    const kit = await createKit();
    const assignment = await kit.assign();
    await kit.assignments.updateCrmMetadata(assignment.id, { assignedAdvisorId: "agent-a", crmStatus: "qualifie" }, actors.pro);
    const before = await kit.assignments.require(assignment.id);
    expect(before.crmStatus).toBe("qualifie");
    const conversationId = conversationIdFor(assignment.id, TENANT);
    await kit.messages.brokerSend("crm", assignment.id, { body: "Bonjour" }, [file(PDF, "devis.pdf")], actors.pro);
    await kit.messages.visitorSend(ref, visitorToken(), conversationId, { body: "Merci" }, [], {});
    await kit.messages.brokerMarkRead("crm", assignment.id, actors.pro);
    await kit.requests.create("crm", assignment.id, { label: "Carte grise" }, actors.pro);
    const after = await kit.assignments.require(assignment.id);
    expect({ status: after.status, crmStatus: after.crmStatus }).toEqual({ status: before.status, crmStatus: before.crmStatus });
    const visitorPayloads = JSON.stringify([
      await kit.messages.visitorList(ref, visitorToken()),
      await kit.messages.visitorConversation(ref, visitorToken(), conversationId, query),
      await kit.requests.visitorList(ref, visitorToken())
    ]);
    for (const forbidden of ["crmStatus", "qualifie", "assignedAdvisor", "agent-a", "urgency", "pipeline", "kanban", TENANT]) expect(visitorPayloads, forbidden).not.toContain(forbidden);
  });
});
