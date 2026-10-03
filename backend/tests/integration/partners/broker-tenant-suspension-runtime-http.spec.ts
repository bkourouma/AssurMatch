import { ForbiddenException } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import * as wiring from "../../../src/modules/http-wiring/runtime-http-wiring.module";
import { PartnerTenantStatusService } from "../../../src/modules/partners/partner-tenant-status.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { createPartner, seedOnboardingRuntime, superAdmin } from "./partner-admin-http-helpers";

const BROKER_CONTROLLERS = ["BrokerStarterController", "BrokerCrmController", "BrokerDashboardController", "BrokerEnterpriseController", "BrokerNotificationsController", "BrokerBillingController", "BrokerOffersController", "BrokerAccountController", "BrokerLicensesController", "BrokerTeamController"] as const;

function brokerActor(partnerTenantId: string, overrides: Partial<ActorContext> = {}): ActorContext {
  return { actorId: `broker-${partnerTenantId.slice(0, 8)}`, roles: ["broker_owner_pro"], partnerTenantId, partnerPlan: "pro", mfaVerified: true, ...overrides };
}

describe("spec 051 R12 broker tenant guard", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps a suspended partner read-only and refuses its lead processing with PARTNER_SUSPENDED", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const broker = brokerActor(partner.id);
    const leadId = "00000000-0000-4000-8000-0000000051f1";

    // Warms the status cache while the partner is not suspended.
    const meBefore = await readJson<ActorContext>(await harness.request("/auth/me", { headers: actorHeaders(broker) }));
    expect(meBefore).toMatchObject({ partnerTenantStatus: "draft" });
    expect(meBefore.tenantReadOnly).toBeUndefined();
    const acceptBefore = await harness.request(`/broker/starter/leads/${leadId}/accept`, { method: "POST", headers: actorHeaders(broker) });
    expect(acceptBefore.status).not.toBe(403);
    const starter = brokerActor(partner.id, { roles: ["broker_owner_starter"], partnerPlan: "starter" });
    const reads: Array<[string, ActorContext]> = [["/broker/starter/leads", starter], ["/broker/notifications/preferences", broker], ["/broker/notifications/inbox", broker]];
    const readStatuses = await Promise.all(reads.map(async ([path, actor]) => (await harness!.request(path, { headers: actorHeaders(actor) })).status));
    expect(readStatuses).toEqual([200, 200, 200]);

    await harness.runtime.partners.service.changeStatus(partner.id, "suspended", "suspension pour controle", superAdmin);

    expect(await readJson<ActorContext>(await harness.request("/auth/me", { headers: actorHeaders(broker) }))).toMatchObject({ partnerTenantStatus: "suspended", tenantReadOnly: true });
    // Reads keep working.
    for (const [path, actor] of reads) expect((await harness.request(path, { headers: actorHeaders(actor) })).status, path).toBe(200);

    const writes: Array<[string, string, unknown]> = [
      ["POST", `/broker/starter/leads/${leadId}/accept`, undefined],
      ["POST", `/broker/crm/leads/${leadId}/status`, { status: "contacted" }],
      ["POST", `/broker/crm/leads/${leadId}/notes`, { body: "note" }],
      ["PUT", "/broker/notifications/preferences", {}],
      ["PUT", "/broker/enterprise/sla", { firstActionTargetMinutes: 30, reason: "objectif interne" }]
    ];
    for (const [method, path, body] of writes) {
      const response = await harness.request(path, { method, headers: { ...actorHeaders(broker), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      expect(response.status, path).toBe(403);
      expect(await response.json(), path).toMatchObject({ code: "PARTNER_SUSPENDED" });
    }
  });

  it("answers 401 to the users of a retired partner and refuses their login with a neutral message", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const user = await harness.runtime.users.service.create({ email: "owner-retired@courtier.example", displayName: "Owner Retired", roles: ["broker_owner_pro"], partnerTenantId: partner.id, scopes: { countryIds: [], productIds: [] } }, superAdmin);
    await harness.runtime.users.service.setPassword(user.id, await harness.runtime.auth.passwordHashing.hash("Correct horse battery 51"));
    const login = () => harness!.request("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "Correct horse battery 51" }) });
    expect((await login()).status).toBeLessThan(300);
    const broker = brokerActor(partner.id, { actorId: user.id });
    const meActive = await harness.request("/auth/me", { headers: actorHeaders(broker) });
    expect(meActive.status).toBe(200);
    // The portal header shows the user's name rather than its id.
    expect(await meActive.json()).toMatchObject({ actorId: user.id, displayName: "Owner Retired" });

    await harness.runtime.partners.service.changeStatus(partner.id, "retired", "resiliation du partenariat", superAdmin);

    const me = await harness.request("/auth/me", { headers: actorHeaders(broker) });
    expect(me.status).toBe(401);
    expect((await harness.request("/broker/notifications/inbox", { headers: actorHeaders(broker) })).status).toBe(401);
    const refused = await login();
    expect(refused.status).toBe(401);
    const body = await refused.json() as { message: string };
    expect(body.message).toBe("Account unavailable");
    expect(JSON.stringify(body)).not.toMatch(/retired|resili/i);
    expect(harness.runtime.audit.writer.search({ action: "user.login_failed", targetId: user.id }).at(-1)?.reason).toBe("partner_retired");
  });
});

describe("spec 051 R12 broker write route inventory", () => {
  const suspended: ActorContext = { actorId: "broker-suspended", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000051f2", partnerPlan: "enterprise", mfaVerified: true, partnerTenantStatus: "suspended", tenantReadOnly: true };
  const request = { headers: {}, assurMatchActor: suspended };
  // Any access to the runtime means the method reached its service before the tenant guard.
  const runtime = new Proxy({}, { get: () => { throw new Error("runtime reached before the tenant guard"); } });

  it("guards every non-GET broker route or lists it as allowed for a suspended partner", () => {
    const registry = wiring as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>;
    let guarded = 0;
    for (const name of BROKER_CONTROLLERS) {
      const target = registry[name];
      expect(target, name).toBeDefined();
      const prototype = target!.prototype;
      for (const method of Object.getOwnPropertyNames(prototype)) {
        if (method === "constructor") continue;
        const handler = prototype[method] as (...args: unknown[]) => unknown;
        const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (httpMethod === undefined || httpMethod === RequestMethod.GET) continue;
        if ((wiring.BROKER_TENANT_WRITE_ALLOWED_WHEN_SUSPENDED[name] ?? []).includes(method)) continue;
        expect(wiring.BROKER_TENANT_WRITE_GUARDED[name] ?? [], `${name}.${method} is a broker write route`).toContain(method);
        const instance = new (target as unknown as new (runtime: unknown) => Record<string, (...args: unknown[]) => unknown>)(runtime);
        let thrown: unknown;
        try {
          instance[method]!(...Array.from({ length: Math.max(handler.length, 1) }, () => request));
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${name}.${method}`).toBeInstanceOf(ForbiddenException);
        expect((thrown as ForbiddenException).getResponse(), `${name}.${method}`).toMatchObject({ code: "PARTNER_SUSPENDED" });
        guarded += 1;
      }
    }
    expect(guarded).toBe(Object.values(wiring.BROKER_TENANT_WRITE_GUARDED).flat().length);
  });
});

describe("PartnerTenantStatusService", () => {
  it("caches the status per tenant and drops the entry on every partner change", async () => {
    let status: "active" | "suspended" = "active";
    let reads = 0;
    const listeners: Array<(id: string) => void | Promise<void>> = [];
    const service = new PartnerTenantStatusService({
      find: async () => {
        reads += 1;
        return { status };
      },
      onChange: (listener) => {
        listeners.push(listener);
      }
    });
    expect(await service.status("t1")).toBe("active");
    status = "suspended";
    expect(await service.status("t1")).toBe("active");
    expect(reads).toBe(1);
    await listeners[0]!("t1");
    expect(await service.status("t1")).toBe("suspended");
    expect(reads).toBe(2);
  });
});
