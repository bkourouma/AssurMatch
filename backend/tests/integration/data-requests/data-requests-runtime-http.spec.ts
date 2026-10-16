import { afterEach, describe, expect, it } from "vitest";
import { adminDataRequestDetailSchema, adminDataRequestListSchema, dataRequestCreateResultSchema, visitorDataRequestListSchema } from "../../../../packages/shared/contracts/data-requests";
import { retentionBatchListResponseSchema, retentionBatchSchema, retentionPoliciesResponseSchema } from "../../../../packages/shared/contracts/data-retention.contracts";
import { DataRequestAuditActions } from "../../../src/modules/audit-logs/data-request-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { DataRetentionAuditActions } from "../../../src/modules/data-retention/data-retention-audit-actions";
import type { LeadMessagingRepository } from "../../../src/modules/lead-messaging/lead-messaging.repository";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

const json = { "content-type": "application/json" };
const compliance: ActorContext = { actorId: "compliance-dr", roles: ["compliance_admin"], mfaVerified: true, correlationId: "data-requests-http" };
const superAdmin: ActorContext = { actorId: "super-dr", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support-dr", roles: ["support_admin"], mfaVerified: true };
const DETAIL = "Je suis Ama Kouassi, mon numero est 0102030405, merci d'effacer mes donnees";
const MESSAGE_BODY = "Bonjour, voici mon adresse personnelle: 12 rue des Lilas";

describe("data requests runtime HTTP (spec 062 D-10)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function submitQuote(active: RuntimeHttpHarness, seed: Seed, email = "ama.kouassi@example.com") {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { ...json, "x-forwarded-for": "203.0.113.70" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Ama Kouassi", email, phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        ipAddress: "203.0.113.70",
        sessionId: `runtime-session-${email}`
      })
    });
    expect(response.status).toBe(201);
    return await response.json() as { publicReference: string; verificationToken: string };
  }

  /** `null` sends no token at all. */
  function visitorPath(confirmation: { publicReference: string }, token: string | null): string {
    return `/quote-requests/${confirmation.publicReference}/data-requests${token === null ? "" : `?token=${encodeURIComponent(token)}`}`;
  }

  function createRequest(active: RuntimeHttpHarness, confirmation: { publicReference: string; verificationToken: string }, body: unknown, token: string | null = confirmation.verificationToken) {
    return active.request(visitorPath(confirmation, token), { method: "POST", headers: json, body: JSON.stringify(body) });
  }

  function admin(active: RuntimeHttpHarness, path: string, actor: ActorContext, method = "GET", body?: unknown) {
    return active.request(path, { method, headers: { ...actorHeaders(actor), ...(body === undefined ? {} : json) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  async function messagingRepository(active: RuntimeHttpHarness): Promise<LeadMessagingRepository> {
    return (active.runtime as unknown as { leadMessagingRepository: LeadMessagingRepository }).leadMessagingRepository;
  }

  async function seedConversation(active: RuntimeHttpHarness, quoteId: string) {
    const [assignment] = (await active.runtime.leads.assignments.list()).filter((candidate) => candidate.quoteRequestId === quoteId);
    if (!assignment) throw new Error("assignment missing");
    const repository = await messagingRepository(active);
    const message = await repository.appendMessage({
      id: crypto.randomUUID(),
      quoteRequestId: quoteId,
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      senderType: "visitor",
      body: MESSAGE_BODY,
      createdAt: new Date()
    }, []);
    return { repository, message };
  }

  it("creates a request from the tracking space: 201, reference, one acknowledgement, a compliance alert, no detail in the audit trail", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));

    const response = await createRequest(active, confirmation, { type: "erasure", detail: DETAIL });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = dataRequestCreateResultSchema.parse(await readJson(response));
    expect(result).toMatchObject({ type: "erasure", status: "received", acknowledgedByEmail: true });
    expect(result.reference).toMatch(/^DR-[A-Z2-9]{8}$/);

    const [stored] = await active.runtime.dataRequests.repository.listAll();
    expect(stored).toMatchObject({ reference: result.reference, type: "erasure", status: "received", detail: DETAIL, locale: "fr" });
    expect(stored!.dueAt.getTime() - stored!.createdAt.getTime()).toBe(30 * 24 * 3600 * 1000);
    expect(stored?.acknowledgedAt).toBeDefined();
    const notifications = (await active.runtime.notifications.service.list()).filter((notification) => notification.type === "visitor_data_request_acknowledged");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.dedupeKey).toMatch(new RegExp(`^visitor_data_request_acknowledged:.+:-:${stored?.id}$`));
    expect(JSON.stringify(notifications)).not.toContain("Kouassi");
    const alerts = await active.runtime.adminAlerts.list(compliance, {});
    expect(alerts.items.filter((alert) => alert.type === "data_request_received")).toHaveLength(1);
    expect(JSON.stringify(alerts)).not.toContain("Kouassi");
    expect(active.runtime.audit.writer.search({ action: DataRequestAuditActions.created })).toHaveLength(1);
    expect(JSON.stringify(active.runtime.audit.writer.all())).not.toContain("Kouassi");

    const list = visitorDataRequestListSchema.parse(await readJson(await active.request(visitorPath(confirmation, confirmation.verificationToken))));
    expect(list.items).toEqual([expect.objectContaining({ reference: result.reference, type: "erasure", status: "received" })]);
  });

  it("answers the neutral 404 to a missing, wrong or foreign token, and never exposes another visitor's requests", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const mine = await submitQuote(active, seed, "ama.kouassi@example.com");
    const theirs = await submitQuote(active, seed, "autre.visiteur@example.com");
    await createRequest(active, theirs, { type: "access" });

    for (const token of [null, "", "wrong-token", theirs.verificationToken]) {
      const post = await createRequest(active, mine, { type: "access" }, token);
      expect(post.status, String(token)).toBe(404);
      expect(await readJson(post)).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
      const get = await active.request(visitorPath(mine, token));
      expect(get.status, String(token)).toBe(404);
      expect(await readJson(get)).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
    }
    expect((await active.request(`/quote-requests/AM-UNKNOWN/data-requests?token=${mine.verificationToken}`)).status).toBe(404);
    // My own space shows none of the other visitor's requests.
    expect(visitorDataRequestListSchema.parse(await readJson(await active.request(visitorPath(mine, mine.verificationToken)))).items).toEqual([]);
    expect(await active.runtime.dataRequests.repository.listAll()).toHaveLength(1);
  });

  it("refuses a duplicate open request with its reference, accepts another type and swallows the honeypot", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));
    const first = dataRequestCreateResultSchema.parse(await readJson(await createRequest(active, confirmation, { type: "access" })));

    const duplicate = await createRequest(active, confirmation, { type: "access", detail: "encore" });
    expect(duplicate.status).toBe(409);
    expect(await readJson(duplicate)).toMatchObject({ code: "DATA_REQUEST_ALREADY_OPEN", reference: first.reference });
    expect((await createRequest(active, confirmation, { type: "rectification" })).status).toBe(201);

    const honeypot = await createRequest(active, confirmation, { type: "erasure", website: "https://spam.example" });
    expect(honeypot.status).toBe(201);
    expect(dataRequestCreateResultSchema.parse(await readJson(honeypot))).toMatchObject({ type: "erasure", status: "received" });
    expect((await active.runtime.dataRequests.repository.listAll()).map((record) => record.type).sort()).toEqual(["access", "rectification"]);

    // No extra acknowledgement for the refused and fake attempts.
    expect((await active.runtime.notifications.service.list()).filter((notification) => notification.type === "visitor_data_request_acknowledged")).toHaveLength(2);
  });

  it("validates the body (400) without recording anything", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));

    for (const body of [{}, { type: "delete" }, { type: "access", detail: "x".repeat(1001) }, { type: "erasure", unknown: true }]) {
      const invalid = await createRequest(active, confirmation, body);
      expect(invalid.status, JSON.stringify(body)).toBe(400);
      expect(await readJson(invalid)).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(await active.runtime.dataRequests.repository.listAll()).toEqual([]);
  });

  it("rate limits the creations to 5 per hour and IP (429)", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await createRequest(active, confirmation, { type: "access", website: "bot" })).status).toBe(201);
    }
    const limited = await createRequest(active, confirmation, { type: "access" });
    expect(limited.status).toBe(429);
    expect(await readJson(limited)).toMatchObject({ code: "RATE_LIMITED" });
    expect(await active.runtime.dataRequests.repository.listAll()).toEqual([]);
  });

  it("works while the messaging flag is off and after the consent was withdrawn", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const confirmation = await submitQuote(active, seed);
    await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: false, reason: "messaging off for the data request test" }, superAdmin);
    const withdrawal = await active.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`, { method: "POST", headers: { "x-forwarded-for": "203.0.113.71" } });
    expect(withdrawal.status).toBe(200);

    const response = await createRequest(active, confirmation, { type: "erasure", detail: DETAIL });

    expect(response.status).toBe(201);
    expect(dataRequestCreateResultSchema.parse(await readJson(response))).toMatchObject({ type: "erasure", status: "received" });
  });

  it("runs the compliance workflow over HTTP: list, detail, take, complete, reject, with the pointer e-mail and the audit trail", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));
    const access = dataRequestCreateResultSchema.parse(await readJson(await createRequest(active, confirmation, { type: "access", detail: DETAIL })));
    const rectification = dataRequestCreateResultSchema.parse(await readJson(await createRequest(active, confirmation, { type: "rectification" })));

    const list = adminDataRequestListSchema.parse(await readJson(await admin(active, "/admin/data-requests", compliance)));
    expect(list.items.map((item) => item.reference).sort()).toEqual([access.reference, rectification.reference].sort());
    expect(list.items[0]).toMatchObject({ overdue: false });
    // The shared schema declares the quote reference and the e-mail language of the compliance list.
    expect(list.items[0]).toMatchObject({ quoteReference: confirmation.publicReference, locale: "fr" });
    expect((await readJson<{ items: unknown[] }>(await admin(active, "/admin/data-requests?type=access&status=received", superAdmin))).items).toHaveLength(1);
    const accessId = list.items.find((item) => item.reference === access.reference)!.id;
    const rectificationId = list.items.find((item) => item.reference === rectification.reference)!.id;

    const detail = adminDataRequestDetailSchema.parse(await readJson(await admin(active, `/admin/data-requests/${accessId}`, compliance)));
    expect(detail).toMatchObject({ status: "received", detail: DETAIL, publicReference: confirmation.publicReference });
    expect(detail.acknowledgedAt).toBeDefined();
    expect(detail.erasureAllowed).toBe(false);

    const taken = await admin(active, `/admin/data-requests/${accessId}/take`, compliance, "POST", {});
    expect(taken.status).toBe(200);
    expect(adminDataRequestDetailSchema.parse(await readJson(taken))).toMatchObject({ status: "in_review", reviewedById: "compliance-dr" });
    const again = await admin(active, `/admin/data-requests/${accessId}/take`, compliance, "POST", {});
    expect(again.status).toBe(409);
    expect(await readJson(again)).toMatchObject({ code: "DATA_REQUEST_INVALID_TRANSITION" });

    const noNote = await admin(active, `/admin/data-requests/${rectificationId}/reject`, compliance, "POST", {});
    expect(noNote.status).toBe(400);
    const rejected = await admin(active, `/admin/data-requests/${rectificationId}/reject`, compliance, "POST", { note: "Identite du demandeur non verifiable" });
    expect(rejected.status).toBe(200);
    expect(adminDataRequestDetailSchema.parse(await readJson(rejected))).toMatchObject({ status: "rejected", decisionNote: "Identite du demandeur non verifiable" });
    const completed = await admin(active, `/admin/data-requests/${accessId}/complete`, superAdmin, "POST", { note: "Export remis par courrier" });
    expect(completed.status).toBe(200);
    expect(adminDataRequestDetailSchema.parse(await readJson(completed))).toMatchObject({ status: "completed", decidedById: "super-dr" });
    expect((await admin(active, `/admin/data-requests/${accessId}/complete`, compliance, "POST", {})).status).toBe(409);

    const closures = (await active.runtime.notifications.service.list()).filter((notification) => notification.type === "visitor_data_request_closed");
    expect(closures).toHaveLength(2);
    expect(JSON.stringify(closures)).not.toMatch(/courrier|verifiable/);
    const visitor = visitorDataRequestListSchema.parse(await readJson(await active.request(visitorPath(confirmation, confirmation.verificationToken))));
    expect(visitor.items.map((item) => item.status).sort()).toEqual(["completed", "rejected"]);
    expect(JSON.stringify(visitor)).not.toMatch(/courrier|verifiable/);
    for (const action of [DataRequestAuditActions.taken, DataRequestAuditActions.completed, DataRequestAuditActions.rejected]) {
      expect(active.runtime.audit.writer.search({ action }), action).toHaveLength(1);
    }
    expect(JSON.stringify(active.runtime.audit.writer.all())).not.toMatch(/Kouassi|courrier|verifiable/);
    expect((await admin(active, `/admin/data-requests/${crypto.randomUUID()}`, compliance)).status).toBe(404);
    expect((await admin(active, "/admin/data-requests/not-a-uuid", compliance)).status).toBe(400);
  });

  it("start-erasure creates ONLY the spec 046 preview: nothing is anonymized, nothing is executed, the batch is linked", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));
    const [quote] = await active.runtime.quoteRequests.submissions.list();
    if (!quote) throw new Error("quote request missing");
    const { repository, message } = await seedConversation(active, quote.id);
    await createRequest(active, confirmation, { type: "erasure", detail: DETAIL });
    const requestId = (await active.runtime.dataRequests.repository.listAll())[0]!.id;
    const payloadBefore = JSON.stringify(quote.payload);

    const started = await admin(active, `/admin/data-requests/${requestId}/start-erasure`, compliance, "POST", {});

    expect(started.status).toBe(200);
    const view = adminDataRequestDetailSchema.parse(await readJson(started));
    expect(view).toMatchObject({ status: "in_review", reviewedById: "compliance-dr" });
    expect(view.erasureBatchId).toBeDefined();
    expect(view.history.map((entry) => entry.action)).toEqual(["created", "taken", "erasure_started"]);
    const batch = retentionBatchSchema.parse(await readJson(await admin(active, `/admin/retention/batches/${view.erasureBatchId}`, compliance)));
    expect(batch).toMatchObject({ kind: "erasure", status: "previewed", erasureLookup: "public_reference", approvedAt: null, executedAt: null });
    expect(Object.fromEntries(batch.counts.map((count) => [count.subject, count.selected]))).toMatchObject({ quote_requests: 1, lead_message_threads: 1, data_requests: 1 });
    expect(batch.counts.every((count) => count.anonymized === 0)).toBe(true);
    expect(JSON.stringify(batch)).not.toContain(confirmation.publicReference);

    // Nothing was anonymized, erased or executed.
    const stored = await active.runtime.quoteRequests.submissions.findById(quote.id);
    expect(stored?.anonymizedAt).toBeUndefined();
    expect(JSON.stringify(stored?.payload)).toBe(payloadBefore);
    expect((await repository.listForQuote(quote.id))[0]).toMatchObject({ id: message.id, body: MESSAGE_BODY });
    expect((await active.runtime.dataRequests.repository.find(requestId))?.detail).toBe(DETAIL);
    const batches = retentionBatchListResponseSchema.parse(await readJson(await admin(active, "/admin/retention/batches", compliance)));
    expect(batches.items.map((item) => item.status)).toEqual(["previewed"]);
    expect(active.runtime.audit.writer.search({ action: DataRetentionAuditActions.batchApproved })).toEqual([]);
    expect(active.runtime.audit.writer.search({ action: DataRetentionAuditActions.batchExecuted })).toEqual([]);
    expect(active.runtime.audit.writer.search({ action: DataRequestAuditActions.erasureStarted })).toHaveLength(1);
    expect(active.runtime.audit.writer.search({ action: DataRetentionAuditActions.batchPreviewed })).toHaveLength(1);
    // The approval stays a separate, explicit decision, and the purge flag is still off.
    const approval = await admin(active, `/admin/retention/batches/${batch.id}/approve`, compliance, "POST", { reason: "Validation conformite" });
    expect(approval.status).toBe(422);
    expect((await active.runtime.quoteRequests.submissions.findById(quote.id))?.anonymizedAt).toBeUndefined();
    // Only an erasure request can start a preview.
    await createRequest(active, confirmation, { type: "access" });
    const accessId = (await active.runtime.dataRequests.repository.listAll()).find((record) => record.type === "access")!.id;
    expect((await admin(active, `/admin/data-requests/${accessId}/start-erasure`, compliance, "POST", {})).status).toBe(409);
  });

  it("anonymizes the free text of the conversation and of the data requests when an approved erasure batch runs, keeping the proof", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));
    const [quote] = await active.runtime.quoteRequests.submissions.list();
    if (!quote) throw new Error("quote request missing");
    const { repository } = await seedConversation(active, quote.id);
    const created = dataRequestCreateResultSchema.parse(await readJson(await createRequest(active, confirmation, { type: "erasure", detail: DETAIL })));
    const requestId = (await active.runtime.dataRequests.repository.listAll())[0]!.id;
    const view = adminDataRequestDetailSchema.parse(await readJson(await admin(active, `/admin/data-requests/${requestId}/start-erasure`, compliance, "POST", {})));
    await active.runtime.featureFlags.service.applyCompliancePolicy({ key: "retention_purge_enabled", scopeType: "global", value: true, reason: "data request erasure test" }, superAdmin, { reference: "TEST-DATA-REQUEST-062", approvedBy: "compliance" });

    const approved = await admin(active, `/admin/retention/batches/${view.erasureBatchId}/approve`, compliance, "POST", { reason: "Demande verifiee par la conformite" });

    expect(approved.status).toBe(200);
    expect(retentionBatchSchema.parse(await readJson(approved))).toMatchObject({ status: "executed" });
    const [message] = await repository.listForQuote(quote.id);
    expect(message?.body).toBe("[anonymise]");
    const stored = await active.runtime.dataRequests.repository.find(requestId);
    expect(stored).toMatchObject({ reference: created.reference, type: "erasure", status: "in_review", detail: "[anonymise]", erasureBatchId: view.erasureBatchId });
    expect(stored?.anonymizedAt).toBeDefined();
    // The request itself is not closed by the batch: the compliance admin completes it explicitly.
    const detail = adminDataRequestDetailSchema.parse(await readJson(await admin(active, `/admin/data-requests/${requestId}`, compliance)));
    expect(detail).toMatchObject({ status: "in_review", detail: "[anonymise]" });
    expect((await admin(active, `/admin/data-requests/${requestId}/complete`, compliance, "POST", { note: "Effacement execute" })).status).toBe(200);
  });

  it("gives the support role the minimal fields and no action; every other role and a missing session are refused and audited", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const confirmation = await submitQuote(active, seed);
    const created = dataRequestCreateResultSchema.parse(await readJson(await createRequest(active, confirmation, { type: "erasure", detail: DETAIL })));
    const requestId = (await active.runtime.dataRequests.repository.listAll())[0]!.id;

    const list = await admin(active, "/admin/data-requests", support);
    expect(list.status).toBe(200);
    const listText = await list.text();
    expect(adminDataRequestListSchema.parse(JSON.parse(listText)).items[0]).toMatchObject({ reference: created.reference, type: "erasure", status: "received" });
    const detail = await admin(active, `/admin/data-requests/${requestId}`, support);
    expect(detail.status).toBe(200);
    const detailText = await detail.text();
    expect(Object.keys(JSON.parse(detailText) as object).sort()).toEqual(["createdAt", "dueAt", "history", "id", "overdue", "reference", "status", "type"]);
    expect(listText + detailText).not.toMatch(/Kouassi|decisionNote|quoteRequestId|publicReference|quoteReference|locale/);
    for (const action of ["take", "complete", "reject", "start-erasure"]) {
      expect((await admin(active, `/admin/data-requests/${requestId}/${action}`, support, "POST", { note: "non" })).status, action).toBe(403);
    }
    expect((await active.runtime.dataRequests.repository.find(requestId))?.status).toBe("received");

    const refused: ActorContext[] = [
      { actorId: "pays-dr", roles: ["admin_pays"], mfaVerified: true },
      { actorId: "finance-dr", roles: ["finance_admin"], mfaVerified: true },
      { actorId: "content-dr", roles: ["content_admin"], mfaVerified: true },
      { actorId: "broker-dr", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: seed.partner.id, partnerPlan: "pro" }
    ];
    for (const actor of refused) {
      expect((await admin(active, "/admin/data-requests", actor)).status, actor.actorId).toBe(403);
      expect((await admin(active, `/admin/data-requests/${requestId}`, actor)).status, actor.actorId).toBe(403);
      expect((await admin(active, `/admin/data-requests/${requestId}/complete`, actor, "POST", {})).status, actor.actorId).toBe(403);
      // The audited access check runs before the identifier is parsed.
      expect((await admin(active, "/admin/data-requests/not-a-uuid/take", actor, "POST", {})).status, actor.actorId).toBe(403);
    }
    const refusals = active.runtime.audit.writer.search({ action: DataRequestAuditActions.refused, result: "refused" });
    expect(refusals.length).toBeGreaterThanOrEqual(4 + refused.length * 4);
    for (const actor of refused) expect(refusals.some((entry) => entry.actorId === actor.actorId && entry.reason === "forbidden_role"), actor.actorId).toBe(true);
    expect((await active.request("/admin/data-requests")).status).toBe(401);
    expect((await active.request(`/admin/data-requests/${requestId}/take`, { method: "POST", headers: json, body: "{}" })).status).toBe(401);
    // A session without MFA never reaches the service.
    const noMfa: ActorContext = { actorId: "compliance-nomfa", roles: ["compliance_admin"], mfaVerified: false };
    expect((await admin(active, "/admin/data-requests", noMfa)).status).toBe(403);
    expect((await admin(active, `/admin/data-requests/${requestId}/take`, noMfa, "POST", {})).status).toBe(403);
    expect((await active.runtime.dataRequests.repository.find(requestId))?.status).toBe("received");
  });

  it("exposes every data request route: the visitor routes answer the neutral 404, the admin routes need a session", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const id = "00000000-0000-4000-8000-000000000099";

    for (const method of ["GET", "POST"]) {
      const response = await active.request("/quote-requests/QR-UNKNOWN/data-requests?token=nope", { method, ...(method === "POST" ? { headers: json, body: JSON.stringify({ type: "access" }) } : {}) });
      expect(response.status, method).toBe(404);
      expect(await response.json(), method).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
    }
    const routes: Array<[string, string]> = [
      ["GET", "/admin/data-requests"],
      ["GET", `/admin/data-requests/${id}`],
      ["POST", `/admin/data-requests/${id}/take`],
      ["POST", `/admin/data-requests/${id}/complete`],
      ["POST", `/admin/data-requests/${id}/reject`],
      ["POST", `/admin/data-requests/${id}/start-erasure`]
    ];
    for (const [method, path] of routes) {
      const response = await active.request(path, { method, ...(method === "POST" ? { headers: json, body: "{}" } : {}) });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it("shows the provisional durations of the three new categories in the retention policies", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;

    const policies = retentionPoliciesResponseSchema.parse(await readJson(await admin(active, "/admin/retention/policies", compliance)));

    expect(Object.fromEntries(policies.items.filter((item) => ["lead_message_threads", "lead_document_requests", "data_requests"].includes(item.category)).map((item) => [item.category, [item.retentionDays, item.source]])))
      .toEqual({ lead_message_threads: [730, "default"], lead_document_requests: [180, "default"], data_requests: [1825, "default"] });
  });

  it("lets only one of two concurrent creations of the same type through: the other gets DATA_REQUEST_ALREADY_OPEN with the reference of the winner", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const confirmation = await submitQuote(active, await seedPublicRuntime(active.runtime));

    const responses = await Promise.all(Array.from({ length: 4 }, () => createRequest(active, confirmation, { type: "erasure", detail: DETAIL })));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    const created = dataRequestCreateResultSchema.parse(await readJson(responses.find((response) => response.status === 201)!));
    for (const refused of responses.filter((response) => response.status === 409)) {
      expect(await refused.json()).toMatchObject({ code: "DATA_REQUEST_ALREADY_OPEN", reference: created.reference });
    }
    expect(await active.runtime.dataRequests.repository.listAll()).toHaveLength(1);
    // One acknowledgement and one alert, whatever the number of attempts.
    expect((await active.runtime.notifications.service.list()).filter((notification) => notification.type === "visitor_data_request_acknowledged")).toHaveLength(1);
    expect((await active.runtime.adminAlerts.list(compliance, {})).items.filter((alert) => alert.type === "data_request_received")).toHaveLength(1);
  });
});
