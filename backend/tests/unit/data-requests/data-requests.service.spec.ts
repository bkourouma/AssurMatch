import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DATA_REQUEST_REFERENCE_PATTERN, adminDataRequestDetailSchema, adminDataRequestListSchema, dataRequestCreateResultSchema, visitorDataRequestListSchema } from "../../../../packages/shared/contracts/data-requests";
import type { RetentionBatch } from "../../../../packages/shared/contracts/data-retention.contracts";
import { DataRequestAuditActions } from "../../../src/modules/audit-logs/data-request-audit-actions";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PublicAbuseGuardService } from "../../../src/modules/common/abuse/public-abuse-guard.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { DataRequestsModule } from "../../../src/modules/data-requests/data-requests.module";
import type { DataRequestNotificationsPort, MessagingQuote } from "../../../src/modules/lead-messaging/lead-messaging.ports";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-10-01T09:00:00.000Z");
const QUOTE: MessagingQuote = { id: "00000000-0000-4000-8000-0000000000a1", publicReference: "AM-000001", status: "routed", language: "en" };
const OTHER_QUOTE: MessagingQuote = { id: "00000000-0000-4000-8000-0000000000a2", publicReference: "AM-000002", status: "routed" };
const TOKENS: Record<string, string> = { "AM-000001": "token-one", "AM-000002": "token-two" };
const DETAIL = "Je suis Ama Kouassi, mon numero est 0102030405, merci de supprimer mes donnees";

const compliance: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true };
const superAdmin: ActorContext = { actorId: "super-1", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support-1", roles: ["support_admin"], mfaVerified: true };

function world() {
  const audit = new AuditLogWriter();
  const redis = new InMemoryRedisClient();
  const clock = { now: START };
  const quotes = new Map<string, MessagingQuote>([[QUOTE.id, QUOTE], [OTHER_QUOTE.id, OTHER_QUOTE]]);
  const sent = {
    acknowledgements: [] as Array<{ quote: unknown; event: Record<string, unknown> }>,
    closures: [] as Array<{ quote: unknown; event: Record<string, unknown> }>,
    alerts: [] as Array<Record<string, unknown>>
  };
  const notifications: DataRequestNotificationsPort = {
    queueVisitorAcknowledgement: async (quote, event) => { sent.acknowledgements.push({ quote, event }); },
    queueVisitorClosure: async (quote, event) => { sent.closures.push({ quote, event }); },
    queueComplianceAlert: async (event) => { sent.alerts.push(event); }
  };
  const batches: RetentionBatch[] = [];
  const retention = {
    previewErasure: vi.fn(async (input: { publicReference?: string; email?: string; reason: string }, actor: ActorContext) => {
      const batch = {
        id: crypto.randomUUID(),
        kind: "erasure",
        status: "previewed",
        countryId: null,
        categories: [],
        erasureLookup: "public_reference",
        reason: input.reason,
        requestedById: actor.actorId ?? null,
        approvedById: null,
        approvalReason: null,
        counts: [],
        totalSelected: 0,
        moreRemaining: false,
        previewExpiresAt: new Date(clock.now.getTime() + DAY_MS).toISOString(),
        approvedAt: null,
        executedAt: null,
        createdAt: clock.now.toISOString()
      } as RetentionBatch;
      batches.push(batch);
      return batch;
    }),
    getBatch: vi.fn(async (id: string) => {
      const batch = batches.find((candidate) => candidate.id === id);
      if (!batch) throw new Error("batch not found");
      return batch;
    })
  };
  const module = new DataRequestsModule({
    audit,
    quotes: { findById: async (id) => quotes.get(id) },
    visitorAccess: { verify: async (reference, token) => {
      const quote = [...quotes.values()].find((candidate) => candidate.publicReference === reference);
      return quote && TOKENS[reference] === token ? { quote } : undefined;
    } },
    abuseGuard: new PublicAbuseGuardService(redis),
    redis,
    notifications,
    retention,
    now: () => clock.now
  });
  return { audit, redis, clock, quotes, sent, retention, batches, module, service: module.service, repository: module.repository };
}

type World = ReturnType<typeof world>;

function create(active: World, input: unknown, options: { reference?: string; token?: string; ip?: string } = {}) {
  const reference = options.reference ?? "AM-000001";
  return active.service.create(reference, options.token ?? TOKENS[reference] ?? "", input, { ipAddress: options.ip ?? "203.0.113.10" });
}

async function openRequest(active: World, type: "access" | "rectification" | "erasure" = "erasure", detail = DETAIL) {
  const result = await create(active, { type, detail });
  const [record] = (await active.repository.listForQuote(QUOTE.id)).filter((candidate) => candidate.reference === result.reference);
  if (!record) throw new Error("request not stored");
  return record;
}

describe("data requests service (spec 062 D-10)", () => {
  describe("visitor creation", () => {
    it("records the request, acknowledges it by e-mail once and alerts the compliance team", async () => {
      const active = world();

      const result = await create(active, { type: "erasure", detail: DETAIL });

      expect(dataRequestCreateResultSchema.parse(result)).toEqual({ reference: result.reference, type: "erasure", status: "received", acknowledgedByEmail: true });
      expect(result.reference).toMatch(DATA_REQUEST_REFERENCE_PATTERN);
      const [record] = await active.repository.listForQuote(QUOTE.id);
      expect(record).toMatchObject({ reference: result.reference, type: "erasure", status: "received", detail: DETAIL, locale: "en", quoteRequestId: QUOTE.id });
      expect(record?.dueAt.getTime()).toBe(START.getTime() + 30 * DAY_MS);
      expect(record?.acknowledgedAt).toBeDefined();
      expect(active.sent.acknowledgements).toHaveLength(1);
      expect(active.sent.acknowledgements[0]).toMatchObject({
        quote: { id: QUOTE.id, publicReference: "AM-000001" },
        event: { dataRequestId: record?.id, reference: result.reference, requestType: "erasure", dueAt: new Date(START.getTime() + 30 * DAY_MS).toISOString() }
      });
      expect(active.sent.alerts).toEqual([{ dataRequestId: record?.id, reference: result.reference, requestType: "erasure" }]);
      // The detail text reaches neither a notification payload nor the audit trail.
      expect(JSON.stringify(active.sent)).not.toContain("Kouassi");
      const created = active.audit.search({ action: DataRequestAuditActions.created });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ targetId: record?.id, result: "success", context: { reference: result.reference, type: "erasure", hasDetail: true } });
      expect(JSON.stringify(active.audit.all())).not.toContain("Kouassi");
      expect(JSON.stringify(active.audit.all())).not.toContain("0102030405");
    });

    it("generates distinct references from the unambiguous alphabet", async () => {
      const active = world();
      const references = new Set<string>();
      for (const type of ["access", "rectification", "erasure"] as const) references.add((await create(active, { type }, { ip: `203.0.113.${references.size + 20}` })).reference);
      expect(references.size).toBe(3);
      for (const reference of references) expect(reference).toMatch(/^DR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it("lists only the requests of the visitor's own quote request", async () => {
      const active = world();
      const mine = await create(active, { type: "access" });
      await create(active, { type: "access" }, { reference: "AM-000002", ip: "203.0.113.11" });

      const list = visitorDataRequestListSchema.parse(await active.service.listForVisitor("AM-000001", "token-one"));

      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({ reference: mine.reference, type: "access", status: "received" });
      expect(Object.keys(list.items[0] ?? {}).sort()).toEqual(["createdAt", "dueAt", "reference", "status", "type"]);
    });

    it("answers the neutral 404 to a missing, wrong, expired or foreign token and writes nothing", async () => {
      const active = world();

      for (const attempt of [
        { reference: "AM-000001", token: "" },
        { reference: "AM-000001", token: "wrong" },
        { reference: "AM-000001", token: TOKENS["AM-000002"] ?? "" },
        { reference: "AM-UNKNOWN", token: "token-one" }
      ]) {
        const error = await create(active, { type: "access" }, attempt).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
        await expect(active.service.listForVisitor(attempt.reference, attempt.token ?? "")).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(await active.repository.listAll()).toEqual([]);
      expect(active.sent.acknowledgements).toEqual([]);
    });

    it("refuses a second open request of the same type with its reference, but accepts another type or a new one once closed", async () => {
      const active = world();
      const first = await create(active, { type: "access" });

      const error = await create(active, { type: "access" }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: "DATA_REQUEST_ALREADY_OPEN", reference: first.reference });
      expect((await create(active, { type: "rectification" })).reference).not.toBe(first.reference);
      const [record] = (await active.repository.listForQuote(QUOTE.id)).filter((candidate) => candidate.reference === first.reference);
      await active.service.complete(compliance, record?.id ?? "", {});
      expect((await create(active, { type: "access" })).reference).not.toBe(first.reference);
      // Another quote request is unaffected.
      expect((await create(active, { type: "access" }, { reference: "AM-000002" })).reference).toMatch(DATA_REQUEST_REFERENCE_PATTERN);
    });

    it("answers two concurrent creations of the same type with the same refusal (the database index lets only one through)", async () => {
      const active = world();
      const first = await create(active, { type: "erasure", detail: DETAIL });
      // The second creation passed the application check (it read no open request) but loses on the unique index.
      const findOpen = vi.spyOn(active.repository, "findOpen");
      findOpen.mockResolvedValueOnce(undefined);

      const error = await create(active, { type: "erasure", detail: DETAIL }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: "DATA_REQUEST_ALREADY_OPEN", reference: first.reference });
      expect(await active.repository.listForQuote(QUOTE.id)).toHaveLength(1);
      // Refused like a sequential duplicate: audited, no second acknowledgement, no second alert.
      expect(active.audit.search({ action: DataRequestAuditActions.refused }).map((entry) => entry.reason)).toEqual(["already_open"]);
      expect(active.sent.acknowledgements).toHaveLength(1);
      expect(active.sent.alerts).toHaveLength(1);
    });

    it("answers a filled honeypot with a believable success and writes and sends nothing", async () => {
      const active = world();

      const result = await create(active, { type: "erasure", detail: "x", website: "https://spam.example" });

      expect(result).toMatchObject({ type: "erasure", status: "received", acknowledgedByEmail: true });
      expect(result.reference).toMatch(DATA_REQUEST_REFERENCE_PATTERN);
      expect(await active.repository.listAll()).toEqual([]);
      expect(active.sent).toEqual({ acknowledgements: [], closures: [], alerts: [] });
      expect(active.audit.search({ action: DataRequestAuditActions.created })).toEqual([]);
    });

    it("limits creations to 5 per hour and IP, and 3 per hour and quote request", async () => {
      const byIp = world();
      for (let index = 0; index < 5; index += 1) {
        // Honeypot answers count against the limit but never reach the per-quote one.
        await create(byIp, { type: "access", website: "bot" }, { ip: "198.51.100.1" });
      }
      await expect(create(byIp, { type: "access" }, { ip: "198.51.100.1" })).rejects.toThrow(/Rate limit exceeded/);
      // Another address is not limited.
      await expect(create(byIp, { type: "access" }, { ip: "198.51.100.2" })).resolves.toMatchObject({ status: "received" });

      // Only recorded requests count: a refused duplicate costs nothing, a fourth recording is refused.
      const byQuote = world();
      for (const type of ["access", "rectification", "erasure"] as const) await create(byQuote, { type }, { ip: `198.51.100.${type.length}` });
      await expect(create(byQuote, { type: "access" }, { ip: "198.51.100.98" })).rejects.toBeInstanceOf(ConflictException);
      const [first] = await byQuote.repository.listAll();
      await byQuote.service.complete(compliance, first?.id ?? "", {});
      await expect(create(byQuote, { type: first?.type ?? "access" }, { ip: "198.51.100.99" })).rejects.toThrow(/Rate limit exceeded/);
      expect(await byQuote.repository.listAll()).toHaveLength(3);
    });

    it("validates the body", async () => {
      const active = world();
      for (const [index, body] of [{}, { type: "delete" }, { type: "access", detail: "x".repeat(1001) }, { type: "access", extra: true }, { type: 7 }].entries()) {
        await expect(create(active, body, { ip: `203.0.113.${100 + index}` }), JSON.stringify(body)).rejects.toMatchObject({ status: 400 });
      }
      expect(await active.repository.listAll()).toEqual([]);
      // An empty detail is the same as none.
      await create(active, { type: "access", detail: "   " }, { ip: "203.0.113.200" });
      expect((await active.repository.listAll())[0]?.detail).toBeUndefined();
    });

    it("still records the request when the acknowledgement or the alert fails", async () => {
      const active = world();
      const failing = new DataRequestsModule({
        audit: active.audit,
        repository: active.repository,
        quotes: { findById: async () => QUOTE },
        visitorAccess: { verify: async () => ({ quote: QUOTE }) },
        retention: active.retention,
        notifications: {
          queueVisitorAcknowledgement: async () => { throw new Error("mail down"); },
          queueVisitorClosure: async () => { throw new Error("mail down"); },
          queueComplianceAlert: async () => { throw new Error("alerts down"); }
        }
      });

      const result = await failing.service.create("AM-000001", "any", { type: "access" });

      expect(result.status).toBe("received");
      const [record] = await active.repository.listAll();
      expect(record?.acknowledgedAt).toBeUndefined();
    });
  });

  describe("compliance workflow", () => {
    it("takes a received request, then completes it; the visitor gets a pointer e-mail without the note", async () => {
      const active = world();
      const record = await openRequest(active, "access");
      active.clock.now = new Date(START.getTime() + DAY_MS);

      const taken = adminDataRequestDetailSchema.parse(await active.service.take(compliance, record.id));
      expect(taken).toMatchObject({ status: "in_review", reviewedById: "compliance-1", detail: DETAIL, publicReference: "AM-000001" });
      expect(taken.reviewedAt).toBe(active.clock.now.toISOString());

      const done = adminDataRequestDetailSchema.parse(await active.service.complete(superAdmin, record.id, { note: "Export envoye par courrier securise" }));
      expect(done).toMatchObject({ status: "completed", decidedById: "super-1", decisionNote: "Export envoye par courrier securise" });
      expect(done.history.map((entry) => entry.action)).toEqual(["created", "taken", "completed"]);
      expect(active.sent.closures).toEqual([{ quote: { id: QUOTE.id, publicReference: "AM-000001" }, event: { dataRequestId: record.id, reference: record.reference } }]);
      expect(JSON.stringify(active.sent.closures)).not.toContain("courrier");
      expect(active.audit.search({ action: DataRequestAuditActions.taken })).toHaveLength(1);
      expect(active.audit.search({ action: DataRequestAuditActions.completed })).toHaveLength(1);
      expect(JSON.stringify(active.audit.all())).not.toContain("courrier");
      // The visitor sees the status and the closing date, never the note.
      const visitor = await active.service.listForVisitor("AM-000001", "token-one");
      expect(visitor.items[0]).toMatchObject({ reference: record.reference, status: "completed", closedAt: active.clock.now.toISOString() });
      expect(JSON.stringify(visitor)).not.toContain("courrier");
    });

    it("completes straight from received, and rejects only with a note", async () => {
      const active = world();
      const access = await openRequest(active, "access");
      const rectification = await openRequest(active, "rectification");

      await expect(active.service.reject(compliance, rectification.id, {})).rejects.toMatchObject({ status: 400 });
      await expect(active.service.reject(compliance, rectification.id, { note: "   " })).rejects.toMatchObject({ status: 400 });
      expect((await active.repository.find(rectification.id))?.status).toBe("received");
      expect(active.sent.closures).toEqual([]);

      expect(await active.service.complete(compliance, access.id, {})).toMatchObject({ status: "completed" });
      const rejected = await active.service.reject(compliance, rectification.id, { note: "Identite non verifiable" });
      expect(rejected).toMatchObject({ status: "rejected", decisionNote: "Identite non verifiable" });
      expect(active.sent.closures).toHaveLength(2);
      expect(JSON.stringify(active.sent.closures)).not.toContain("Identite");
    });

    it("refuses invalid transitions with a 409 DATA_REQUEST_INVALID_TRANSITION and audits them", async () => {
      const active = world();
      const record = await openRequest(active, "access");
      await active.service.take(compliance, record.id);
      const closed = await openRequest(active, "rectification");
      await active.service.complete(compliance, closed.id, {});

      const attempts = [
        () => active.service.take(compliance, record.id),
        () => active.service.take(compliance, closed.id),
        () => active.service.complete(compliance, closed.id, {}),
        () => active.service.reject(compliance, closed.id, { note: "trop tard" }),
        () => active.service.startErasure(compliance, record.id)
      ];
      for (const attempt of attempts) {
        const error = await attempt().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({ code: "DATA_REQUEST_INVALID_TRANSITION" });
      }
      expect(active.audit.search({ action: DataRequestAuditActions.refused, result: "refused" }).length).toBeGreaterThanOrEqual(attempts.length);
      expect((await active.repository.find(closed.id))?.status).toBe("completed");
      await expect(active.service.get(compliance, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });

    it("start-erasure only creates the spec 046 preview, links it and moves the request to in_review", async () => {
      const active = world();
      const record = await openRequest(active, "erasure");

      const view = adminDataRequestDetailSchema.parse(await active.service.startErasure(compliance, record.id));

      expect(active.retention.previewErasure).toHaveBeenCalledTimes(1);
      expect(active.retention.previewErasure.mock.calls[0]?.[0]).toMatchObject({ publicReference: "AM-000001" });
      expect(active.retention.previewErasure.mock.calls[0]?.[0].reason).not.toMatch(/Kouassi|0102030405|DR-/);
      expect(active.retention.previewErasure.mock.calls[0]?.[1]).toMatchObject({ actorId: "compliance-1" });
      expect(view).toMatchObject({ status: "in_review", erasureBatchId: active.batches[0]?.id, reviewedById: "compliance-1" });
      expect(view.history.map((entry) => entry.action)).toEqual(["created", "taken", "erasure_started"]);
      // Nothing else happened: no closure e-mail, still open.
      expect(active.sent.closures).toEqual([]);
      expect(active.audit.search({ action: DataRequestAuditActions.erasureStarted })).toHaveLength(1);
      expect(JSON.stringify(active.audit.all())).not.toContain("Kouassi");
      // A request already in review can start (a new) preview, e.g. after the previous one expired.
      const again = await active.service.startErasure(compliance, record.id);
      expect(again.erasureBatchId).toBe(active.batches[1]?.id);
      expect(again.status).toBe("in_review");
    });

    it("start-erasure refuses a request that is not an erasure request or is already closed", async () => {
      const active = world();
      const access = await openRequest(active, "access");
      const erasure = await openRequest(active, "erasure");
      await active.service.reject(compliance, erasure.id, { note: "Demande retiree" });

      await expect(active.service.startErasure(compliance, access.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(active.service.startErasure(compliance, erasure.id)).rejects.toBeInstanceOf(ConflictException);
      expect(active.retention.previewErasure).not.toHaveBeenCalled();
    });
  });

  describe("queue, roles and MFA", () => {
    it("lists newest first with filters, an overdue flag and a cursor", async () => {
      const active = world();
      const ids: string[] = [];
      for (const [index, type] of (["access", "rectification", "erasure"] as const).entries()) {
        active.clock.now = new Date(START.getTime() + index * DAY_MS);
        ids.push((await openRequest(active, type)).id);
      }
      active.clock.now = new Date(START.getTime() + 31 * DAY_MS + 1);

      const firstPage = adminDataRequestListSchema.parse(await active.service.list(compliance, { limit: "2" }));
      expect(firstPage.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
      expect(firstPage.nextCursor).toBeTruthy();
      const secondPage = adminDataRequestListSchema.parse(await active.service.list(compliance, { limit: "2", cursor: firstPage.nextCursor }));
      expect(secondPage.items.map((item) => item.id)).toEqual([ids[0]]);
      expect(secondPage.nextCursor).toBeNull();
      // Created on day 0, due on day 30: overdue; the latest ones (days 1 and 2) are due on days 31 and 32.
      expect(secondPage.items[0]?.overdue).toBe(true);
      expect(firstPage.items.map((item) => item.overdue)).toEqual([false, true]);
      expect((await active.service.list(compliance, { type: "access" })).items.map((item) => item.id)).toEqual([ids[0]]);
      await active.service.take(compliance, ids[1] ?? "");
      expect((await active.service.list(compliance, { status: "in_review" })).items.map((item) => item.id)).toEqual([ids[1]]);
      expect((await active.service.list(compliance, {})).items[0]).toMatchObject({ quoteReference: "AM-000001", locale: "en" });
      await expect(active.service.list(compliance, { status: "weird" })).rejects.toMatchObject({ status: 400 });
      await expect(active.service.list(compliance, { cursor: "not-a-cursor" })).rejects.toMatchObject({ status: 400 });
    });

    it("gives the support role the reference, type, status and deadline only, and no action", async () => {
      const active = world();
      const record = await openRequest(active, "erasure");

      const list = adminDataRequestListSchema.parse(await active.service.list(support, {}));
      expect(Object.keys(list.items[0] ?? {}).sort()).toEqual(["createdAt", "dueAt", "id", "overdue", "reference", "status", "type"]);
      const detail = await active.service.get(support, record.id);
      expect(Object.keys(detail).sort()).toEqual(["createdAt", "dueAt", "history", "id", "overdue", "reference", "status", "type"]);
      expect(JSON.stringify([list, detail])).not.toMatch(/Kouassi|AM-000001|quoteRequestId|decisionNote|locale/);

      for (const action of [
        () => active.service.take(support, record.id),
        () => active.service.complete(support, record.id, {}),
        () => active.service.reject(support, record.id, { note: "non" }),
        () => active.service.startErasure(support, record.id)
      ]) {
        await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect((await active.repository.find(record.id))?.status).toBe("received");
      expect(active.retention.previewErasure).not.toHaveBeenCalled();
      expect(active.audit.search({ action: DataRequestAuditActions.refused, result: "refused" }).filter((entry) => entry.reason === "forbidden_role")).toHaveLength(4);
    });

    it("refuses every other role and a session without MFA, with an audit entry each", async () => {
      const active = world();
      const record = await openRequest(active, "access");
      const refused: ActorContext[] = [
        { actorId: "pays", roles: ["admin_pays"], mfaVerified: true },
        { actorId: "finance", roles: ["finance_admin"], mfaVerified: true },
        { actorId: "content", roles: ["content_admin"], mfaVerified: true },
        { actorId: "ai", roles: ["ai_admin"], mfaVerified: true },
        { actorId: "broker", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: "tenant-1" },
        { actorId: "nobody", roles: [], mfaVerified: true }
      ];
      for (const actor of refused) {
        await expect(active.service.list(actor, {}), actor.actorId).rejects.toMatchObject({ status: 403 });
        await expect(active.service.get(actor, record.id), actor.actorId).rejects.toMatchObject({ status: 403 });
        await expect(active.service.take(actor, record.id), actor.actorId).rejects.toMatchObject({ status: 403 });
      }
      const noMfa = { actorId: "compliance-nomfa", roles: ["compliance_admin" as const], mfaVerified: false };
      const error = await active.service.list(noMfa, {}).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: "MFA_REQUIRED" });
      await expect(active.service.complete({ actorId: "compliance-nomfa", roles: ["compliance_admin"] }, record.id, {})).rejects.toBeInstanceOf(ForbiddenException);

      const entries = active.audit.search({ action: DataRequestAuditActions.refused, result: "refused" });
      expect(entries.length).toBe(refused.length * 3 + 2);
      expect(entries.filter((entry) => entry.reason === "mfa_required")).toHaveLength(2);
      expect((await active.repository.find(record.id))?.status).toBe("received");
    });

    it("audits the compliance read of a request detail", async () => {
      const active = world();
      const record = await openRequest(active, "access");

      await active.service.get(compliance, record.id);
      await active.service.get(support, record.id);

      expect(active.audit.search({ action: DataRequestAuditActions.adminViewed })).toHaveLength(1);
    });
  });

  describe("retention", () => {
    it("replaces the detail and the decision note, keeping reference, type, status and dates", async () => {
      const active = world();
      const record = await openRequest(active, "access");
      await active.service.complete(compliance, record.id, { note: "Dossier verifie" });
      const other = await openRequest(active, "rectification");
      active.clock.now = new Date(START.getTime() + 5 * DAY_MS);

      await active.service.anonymizeForQuote(QUOTE.id, "[anonymise]", active.clock.now);

      const stored = await active.repository.find(record.id);
      expect(stored).toMatchObject({ reference: record.reference, type: "access", status: "completed", detail: "[anonymise]", decisionNote: "[anonymise]" });
      expect(stored?.anonymizedAt).toEqual(active.clock.now);
      expect(stored?.createdAt).toEqual(record.createdAt);
      expect(stored?.dueAt).toEqual(record.dueAt);
      expect((await active.repository.find(other.id))?.detail).toBe("[anonymise]");
      // Another quote request is untouched.
      const foreign = await create(active, { type: "access", detail: "autre personne" }, { reference: "AM-000002", ip: "203.0.113.50" });
      await active.service.anonymizeForQuote(QUOTE.id, "[anonymise]", active.clock.now);
      expect((await active.repository.listForQuote(OTHER_QUOTE.id)).find((candidate) => candidate.reference === foreign.reference)?.detail).toBe("autre personne");
    });
  });
});
