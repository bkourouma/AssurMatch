import { describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import {
  DataRetentionAuditActions,
  RetentionAccessRefusedError,
  RetentionBatchConflictError,
  RetentionPurgeDisabledError
} from "../../../src/modules/data-retention/data-retention.module";
import { ANONYMIZED_MARKER } from "../../../src/modules/data-retention/retention-subjects.repository";
import { CI, compliance, createRetentionWorld, daysAgo, NOW, secondCompliance, SN, TENANT_A, TENANT_B } from "./retention-world";

const reason = "Revue trimestrielle de conservation";

describe("data retention service (spec 046)", () => {
  it("scenario 1: previews with the flag off, changes nothing, and refuses the approval with the flag named", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const old = await world.addQuote({ prospect, ageDays: 800, tenants: [TENANT_A] });
    const recent = await world.addQuote({ prospect, ageDays: 100 });
    const before = JSON.stringify(world.data);

    const batch = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);

    expect(batch).toMatchObject({ kind: "retention", status: "previewed", totalSelected: 1, moreRemaining: false });
    expect(batch.counts).toEqual([{ subject: "quote_requests", selected: 1, anonymized: 0, skipped: 0, failed: 0, moreRemaining: false }]);
    expect(JSON.stringify(world.data)).toBe(before);
    expect((await world.module.repository.findBatch(batch.id))?.targets.quote_requests).toEqual([old.quote.id]);
    expect((await world.service.listBatches(compliance)).purgeEnabled).toBe(false);

    await expect(world.service.approve(batch.id, { reason: "Validation conformite" }, compliance)).rejects.toBeInstanceOf(RetentionPurgeDisabledError);
    expect(JSON.stringify(world.data)).toBe(before);
    expect((await world.service.getBatch(batch.id, compliance)).status).toBe("refused");
    expect(world.audit.search({ action: DataRetentionAuditActions.batchRefused })[0]).toMatchObject({ result: "refused", reason: "retention_purge_disabled" });
    expect(recent.quote.anonymizedAt).toBeUndefined();
  });

  it("scenario 2 and 8: approves with the flag on, anonymizes the request cascade, one notice per tenant, consent and audit untouched", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const first = await world.addQuote({ prospect, ageDays: 800, tenants: [TENANT_A, TENANT_B], withDocument: true, withAi: true });
    const second = await world.addQuote({ prospect, ageDays: 900, tenants: [TENANT_A] });
    const consentBefore = JSON.stringify(world.data.consentRecords);
    world.enablePurge();

    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    const auditBefore = JSON.stringify(world.audit.all());
    const auditCountBefore = world.audit.all().length;
    // The approver may be another compliance admin, or the requester itself (D2).
    const executed = await world.service.approve(preview.id, { reason: "Validation conformite" }, secondCompliance);

    expect(executed).toMatchObject({ status: "executed", approvedById: "compliance-2", approvalReason: "Validation conformite" });
    expect(executed.counts).toEqual([{ subject: "quote_requests", selected: 2, anonymized: 2, skipped: 0, failed: 0, moreRemaining: false }]);

    for (const { quote } of [first, second]) {
      expect(quote.payload).toEqual({ anonymized: true });
      expect(quote).toMatchObject({ status: "routed", routingStatus: "assigned", anonymizationBatchId: preview.id });
      expect(quote.anonymizedAt).toEqual(NOW);
    }
    expect(prospect).toMatchObject({ emailNormalized: null, phoneNormalized: null, emailFingerprint: null, phoneFingerprint: null, anonymizationBatchId: preview.id });
    expect(prospect.displayName).toBeUndefined();

    const document = first.document;
    expect(document).toMatchObject({ fileName: "document-anonymise", status: "removed", checksum: "sha256-abc" });
    expect(await world.storage.get(document?.storageKey ?? "")).toBeUndefined();

    for (const assignment of [...first.assignments, ...second.assignments]) {
      expect(assignment.status).toBe("contacted");
      expect(assignment.actionComment).toBeUndefined();
      expect(assignment.contact).toEqual({});
      expect((await world.crm.notesForLead(assignment.id))[0]?.body).toBe(ANONYMIZED_MARKER);
      expect((await world.crm.tasksForLead(assignment.id))[0]?.title).toBe(ANONYMIZED_MARKER);
      expect((await world.crm.remindersForLead(assignment.id))[0]?.message).toBeUndefined();
      expect((await world.crm.proposalsForLead(assignment.id))[0]).toMatchObject({ reference: "PROP-1", amountIndicative: 120_000 });
      expect((await world.crm.proposalsForLead(assignment.id))[0]?.notes).toBeUndefined();
      expect((await world.crm.disputesForLead(assignment.id))[0]).toMatchObject({ reason: "duplicate", status: "opened" });
      expect((await world.crm.disputesForLead(assignment.id))[0]?.comment).toBeUndefined();
      expect((await world.crm.documentsForLead(assignment.id))[0]).toMatchObject({ label: ANONYMIZED_MARKER, storageKey: ANONYMIZED_MARKER });
    }
    expect(world.data.history.every((event) => event.comment === undefined)).toBe(true);
    expect(first.interaction).toMatchObject({ outputReference: ANONYMIZED_MARKER, outputText: null, outputData: { anonymized: true } });
    expect(world.data.summaries[0]?.summaryReference).toBeUndefined();

    // D4: one notice per partner tenant per batch, with references and no visitor identity.
    expect(world.notices.map((notice) => notice.scopeId).sort()).toEqual([TENANT_A, TENANT_B].sort());
    const noticeA = world.notices.find((notice) => notice.scopeId === TENANT_A);
    expect(noticeA).toMatchObject({ template: "lead_data_anonymized", targetType: "AnonymizationBatch", targetId: preview.id });
    expect(noticeA?.body).toContain(first.quote.publicReference);
    expect(noticeA?.body).toContain(second.quote.publicReference);
    expect(noticeA?.body).not.toMatch(/Ama|example\.test|\+225/);

    // Scenario 8: consent records and earlier audit entries are byte-identical.
    expect(JSON.stringify(world.data.consentRecords)).toBe(consentBefore);
    expect(JSON.stringify(world.audit.all().slice(0, auditCountBefore))).toBe(auditBefore);
    expect(first.quote.consentRecordId).toBe(first.consent.id);
    expect(world.audit.search({ action: DataRetentionAuditActions.batchApproved })[0]?.context).toMatchObject({ sameActorAsRequester: false });
    expect(world.audit.search({ action: DataRetentionAuditActions.categoryAnonymized })[0]?.context).toMatchObject({ subject: "quote_requests", anonymized: 2 });
    expect(world.audit.search({ action: DataRetentionAuditActions.batchExecuted })).toHaveLength(1);
  });

  it("scenario 3: refuses a second approval with a conflict and never selects an anonymized row again", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    await world.addQuote({ prospect, ageDays: 800 });
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    await expect(world.service.approve(preview.id, { reason: "Validation conformite" }, compliance)).rejects.toBeInstanceOf(RetentionBatchConflictError);
    expect(world.audit.search({ action: DataRetentionAuditActions.batchRefused })[0]).toMatchObject({ reason: "batch_executed" });
    const again = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    expect(again.totalSelected).toBe(0);
  });

  it("scenario 4: skips a request that received broker activity after the preview", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const { quote, assignments } = await world.addQuote({ prospect, ageDays: 800, tenants: [TENANT_A] });
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    expect(preview.totalSelected).toBe(1);

    const assignment = assignments[0];
    if (assignment) assignment.lastBrokerActionAt = NOW;
    const executed = await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    expect(executed.counts[0]).toMatchObject({ subject: "quote_requests", selected: 1, anonymized: 0, skipped: 1 });
    expect(quote.anonymizedAt).toBeUndefined();
    expect(quote.payload).not.toEqual({ anonymized: true });
    expect(world.notices).toHaveLength(0);
  });

  it("scenario 5: erasure by e-mail finds every row of the person and the batch stores no e-mail nor fingerprint", async () => {
    const world = createRetentionWorld();
    const email = "ama@example.test";
    const prospect = world.addProspect(email);
    const first = await world.addQuote({ prospect, ageDays: 10, tenants: [TENANT_A] });
    const second = await world.addQuote({ prospect, ageDays: 5 });
    const message = world.addContactMessage(email, 3);
    const entry = world.addWaitlistEntry(email, SN, 2);
    const other = world.addProspect("kofi@example.test");
    const untouched = await world.addQuote({ prospect: other, ageDays: 10 });
    world.enablePurge();

    const preview = await world.service.previewErasure({ email: "  AMA@example.test ", reason: "Demande d'effacement recue par courrier" }, compliance);

    expect(preview).toMatchObject({ kind: "erasure", erasureLookup: "email", totalSelected: 4 });
    expect(Object.fromEntries(preview.counts.map((count) => [count.subject, count.selected]))).toMatchObject({ quote_requests: 2, contact_messages: 1, waitlist: 1, quote_documents: 0, partner_applications: 0 });
    const stored = JSON.stringify(await world.module.repository.findBatch(preview.id));
    expect(stored).not.toContain(email);
    expect(stored).not.toContain(world.identity.fingerprint(email));
    expect(JSON.stringify(world.audit.search({ action: DataRetentionAuditActions.batchPreviewed }))).not.toContain(email);

    const executed = await world.service.approve(preview.id, { reason: "Effacement valide" }, compliance);
    expect(executed.counts.every((count) => count.failed === 0 && count.anonymized === count.selected)).toBe(true);
    expect(first.quote.payload).toEqual({ anonymized: true });
    expect(second.quote.payload).toEqual({ anonymized: true });
    expect(prospect.emailFingerprint).toBeNull();
    expect(message).toMatchObject({ name: ANONYMIZED_MARKER, emailNormalized: ANONYMIZED_MARKER, message: ANONYMIZED_MARKER, emailFingerprint: `anonymise:${message.id}` });
    expect(message.phone).toBeUndefined();
    expect(entry).toMatchObject({ emailNormalized: ANONYMIZED_MARKER, emailFingerprint: `anonymise:${entry.id}` });
    expect(untouched.quote.anonymizedAt).toBeUndefined();
    expect(other.emailNormalized).toBe("kofi@example.test");
    expect(world.notices.map((notice) => notice.scopeId)).toEqual([TENANT_A]);
  });

  it("scenario 5b: erasure by public reference pivots on the person, and an unknown subject yields an empty batch", async () => {
    const world = createRetentionWorld();
    const prospect = world.addProspect("ama@example.test");
    const { quote } = await world.addQuote({ prospect, ageDays: 10 });
    world.addPartnerApplication("ama@example.test", "accepted", 30);

    const byReference = await world.service.previewErasure({ publicReference: quote.publicReference, reason: "Demande d'effacement telephonique" }, compliance);
    expect(byReference).toMatchObject({ erasureLookup: "public_reference", totalSelected: 2 });

    const unknown = await world.service.previewErasure({ email: "nobody@example.test", reason: "Demande d'effacement telephonique" }, compliance);
    expect(unknown).toMatchObject({ status: "previewed", totalSelected: 0 });
    const unknownReference = await world.service.previewErasure({ publicReference: "AM-UNKNOWN", reason: "Demande d'effacement telephonique" }, compliance);
    expect(unknownReference.totalSelected).toBe(0);
  });

  it("scenario 6: a 365-day country override makes that country's 400-day-old requests eligible only", async () => {
    const world = createRetentionWorld();
    const ci = await world.addQuote({ prospect: world.addProspect("ama@example.test", CI), ageDays: 400 });
    const sn = await world.addQuote({ prospect: world.addProspect("kofi@example.test", SN), ageDays: 400 });

    const policies = await world.service.upsertPolicy({ countryId: CI, category: "quote_requests", retentionDays: 365, reason: "Avis juridique Cote d'Ivoire" }, compliance);
    expect(policies.items.find((item) => item.category === "quote_requests")).toMatchObject({ retentionDays: 365, source: "country", defaultRetentionDays: 730, countryRetentionDays: 365 });
    // The country selector: every country, sorted by ISO code, four fields only (no publicSince).
    expect(policies.countries).toEqual([
      { id: CI, isoCode: "CI", name: "Cote d'Ivoire", status: "public" },
      { id: SN, isoCode: "SN", name: "Senegal", status: "internal" }
    ]);
    expect((await world.service.getPolicies(compliance)).countries.map((country) => country.isoCode)).toEqual(["CI", "SN"]);
    expect(world.audit.search({ action: DataRetentionAuditActions.policyChanged })[0]?.context).toMatchObject({
      previous: { override: null, effective: 730, source: "default" },
      next: { override: 365, effective: 365, source: "country" }
    });

    const global = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    expect((await world.module.repository.findBatch(global.id))?.targets.quote_requests).toEqual([ci.quote.id]);
    const scoped = await world.service.previewRetention({ countryId: SN, categories: ["quote_requests"], reason }, compliance);
    expect(scoped.totalSelected).toBe(0);
    expect(sn.quote.anonymizedAt).toBeUndefined();

    const reverted = await world.service.upsertPolicy({ countryId: CI, category: "quote_requests", retentionDays: null, reason: "Retour au defaut global" }, compliance);
    expect(reverted.items.find((item) => item.category === "quote_requests")).toMatchObject({ retentionDays: 730, source: "default" });
    await expect(world.service.getPolicies(compliance, "00000000-0000-4000-8000-00000000dead")).rejects.toThrow(/not found/);
  });

  it("scenario 7: refuses admin_pays, support_admin, a broker and an actor without MFA, and audits each refusal", async () => {
    const world = createRetentionWorld();
    const refused: ActorContext[] = [
      { actorId: "pays", roles: ["admin_pays"], mfaVerified: true },
      { actorId: "support", roles: ["support_admin"], mfaVerified: true },
      { actorId: "broker", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: TENANT_A },
      { actorId: "no-mfa", roles: ["compliance_admin"], mfaVerified: false }
    ];
    for (const actor of refused) {
      await expect(world.service.getPolicies(actor)).rejects.toBeInstanceOf(RetentionAccessRefusedError);
      await expect(world.service.previewRetention({ reason }, actor)).rejects.toBeInstanceOf(RetentionAccessRefusedError);
    }
    const refusals = world.audit.search({ action: DataRetentionAuditActions.accessRefused });
    expect(refusals).toHaveLength(8);
    expect(refusals.map((entry) => entry.reason)).toContain("mfa_required");
    expect(refusals.map((entry) => entry.reason)).toContain("forbidden_role");
    await expect(world.service.getPolicies({ actorId: "root", roles: ["super_admin"], mfaVerified: true })).resolves.toMatchObject({ purgeEnabled: false });
  });

  it("expires a preview after 24 hours and answers a conflict", async () => {
    const world = createRetentionWorld();
    await world.addQuote({ prospect: world.addProspect("ama@example.test"), ageDays: 800 });
    world.enablePurge();
    const preview = await world.service.previewRetention({ categories: ["quote_requests"], reason }, compliance);
    world.clock.now = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);

    expect((await world.service.getBatch(preview.id, compliance)).status).toBe("expired");
    await expect(world.service.approve(preview.id, { reason: "Validation conformite" }, compliance)).rejects.toThrow(/batch_expired/);
    expect((await world.module.repository.findBatch(preview.id))?.status).toBe("expired");
  });

  it("caps a category and reports that more rows remain", async () => {
    const world = createRetentionWorld();
    for (let index = 0; index < 3; index += 1) await world.addQuote({ prospect: world.addProspect(`p${index}@example.test`), ageDays: 800 + index });
    const result = await world.module.eligibility.compute({ categories: ["quote_requests"], policies: [], now: NOW, cap: 2 });
    expect(result.counts.quote_requests).toEqual({ selected: 2, moreRemaining: true });
    // Oldest activity first.
    expect(result.targets.quote_requests).toEqual([world.data.quoteRequests[2]?.id, world.data.quoteRequests[1]?.id]);
  });

  it("anonymizes the self-contained categories with their D1 anchors and final statuses only", async () => {
    const world = createRetentionWorld();
    const oldMessage = world.addContactMessage("a@example.test", 400);
    const newMessage = world.addContactMessage("b@example.test", 100);
    const rejected = world.addPartnerApplication("c@example.test", "rejected", 400);
    const accepted = world.addPartnerApplication("d@example.test", "accepted", 400);
    // CI opened 900 days ago: an entry is due 365 days after the opening. SN never opened: its own retentionUntil rules.
    const openedEntry = world.addWaitlistEntry("e@example.test", CI, 1000);
    const neverOpenedExpired = world.addWaitlistEntry("f@example.test", SN, 1200, daysAgo(10));
    const neverOpenedLive = world.addWaitlistEntry("g@example.test", SN, 30);
    const oldAi = world.aiInteraction({ occurredAt: daysAgo(400) });
    world.data.aiInteractions.push(oldAi);
    world.data.webhooks.push(
      { id: crypto.randomUUID(), partnerTenantId: TENANT_A, eventId: "e1", eventType: "lead.assigned", payload: { lead: "x" }, payloadMetadata: {}, status: "delivered", attemptCount: 1, idempotencyKey: "k1", createdAt: daysAgo(100), updatedAt: daysAgo(100) },
      { id: crypto.randomUUID(), partnerTenantId: TENANT_A, eventId: "e2", eventType: "lead.assigned", payload: { lead: "y" }, payloadMetadata: {}, status: "retryable", attemptCount: 1, idempotencyKey: "k2", createdAt: daysAgo(100), updatedAt: daysAgo(100) }
    );
    world.data.notifications.push(
      { id: crypto.randomUUID(), type: "broker_lead_assigned", recipientScope: "partner:a", whatsAppStatus: "queued", emailStatus: "sent", payloadReference: "quote-1", retryCount: 0, createdAt: daysAgo(100), updatedAt: daysAgo(100) },
      { id: crypto.randomUUID(), type: "broker_lead_assigned", recipientScope: "partner:a", whatsAppStatus: "queued", emailStatus: "queued", payloadReference: "quote-2", retryCount: 0, createdAt: daysAgo(100), updatedAt: daysAgo(100) }
    );
    world.data.deliveries.push({ id: crypto.randomUUID(), channel: "sms", status: "refused", template: "t", recipientMasked: "+225******05", provider: "none", partnerTenantId: null, scopeId: "s", reason: null, correlationId: null, createdAt: daysAgo(100) });
    world.enablePurge();

    const preview = await world.service.previewRetention({ reason }, compliance);
    const selected = Object.fromEntries(preview.counts.map((count) => [count.subject, count.selected]));
    expect(selected).toEqual({ quote_requests: 0, quote_documents: 0, contact_messages: 1, partner_applications: 1, waitlist: 2, ai_traces: 1, webhook_payloads: 1, messaging_references: 2 });
    await world.service.approve(preview.id, { reason: "Validation conformite" }, compliance);

    expect(oldMessage.anonymizedAt).toEqual(NOW);
    expect(newMessage.anonymizedAt).toBeUndefined();
    expect(rejected).toMatchObject({ contactName: ANONYMIZED_MARKER, status: "rejected", publicReference: "PA-1" });
    expect(rejected.reviewNote).toBeUndefined();
    expect(accepted.anonymizedAt).toBeUndefined();
    expect(openedEntry.anonymizedAt).toEqual(NOW);
    expect(neverOpenedExpired.anonymizedAt).toEqual(NOW);
    expect(neverOpenedLive.anonymizedAt).toBeUndefined();
    expect(oldAi.outputReference).toBe(ANONYMIZED_MARKER);
    expect(world.data.webhooks.map((delivery) => delivery.payload)).toEqual([{ anonymized: true }, { lead: "y" }]);
    expect(world.data.notifications.map((notification) => notification.payloadReference)).toEqual([ANONYMIZED_MARKER, "quote-2"]);
    expect(world.data.deliveries[0]?.recipientMasked).toBe(ANONYMIZED_MARKER);

    // A country-scoped preview cannot attribute country-less rows.
    const scoped = await world.service.previewRetention({ countryId: CI, categories: ["webhook_payloads"], reason }, compliance);
    expect(scoped.totalSelected).toBe(0);
  });
});
