import { describe, expect, it, vi } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import {
  CrmConnectorAccessRefusedError,
  CrmConnectorConflictError,
  CrmConnectorService,
  MemoryCrmConnectorRepository
} from "../../../src/modules/crm-connector/crm-connector.module";
import { verifyWebhookSignature } from "../../../src/modules/partner-integrations/webhook-signature.service";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const OTHER_PARTNER = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://crm.partner.example";
const URL_OK = `${ORIGIN}/hooks/assurmatch`;
const AUTH_VALUE = "Bearer s3cret-token-value";
const T0 = new Date("2026-10-21T10:00:00.000Z");
const REASON = "Pilot CRM integration for the partner";

const admin: ActorContext = { actorId: "admin-1", roles: ["compliance_admin"], mfaVerified: true };

interface Harness {
  service: CrmConnectorService;
  audit: AuditLogWriter;
  repository: MemoryCrmConnectorRepository;
  fetchMock: ReturnType<typeof vi.fn>;
  flags: { open: boolean };
  worker: { enabled: boolean };
}

function harness(options: { status?: number | (() => number); delayMs?: number; dns?: { lookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> } } = {}): Harness {
  const audit = new AuditLogWriter();
  const repository = new MemoryCrmConnectorRepository();
  const flags = { open: true };
  const worker = { enabled: true };
  const fetchMock = vi.fn(async () => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const status = typeof options.status === "function" ? options.status() : options.status ?? 200;
    return new Response(null, { status });
  });
  const service = new CrmConnectorService({
    audit,
    featureFlags: { isEnabled: (key) => key === "crm_connector_enabled" && flags.open },
    partners: { require: async (id) => ({ id }) },
    repository,
    approvedOrigin: async (partnerTenantId, url) => partnerTenantId === PARTNER && url.origin === ORIGIN,
    enforceDnsValidation: options.dns !== undefined,
    ...(options.dns ? { dnsResolver: options.dns } : {}),
    deliveryEnabled: () => worker.enabled,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => T0
  });
  return { service, audit, repository, fetchMock, flags, worker };
}

async function activeConnector(h: Harness, extra: Record<string, unknown> = {}) {
  const created = await h.service.create(admin, {
    partnerTenantId: PARTNER,
    name: "Partner CRM",
    url: URL_OK,
    eventTypes: ["lead.assigned", "lead.status_changed"],
    authHeaderName: "X-Api-Key",
    authHeaderValue: AUTH_VALUE,
    reason: REASON,
    ...extra
  });
  await h.service.update(admin, created.connector.id, { status: "active", reason: REASON });
  return created;
}

const leadData = {
  leadAssignmentId: "assign-1",
  publicReference: "AM-123",
  countryCode: "CI",
  productKey: "auto",
  status: "assigned",
  previousStatus: "pending",
  fullName: "Awa Diallo",
  email: "awa@example.com",
  phone: "+2250102030405",
  freeText: "call me after 6pm"
};

function sentRequest(h: Harness, index = 0) {
  const call = h.fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  const headers = call[1].headers as Record<string, string>;
  return { url: call[0], init: call[1], headers, body: call[1].body as string };
}

describe("CRM connector (spec 076)", () => {
  describe("feature flag closed", () => {
    it("creates no delivery and never calls fetch", async () => {
      const h = harness();
      await activeConnector(h);
      h.flags.open = false;
      const auditBefore = h.audit.all().length;
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect((await h.repository.listDeliveries()).length).toBe(0);
      const summary = await h.service.processDue({ now: T0 });
      expect(summary).toEqual({ attempted: 0, delivered: 0, retryable: 0, deadLetter: 0, failed: 0 });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.audit.all().length).toBe(auditBefore);
    });

    it("does not process previously queued deliveries while closed", async () => {
      const h = harness();
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      h.flags.open = false;
      await h.service.processDue({ now: T0 });
      expect(h.fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("administration", () => {
    it("returns the signing secret once and never exposes secrets afterwards", async () => {
      const h = harness();
      const created = await h.service.create(admin, {
        partnerTenantId: PARTNER, name: "Partner CRM", url: URL_OK, eventTypes: ["lead.assigned"],
        authHeaderName: "X-Api-Key", authHeaderValue: AUTH_VALUE, reason: REASON
      });
      expect(created.signingSecret).toMatch(/^crmsec_/);
      expect(created.connector.status).toBe("disabled");
      expect(created.connector.authHeaderName).toBe("X-Api-Key");
      expect(created.connector.authHeaderConfigured).toBe(true);
      expect(created.connector.urlHost).toBe("crm.partner.example");
      const listed = await h.service.list(admin);
      const serialized = JSON.stringify([listed, created.connector, h.audit.all()]);
      expect(serialized).not.toContain(created.signingSecret);
      expect(serialized).not.toContain(AUTH_VALUE);
      expect(serialized).not.toContain("secretEncrypted");
      expect(serialized).not.toContain("authHeaderValue");
      const stored = (await h.repository.listConnectors())[0];
      expect(stored?.secretEncrypted).not.toContain(created.signingSecret ?? "");
      expect(stored?.authHeaderValueEncrypted).not.toContain(AUTH_VALUE);
      expect(listed.items[0]).not.toHaveProperty("signingSecret");
    });

    it("rotates the secret and shows the new one once", async () => {
      const h = harness();
      const created = await activeConnector(h);
      const rotated = await h.service.update(admin, created.connector.id, { rotateSecret: true, reason: REASON });
      expect(rotated.signingSecret).toMatch(/^crmsec_/);
      expect(rotated.signingSecret).not.toBe(created.signingSecret);
      expect(JSON.stringify(h.audit.all())).not.toContain(rotated.signingSecret ?? "");
      const listed = await h.service.list(admin);
      expect(JSON.stringify(listed)).not.toContain(rotated.signingSecret ?? "");
    });

    it("refuses actors without MFA or without the partners:update permission", async () => {
      const h = harness();
      const input = { partnerTenantId: PARTNER, name: "Partner CRM", url: URL_OK, eventTypes: ["lead.assigned" as const], reason: REASON };
      await expect(h.service.create({ ...admin, mfaVerified: false }, input)).rejects.toBeInstanceOf(CrmConnectorAccessRefusedError);
      await expect(h.service.create({ actorId: "u", roles: ["support_admin"], mfaVerified: true }, input)).rejects.toMatchObject({ reason: "forbidden_role" });
      await expect(h.service.list({ actorId: "u", roles: ["broker_owner_starter"], mfaVerified: true })).rejects.toBeInstanceOf(CrmConnectorAccessRefusedError);
      const refusals = h.audit.all().filter((entry) => entry.action === "crm_connector.access_refused");
      expect(refusals.map((entry) => entry.reason)).toEqual(["mfa_required", "forbidden_role", "forbidden_role"]);
      expect((await h.repository.listConnectors()).length).toBe(0);
    });

    it("allows a single connector per partner", async () => {
      const h = harness();
      await activeConnector(h);
      await expect(h.service.create(admin, {
        partnerTenantId: PARTNER, name: "Second", url: URL_OK, eventTypes: ["lead.assigned"], reason: REASON
      })).rejects.toBeInstanceOf(CrmConnectorConflictError);
    });

    it("rejects http, localhost and non allow-listed URLs", async () => {
      const h = harness();
      const base = { partnerTenantId: PARTNER, name: "Partner CRM", eventTypes: ["lead.assigned" as const], reason: REASON };
      await expect(h.service.create(admin, { ...base, url: "http://crm.partner.example/hook" })).rejects.toThrow();
      await expect(h.service.create(admin, { ...base, url: "https://localhost/hook" })).rejects.toThrow(/Invalid CRM connector URL/);
      await expect(h.service.create(admin, { ...base, url: "https://10.0.0.5/hook" })).rejects.toThrow(/Invalid CRM connector URL/);
      await expect(h.service.create(admin, { ...base, url: "https://evil.example/hook" })).rejects.toThrow(/Invalid CRM connector URL/);
      await expect(h.service.create(admin, { ...base, partnerTenantId: OTHER_PARTNER, url: URL_OK })).rejects.toThrow(/Invalid CRM connector URL/);
      expect((await h.repository.listConnectors()).length).toBe(0);
    });

    it("rejects reserved auth header names", async () => {
      const h = harness();
      for (const name of ["Host", "content-type", "X-AssurMatch-Signature"]) {
        await expect(h.service.create(admin, {
          partnerTenantId: PARTNER, name: "Partner CRM", url: URL_OK, eventTypes: ["lead.assigned"],
          authHeaderName: name, authHeaderValue: "v", reason: REASON
        })).rejects.toThrow();
      }
    });

    it("re-validates the URL on change and before activation", async () => {
      const h = harness();
      const created = await h.service.create(admin, {
        partnerTenantId: PARTNER, name: "Partner CRM", url: URL_OK, eventTypes: ["lead.assigned"], reason: REASON
      });
      await expect(h.service.update(admin, created.connector.id, { url: "https://evil.example/hook", reason: REASON })).rejects.toThrow(/Invalid CRM connector URL/);
      await h.repository.updateConnector(created.connector.id, { url: "https://evil.example/hook" });
      await expect(h.service.update(admin, created.connector.id, { status: "active", reason: REASON })).rejects.toThrow(/Invalid CRM connector URL/);
    });

    it("audits every admin action with the reason and the host only", async () => {
      const h = harness();
      const created = await activeConnector(h);
      const entries = h.audit.all().filter((entry) => entry.action === "crm_connector.created" || entry.action === "crm_connector.updated");
      expect(entries.length).toBe(2);
      for (const entry of entries) expect(entry.reason).toBe(REASON);
      expect(JSON.stringify(h.audit.all())).not.toContain("/hooks/assurmatch");
      expect(JSON.stringify(h.audit.all())).toContain("crm.partner.example");
      expect(created.connector.id).toBeTruthy();
    });
  });

  describe("publication", () => {
    it("ignores events when the connector is disabled, unsubscribed or the event is outside the catalogue", async () => {
      const h = harness();
      const created = await h.service.create(admin, {
        partnerTenantId: PARTNER, name: "Partner CRM", url: URL_OK, eventTypes: ["lead.assigned"], reason: REASON
      });
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect((await h.repository.listDeliveries()).length).toBe(0);
      await h.service.update(admin, created.connector.id, { status: "active", reason: REASON });
      await h.service.publish("lead.status_changed", PARTNER, leadData);
      await h.service.publish("notification.failed", PARTNER, leadData);
      await h.service.publish("lead.accepted", PARTNER, leadData);
      await h.service.publish("lead.assigned", OTHER_PARTNER, leadData);
      expect((await h.repository.listDeliveries()).length).toBe(0);
    });

    it("minimizes the payload to the allow-list and keeps PII out", async () => {
      const h = harness();
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      const [delivery] = await h.repository.listDeliveries();
      expect(delivery?.status).toBe("pending");
      expect(delivery?.payloadMetadata).toMatchObject({
        dataKeys: ["countryCode", "leadAssignmentId", "previousStatus", "productKey", "publicReference", "status"],
        containsPii: false
      });
      expect(delivery?.payloadEncrypted).not.toContain("Awa");
      await h.service.processDue({ now: T0 });
      const { body } = sentRequest(h);
      const parsed = JSON.parse(body) as { id: string; type: string; partnerTenantId: string; data: Record<string, unknown> };
      expect(parsed.type).toBe("lead.assigned");
      expect(parsed.partnerTenantId).toBe(PARTNER);
      expect(parsed.id).toMatch(/^evt_/);
      expect(Object.keys(parsed.data).sort()).toEqual(["countryCode", "leadAssignmentId", "previousStatus", "productKey", "publicReference", "status"]);
      expect(body).not.toMatch(/Awa|awa@example|\+2250102030405|call me/);
      expect(delivery?.idempotencyKey).toBe(`crm_${delivery?.connectorId}_${parsed.id}`);
    });

    it("never throws, even when the repository fails", async () => {
      const h = harness();
      await activeConnector(h);
      h.repository.createDelivery = async () => { throw new Error("db down"); };
      await expect(h.service.publish("lead.assigned", PARTNER, leadData)).resolves.toBeUndefined();
      expect(h.audit.all().some((entry) => entry.action === "crm_connector.delivery_publication_failed")).toBe(true);
    });
  });

  describe("delivery", () => {
    it("sends a verifiable signed request with the auth header and marks 2xx as delivered", async () => {
      const h = harness();
      const created = await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      const summary = await h.service.processDue({ now: T0 });
      expect(summary).toEqual({ attempted: 1, delivered: 1, retryable: 0, deadLetter: 0, failed: 0 });
      const request = sentRequest(h);
      expect(request.url).toBe(URL_OK);
      expect(request.init.method).toBe("POST");
      expect(request.init.redirect).toBe("manual");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.headers["user-agent"]).toBe("AssurMatch-CRM/1.0");
      expect(request.headers["X-Api-Key"]).toBe(AUTH_VALUE);
      const [delivery] = await h.repository.listDeliveries();
      expect(request.headers["X-AssurMatch-Idempotency-Key"]).toBe(delivery?.idempotencyKey);
      expect(verifyWebhookSignature({
        secret: created.signingSecret ?? "",
        timestamp: request.headers["X-AssurMatch-Timestamp"] ?? "",
        eventId: request.headers["X-AssurMatch-Event-Id"] ?? "",
        idempotencyKey: request.headers["X-AssurMatch-Idempotency-Key"] ?? "",
        payload: request.body,
        signature: request.headers["X-AssurMatch-Signature"] ?? "",
        now: T0
      })).toBe(true);
      expect(delivery).toMatchObject({ status: "delivered", attemptCount: 1, lastResponseClass: "2xx" });
      const attemptAudit = JSON.stringify(h.audit.all().filter((entry) => entry.action === "crm_connector.delivery_attempt_recorded"));
      expect(attemptAudit).not.toContain("crm.partner.example");
      expect(attemptAudit).not.toContain(AUTH_VALUE);
    });

    it("retries after a 500 and succeeds on the next due run", async () => {
      let status = 500;
      const h = harness({ status: () => status });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ attempted: 1, retryable: 1 });
      const [afterFirst] = await h.repository.listDeliveries();
      expect(afterFirst).toMatchObject({ status: "retryable", attemptCount: 1, lastResponseClass: "5xx" });
      expect(afterFirst?.nextAttemptAt?.getTime()).toBe(T0.getTime() + 5 * 60_000);
      // Not due yet.
      expect(await h.service.processDue({ now: new Date(T0.getTime() + 60_000) })).toMatchObject({ attempted: 0 });
      status = 200;
      expect(await h.service.processDue({ now: new Date(T0.getTime() + 6 * 60_000) })).toMatchObject({ attempted: 1, delivered: 1 });
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "delivered", attemptCount: 2 });
      expect(h.fetchMock).toHaveBeenCalledTimes(2);
    });

    it("moves to dead_letter after 5 failed attempts", async () => {
      const h = harness({ status: 503 });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      let summary = { deadLetter: 0 };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        summary = await h.service.processDue({ now: new Date(T0.getTime() + attempt * 2 * 24 * 3_600_000) });
      }
      expect(summary.deadLetter).toBe(1);
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "dead_letter", attemptCount: 5 });
      await h.service.processDue({ now: new Date(T0.getTime() + 30 * 24 * 3_600_000) });
      expect(h.fetchMock).toHaveBeenCalledTimes(5);
    });

    it("retries on network errors", async () => {
      const h = harness();
      await activeConnector(h);
      h.fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ retryable: 1 });
      expect((await h.repository.listDeliveries())[0]?.lastResponseClass).toBe("network_error");
    });

    it("fails permanently on a 400 without any retry", async () => {
      const h = harness({ status: 400 });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ attempted: 1, failed: 1 });
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "failed", attemptCount: 1, lastResponseClass: "4xx" });
      await h.service.processDue({ now: new Date(T0.getTime() + 7 * 24 * 3_600_000) });
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries 429 and 408 as transient", async () => {
      const h = harness({ status: 429 });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ retryable: 1 });
    });

    it("never follows a redirect", async () => {
      const h = harness({ status: 302 });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      await h.service.processDue({ now: T0 });
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      const [delivery] = await h.repository.listDeliveries();
      expect(delivery).toMatchObject({ lastResponseClass: "3xx_redirect_blocked", status: "failed", nextAttemptAt: null });
    });

    it("refuses a host name resolving to a private IP at creation and at send time (DNS validation on)", async () => {
      let address = "10.0.0.5";
      const h = harness({ dns: { lookup: async () => [{ address, family: 4 }] } });
      await expect(h.service.create(admin, {
        partnerTenantId: PARTNER, name: "Rebinding", url: URL_OK, eventTypes: ["lead.assigned"], reason: REASON
      })).rejects.toThrow(/Invalid CRM connector URL/);
      address = "93.184.216.34";
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      address = "10.0.0.5";
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ attempted: 1, failed: 1 });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "failed", lastResponseClass: "endpoint_policy_blocked" });
    });

    it("blocks the call when the URL policy is violated at send time", async () => {
      const h = harness();
      const created = await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      await h.repository.updateConnector(created.connector.id, { url: "https://169.254.169.254/latest" });
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ attempted: 1, failed: 1 });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "failed", lastResponseClass: "endpoint_policy_blocked" });
    });

    it("marks the delivery failed without a call when the connector was suspended meanwhile", async () => {
      const h = harness();
      const created = await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      await h.service.update(admin, created.connector.id, { status: "suspended", reason: REASON });
      expect(await h.service.processDue({ now: T0 })).toMatchObject({ attempted: 1, failed: 1 });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "failed", lastResponseClass: "connector_inactive", attemptCount: 0 });
    });

    it("sends only once when two workers run concurrently", async () => {
      const h = harness({ delayMs: 20 });
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      const [first, second] = await Promise.all([h.service.processDue({ now: T0 }), h.service.processDue({ now: T0 })]);
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      expect(first.attempted + second.attempted).toBe(1);
      expect((await h.repository.listDeliveries())[0]).toMatchObject({ status: "delivered", attemptCount: 1 });
    });

    it("audits a refusal once per run when the worker is disabled", async () => {
      const h = harness();
      await activeConnector(h);
      await h.service.publish("lead.assigned", PARTNER, leadData);
      h.worker.enabled = false;
      await h.service.processDue({ now: T0 });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.audit.all().filter((entry) => entry.reason === "delivery_disabled").length).toBe(1);
    });
  });
});
