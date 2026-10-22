import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { EncryptionService } from "../../../src/modules/auth/encryption.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MemoryAdminAlertsRepository, MemoryWorkerHeartbeatRepository } from "../../../src/modules/notifications/admin-alerts.repository";
import { AdminAlertsService } from "../../../src/modules/notifications/admin-alerts.service";
import { MessagingDispatchService } from "../../../src/modules/notifications/messaging-dispatch.service";
import type { MessagingProviderPort, MessagingSendRequest, MessagingSendResult } from "../../../src/modules/notifications/messaging-provider.port";
import { MemoryMessagingRepository } from "../../../src/modules/notifications/messaging.repository";

/** Lot 12 (spec 077 FR-005): a dead-lettered SMS/WhatsApp message raises one critical admin alert. */

const PHONE = "+2250102030405";
const BODY = "Votre demande de devis AM-4242 a ete transmise";
const TENANT = "11111111-1111-4111-8111-111111111111";
const actor: ActorContext = { actorId: "system:test", roles: ["super_admin"], mfaVerified: true, correlationId: "corr-1" };
const T0 = new Date("2026-10-21T10:00:00.000Z");
const MINUTE = 60_000;
const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE);

class AlwaysTransient implements MessagingProviderPort {
  readonly name = "scripted";
  calls = 0;
  async send(_request: MessagingSendRequest): Promise<MessagingSendResult> {
    this.calls += 1;
    return { provider: "scripted", accepted: false, retryable: true, errorClass: "http_500" };
  }
}

function setup(hookThrows = false) {
  const audit = new AuditLogWriter();
  const repository = new MemoryMessagingRepository();
  const alertsRepository = new MemoryAdminAlertsRepository();
  const alerts = new AdminAlertsService({ repository: alertsRepository, heartbeats: new MemoryWorkerHeartbeatRepository(), audit, now: () => T0 });
  const dispatch = new MessagingDispatchService({
    audit,
    featureFlags: { isEnabled: () => true },
    config: { smsProvider: "scripted", smsSecretConfigured: true },
    repository,
    smsProvider: new AlwaysTransient(),
    encryption: new EncryptionService(),
    retry: { maxAttempts: 2, delaysMs: [MINUTE] },
    now: () => T0
  });
  dispatch.setDeadLetterHook((info) => {
    if (hookThrows) throw new Error("hook failure");
    void alerts.raise({
      type: "channel_dead_letter",
      severity: "critical",
      conditionKey: `channel_dead_letter:${info.channel}:${info.partnerTenantId ?? "global"}`,
      targetType: "ChannelOutbox",
      targetId: info.channel,
      ...(info.partnerTenantId ? { partnerTenantId: info.partnerTenantId } : {}),
      details: { channel: info.channel, template: info.template, attempts: info.attempts, errorClass: info.errorClass }
    });
  });
  const deadLetter = async (minutes: number) => {
    await dispatch.dispatch({ channel: "sms", scopeId: TENANT, recipient: PHONE, template: "quote_alert", body: BODY, partnerTenantId: TENANT }, actor);
    await dispatch.processDueOutbox({ now: at(minutes) });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { dispatch, alertsRepository, repository, audit, deadLetter };
}

describe("channel dead letter admin alert", () => {
  it("raises exactly one open critical alert, updates it on a second dead letter, with no personal data", async () => {
    const ctx = setup();
    await ctx.dispatch.updatePreferences(TENANT, { sms: true, reason: "test" }, actor);
    await ctx.deadLetter(5);
    let alerts = await ctx.alertsRepository.list({ status: "open", type: "channel_dead_letter", limit: 10 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "critical", status: "open", partnerTenantId: TENANT, details: { channel: "sms", template: "quote_alert", attempts: 2, errorClass: "http_500" } });
    expect(alerts[0]?.occurrences).toBe(1);

    await ctx.deadLetter(10);
    alerts = await ctx.alertsRepository.list({ status: "open", type: "channel_dead_letter", limit: 10 });
    expect(alerts).toHaveLength(1);
    const dump = JSON.stringify({ alerts, audit: ctx.audit.search({}) });
    expect(dump).not.toContain("0102030405");
    expect(dump).not.toContain("AM-4242");
  });

  it("does not block the outbox when the hook throws", async () => {
    const ctx = setup(true);
    await ctx.dispatch.updatePreferences(TENANT, { sms: true, reason: "test" }, actor);
    await ctx.deadLetter(5);
    expect((await ctx.repository.listOutbox(5))[0]).toMatchObject({ status: "dead_letter" });
    expect(await ctx.alertsRepository.list({ status: "open", limit: 10 })).toHaveLength(0);
  });

  it("dedupes day over day: ongoing while open, duplicate after ack the same day, created again on a later day", async () => {
    const audit = new AuditLogWriter();
    const repository = new MemoryAdminAlertsRepository();
    const alerts = new AdminAlertsService({ repository, heartbeats: new MemoryWorkerHeartbeatRepository(), audit, now: () => T0 });
    const input = { type: "channel_dead_letter" as const, severity: "critical" as const, conditionKey: `channel_dead_letter:sms:${TENANT}`, targetType: "ChannelOutbox", targetId: "sms", partnerTenantId: TENANT };
    const day = (n: number) => new Date(T0.getTime() + n * 24 * 60 * MINUTE);

    expect(await alerts.raise(input, day(0))).toBe("created");
    expect(await alerts.raise(input, day(0))).toBe("ongoing");
    expect(await alerts.raise(input, day(1))).toBe("ongoing");
    const [open] = await repository.list({ status: "open", type: "channel_dead_letter", limit: 10 });
    expect(open?.occurrences).toBe(2);

    await alerts.acknowledge(open!.id, { reason: "Passerelle SMS verifiee" }, actor);
    expect(await alerts.raise(input, day(0))).toBe("duplicate");
    expect(await alerts.raise(input, day(2))).toBe("created");
    expect(await repository.list({ status: "open", type: "channel_dead_letter", limit: 10 })).toHaveLength(1);
  });
});
