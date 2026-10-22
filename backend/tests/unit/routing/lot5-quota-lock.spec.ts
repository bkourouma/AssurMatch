import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient, type RedisClientPort } from "../../../src/modules/common/redis/redis.module";
import { LeadsModule, type LeadsModuleRoutingOptions } from "../../../src/modules/leads/leads.module";
import type { RoutableQuoteRequest } from "../../../src/modules/leads/quote-routing.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { QuotaLock } from "../../../src/modules/routing/quota-lock";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import { RoutingLockTimeoutError, type RoutingLockPort } from "../../../src/modules/routing/routing-controls.ports";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";

async function setup(routingOptions: LeadsModuleRoutingOptions, brokers: Array<{ id: string; quotaMonthlyLeads: number }>) {
  const audit = new AuditLogWriter();
  const partners = new PartnersService(audit);
  const licenses = new PartnerLicensesService(audit);
  const countryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  for (const broker of brokers) {
    await partners.create({ id: broker.id, legalName: `Broker ${broker.id.slice(-2)}`, primaryEmail: `b${broker.id.slice(-2)}@broker.example`, primaryWhatsApp: "+2250102030405", status: "active", quotaMonthlyLeads: broker.quotaMonthlyLeads }, superAdminActor);
    await partners.authorizeCountry(broker.id, countryId, superAdminActor);
    await partners.authorizeProduct(broker.id, productId, superAdminActor);
    await licenses.create({ partnerTenantId: broker.id, licenseNumber: `LIC-${broker.id.slice(-2)}`, issuingAuthority: "Regulator", countryId, productIds: [productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
  }
  const module = new LeadsModule(partners, licenses, audit, undefined, {}, routingOptions);
  const quote = (): RoutableQuoteRequest => ({ id: crypto.randomUUID(), countryId, productId, consentRecordId: crypto.randomUUID(), status: "created", routingStatus: "not_started" });
  return { audit, module, quote };
}

/** No lock at all: what the routing did before lot 5. */
const noLock: RoutingLockPort = {
  withLock: (_keys, task) => task(),
  acquire: async () => async () => undefined
};

describe("Lot 5 - quota consumption lock (ROUTE-003)", () => {
  it("without a lock, concurrent submissions overrun a quota of 1 (the race the lock closes)", async () => {
    const { module, quote } = await setup({ lock: noLock }, [{ id: A, quotaMonthlyLeads: 1 }]);
    await Promise.all(Array.from({ length: 10 }, () => module.routing.route(quote(), superAdminActor)));
    expect((await module.assignments.list()).length).toBeGreaterThan(1);
  });

  it("10 parallel routings with a quota of 1 create exactly one assignment (in-process lock)", async () => {
    const { module, quote } = await setup({}, [{ id: A, quotaMonthlyLeads: 1 }]);
    const results = await Promise.all(Array.from({ length: 10 }, () => module.routing.route(quote(), superAdminActor)));
    expect(await module.assignments.list()).toHaveLength(1);
    expect(results.filter((result) => result.routingStatus === "assigned")).toHaveLength(1);
    expect(results.filter((result) => result.routingStatus === "no_broker_available")).toHaveLength(9);
    const decisions = await module.decisions.list();
    expect(decisions.filter((decision) => decision.result === "no_broker_available").every((decision) => decision.excludedCandidates.some((entry) => entry.reasons.includes("partner_quota_exhausted")))).toBe(true);
  });

  it("moves on to the next broker when the first one is exhausted under the lock (Redis-backed lock)", async () => {
    const { module, quote, audit } = await setup({ redis: new InMemoryRedisClient() }, [{ id: A, quotaMonthlyLeads: 1 }, { id: B, quotaMonthlyLeads: 2 }]);
    const results = await Promise.all(Array.from({ length: 10 }, () => module.routing.route(quote(), superAdminActor)));
    const assignments = await module.assignments.list();
    expect(assignments.filter((assignment) => assignment.partnerTenantId === A)).toHaveLength(1);
    expect(assignments.filter((assignment) => assignment.partnerTenantId === B)).toHaveLength(2);
    expect(results.filter((result) => result.routingStatus === "no_broker_available")).toHaveLength(7);
    expect(audit.search({ action: RoutingAuditActions.quotaLockTimeout })).toHaveLength(0);
  });

  it("parks the request for an admin and audits routing.quota_lock.timeout when the lock cannot be taken", async () => {
    const timeoutLock: RoutingLockPort = {
      withLock: () => Promise.reject(new RoutingLockTimeoutError(A)),
      acquire: () => Promise.reject(new RoutingLockTimeoutError(A))
    };
    const { module, quote, audit } = await setup({ lock: timeoutLock }, [{ id: A, quotaMonthlyLeads: 5 }]);
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result).toMatchObject({ routingStatus: "pending_manual_assignment", reasons: ["manual_assignment_required", "quota_lock_timeout"], assignments: [] });
    expect(await module.assignments.list()).toHaveLength(0);
    expect((await module.decisions.latestForQuote(routed.id))?.controlDetails?.parkedReasons).toEqual(["quota_lock_timeout"]);
    expect(audit.search({ action: RoutingAuditActions.quotaLockTimeout })[0]).toMatchObject({ result: "failed", reason: "quota_lock_timeout", scope: { partnerTenantId: A } });
    await expect(module.routing.assignManually(routed, A, superAdminActor, "admin")).rejects.toBeInstanceOf(RoutingLockTimeoutError);
    expect(audit.search({ action: RoutingAuditActions.quotaLockTimeout })).toHaveLength(2);
  });

  it("does not lock brokers without quota (quota 0 = unlimited)", async () => {
    const keys: string[][] = [];
    const spy: RoutingLockPort = { withLock: (_keys, task) => task(), acquire: async (taken) => { keys.push(taken); return async () => undefined; } };
    const { module, quote } = await setup({ lock: spy }, [{ id: A, quotaMonthlyLeads: 0 }, { id: B, quotaMonthlyLeads: 3 }]);
    await module.routing.route(quote(), superAdminActor);
    expect(keys).toEqual([[B]]);
  });

  it("serialises the admin manual assignment on the same quota", async () => {
    const { module, quote } = await setup({}, [{ id: A, quotaMonthlyLeads: 1 }]);
    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => module.routing.assignManually(quote(), A, superAdminActor, "admin")));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await module.assignments.list()).toHaveLength(1);
  });
});

describe("QuotaLock", () => {
  it("excludes concurrent holders of a key and releases in order", async () => {
    const lock = new QuotaLock();
    const events: string[] = [];
    await Promise.all([1, 2, 3].map((index) => lock.withLock(["k"], async () => {
      events.push(`start${index}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end${index}`);
    })));
    expect(events).toEqual(["start1", "end1", "start2", "end2", "start3", "end3"]);
  });

  it("takes keys in sorted order so opposite requests never deadlock", async () => {
    const lock = new QuotaLock(undefined, { timeoutMs: 1_000 });
    const results = await Promise.all([
      lock.withLock(["b", "a"], async () => "first"),
      lock.withLock(["a", "b", "a"], async () => "second")
    ]);
    expect(results).toEqual(["first", "second"]);
  });

  it("times out with RoutingLockTimeoutError, frees what it took, and the queue keeps moving", async () => {
    const lock = new QuotaLock(undefined, { timeoutMs: 20 });
    const releaseHolder = await lock.acquire(["busy"]);
    await expect(lock.acquire(["free", "busy"])).rejects.toBeInstanceOf(RoutingLockTimeoutError);
    // "free" was released after the failure.
    const releaseFree = await lock.acquire(["free"]);
    await releaseFree();
    await releaseHolder();
    const releaseAgain = await lock.acquire(["busy"]);
    await releaseAgain();
  });

  it("uses SET NX with an owner token, retries within the bound, and never deletes another owner's key", async () => {
    const redis = new InMemoryRedisClient();
    const lock = new QuotaLock(redis, { timeoutMs: 60, retryDelayMs: 5, ttlSeconds: 3, keyPrefix: "t:" });
    const release = await lock.acquire(["p1"]);
    const token = await redis.get("t:p1");
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    // Another instance holds the key after our TTL expired: our release must leave it alone.
    await redis.set("t:p1", "other-owner", 3);
    await release();
    expect(await redis.get("t:p1")).toBe("other-owner");
    // Held elsewhere: bounded retry then timeout.
    await expect(lock.acquire(["p1"])).rejects.toBeInstanceOf(RoutingLockTimeoutError);
    await redis.del("t:p1");
    const again = await lock.acquire(["p1"]);
    await again();
    expect(await redis.get("t:p1")).toBeNull();
  });

  it("fails closed when Redis errors (timeout, never an unprotected quota)", async () => {
    const broken = { setNx: async () => { throw new Error("redis down"); }, get: async () => null, del: async () => undefined } as unknown as RedisClientPort;
    const lock = new QuotaLock(broken, { timeoutMs: 20, retryDelayMs: 5 });
    await expect(lock.withLock(["x"], async () => "never")).rejects.toBeInstanceOf(RoutingLockTimeoutError);
  });
});
