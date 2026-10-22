import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { EncryptionService } from "../../../src/modules/auth/encryption.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MessagingDispatchService } from "../../../src/modules/notifications/messaging-dispatch.service";
import { MessagingProviderAuditActions } from "../../../src/modules/notifications/messaging-provider-audit-actions";
import type { MessagingProviderPort, MessagingSendRequest, MessagingSendResult } from "../../../src/modules/notifications/messaging-provider.port";
import { MemoryMessagingRepository } from "../../../src/modules/notifications/messaging.repository";

/** Lot 10 (spec 076): durable, audited retries of SMS/WhatsApp messages. */

const PHONE = "+2250102030405";
const BODY = "Votre demande de devis AM-4242 a ete transmise";
const SCOPE = "tenant-1";
const actor: ActorContext = { actorId: "system:test", roles: ["super_admin"], mfaVerified: true, correlationId: "corr-1" };
const T0 = new Date("2026-10-21T10:00:00.000Z");
const MINUTE = 60_000;

class ScriptedProvider implements MessagingProviderPort {
  readonly name = "scripted";
  readonly calls: MessagingSendRequest[] = [];
  constructor(private readonly script: Array<MessagingSendResult | "throw">) {}
  async send(request: MessagingSendRequest): Promise<MessagingSendResult> {
    this.calls.push(request);
    const step = this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
    if (step === "throw") throw new Error(`boom for ${request.recipient}`);
    return step as MessagingSendResult;
  }
}

const ok: MessagingSendResult = { provider: "scripted", accepted: true, providerMessageId: "pm-1" };
const transient: MessagingSendResult = { provider: "scripted", accepted: false, retryable: true, errorClass: "http_503" };
const permanent: MessagingSendResult = { provider: "scripted", accepted: false, retryable: false, errorClass: "http_400" };

function setup(script: Array<MessagingSendResult | "throw">, options: { flag?: boolean; optIn?: boolean; maxAttempts?: number } = {}) {
  const repository = new MemoryMessagingRepository();
  const audit = new AuditLogWriter();
  const provider = new ScriptedProvider(script);
  const flags = { enabled: options.flag ?? true };
  const deadLetters: unknown[] = [];
  const dispatch = new MessagingDispatchService({
    audit,
    featureFlags: { isEnabled: () => flags.enabled },
    config: { smsProvider: "scripted", smsSecretConfigured: true },
    repository,
    smsProvider: provider,
    encryption: new EncryptionService(),
    retry: { maxAttempts: options.maxAttempts ?? 4, delaysMs: [MINUTE, 5 * MINUTE, 30 * MINUTE] },
    now: () => T0,
    onDeadLetter: (info) => {
      deadLetters.push(info);
      throw new Error("callback errors are swallowed");
    }
  });
  const optIn = async (value: boolean) => { await dispatch.updatePreferences(SCOPE, { sms: value, reason: "test" }, actor); };
  const send = () => dispatch.dispatch({ channel: "sms", scopeId: SCOPE, recipient: PHONE, template: "quote_alert", body: BODY, partnerTenantId: SCOPE }, actor);
  const everything = async () => JSON.stringify({ outbox: await repository.listOutbox(50), deliveries: await repository.listDeliveries(50), audit: audit.search({}) });
  return { repository, audit, provider, flags, deadLetters, dispatch, optIn, send, everything, optInDefault: options.optIn ?? true };
}

async function ready(script: Array<MessagingSendResult | "throw">, options: Parameters<typeof setup>[1] = {}) {
  const ctx = setup(script, options);
  if (ctx.optInDefault) await ctx.optIn(true);
  return ctx;
}

const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE);

describe("messaging outbox retries", () => {
  it("(a) sends immediately without creating an outbox row", async () => {
    const ctx = await ready([ok]);
    const delivery = await ctx.send();
    expect(delivery.status).toBe("sent");
    expect(await ctx.repository.listOutbox(10)).toHaveLength(0);
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.dispatched }).at(-1)?.context).toMatchObject({ providerMessageId: "pm-1" });
  });

  it("(b) schedules a transient failure, waits for the due date, then retries successfully without leaking the number", async () => {
    const ctx = await ready([transient, ok]);
    const delivery = await ctx.send();
    expect(delivery).toMatchObject({ status: "failed", reason: "retry_scheduled:http_503" });
    const [row] = await ctx.repository.listOutbox(10);
    expect(row).toMatchObject({ status: "retryable", attemptCount: 1, lastErrorClass: "http_503", nextAttemptAt: at(1) });
    expect(row?.recipientEncrypted).not.toContain("0102030405");
    expect(row?.bodyEncrypted).not.toContain("AM-4242");
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.retryScheduled })).toHaveLength(1);

    expect(await ctx.dispatch.processDueOutbox({ now: at(0.5) })).toMatchObject({ attempted: 0, sent: 0 });
    expect(ctx.provider.calls).toHaveLength(1);

    const summary = await ctx.dispatch.processDueOutbox({ now: at(2) });
    expect(summary).toMatchObject({ attempted: 1, sent: 1 });
    expect(ctx.provider.calls).toHaveLength(2);
    expect(ctx.provider.calls[1]).toMatchObject({ recipient: PHONE, body: BODY });
    const after = (await ctx.repository.listOutbox(10))[0];
    expect(after).toMatchObject({ status: "sent", attemptCount: 2, recipientEncrypted: "", bodyEncrypted: "", nextAttemptAt: null, providerMessageId: "pm-1" });
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.retried }).at(-1)).toMatchObject({ result: "success" });

    const dump = await ctx.everything();
    expect(dump).not.toContain("0102030405");
    expect(dump).not.toContain("AM-4242");
    expect((await ctx.dispatch.listOutbox())[0]).not.toHaveProperty("recipientEncrypted");
    expect(JSON.stringify(await ctx.dispatch.listOutbox())).not.toContain("Encrypted");
  });

  it("(c) dead-letters a repeatedly transient failure after maxAttempts", async () => {
    const ctx = await ready([transient]);
    await ctx.send();
    expect(await ctx.dispatch.processDueOutbox({ now: at(2) })).toMatchObject({ attempted: 1, retryable: 1 });
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ attemptCount: 2, nextAttemptAt: at(7) });
    expect(await ctx.dispatch.processDueOutbox({ now: at(8) })).toMatchObject({ retryable: 1 });
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ attemptCount: 3, nextAttemptAt: at(38) });
    expect(await ctx.dispatch.processDueOutbox({ now: at(40) })).toMatchObject({ deadLetter: 1 });

    expect(ctx.provider.calls).toHaveLength(4);
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ status: "dead_letter", attemptCount: 4, recipientEncrypted: "", bodyEncrypted: "", nextAttemptAt: null });
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.deadLettered })).toHaveLength(1);
    expect(ctx.deadLetters).toEqual([{ channel: "sms", partnerTenantId: SCOPE, template: "quote_alert", attempts: 4, errorClass: "http_503" }]);
    expect(await ctx.dispatch.processDueOutbox({ now: at(500) })).toMatchObject({ attempted: 0 });
    expect(await ctx.everything()).not.toContain("0102030405");
  });

  it("(d) records a permanent failure without any outbox row", async () => {
    const ctx = await ready([permanent]);
    const delivery = await ctx.send();
    expect(delivery).toMatchObject({ status: "failed", reason: "http_400" });
    expect(await ctx.repository.listOutbox(10)).toHaveLength(0);
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.failed })).toHaveLength(1);
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.dispatchRefused })).toHaveLength(0);
  });

  it("(e) cancels the retry when the recipient withdrew consent", async () => {
    const ctx = await ready([transient, ok]);
    await ctx.send();
    await ctx.optIn(false);
    expect(await ctx.dispatch.processDueOutbox({ now: at(2) })).toMatchObject({ attempted: 0, cancelled: 1, sent: 0 });
    expect(ctx.provider.calls).toHaveLength(1);
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ status: "cancelled", lastErrorClass: "recipient_opted_out", recipientEncrypted: "", bodyEncrypted: "" });
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.cancelled })).toHaveLength(1);
    expect(await ctx.everything()).not.toContain("0102030405");
  });

  it("(f) cancels the retry when the channel flag was turned off", async () => {
    const ctx = await ready([transient, ok]);
    await ctx.send();
    ctx.flags.enabled = false;
    expect(await ctx.dispatch.processDueOutbox({ now: at(2) })).toMatchObject({ cancelled: 1 });
    expect(ctx.provider.calls).toHaveLength(1);
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ status: "cancelled", lastErrorClass: "channel_disabled" });
  });

  it("(g) refuses without consent: no outbox row, no provider call", async () => {
    const ctx = await ready([ok], { optIn: false });
    const delivery = await ctx.send();
    expect(delivery).toMatchObject({ status: "refused", reason: "recipient_opted_out" });
    expect(ctx.provider.calls).toHaveLength(0);
    expect(await ctx.repository.listOutbox(10)).toHaveLength(0);
    expect(ctx.audit.search({ action: MessagingProviderAuditActions.dispatchRefused })).toHaveLength(1);
  });

  it("(h) two concurrent workers send a due row only once", async () => {
    const ctx = await ready([transient, ok]);
    await ctx.send();
    const [first, second] = await Promise.all([ctx.dispatch.processDueOutbox({ now: at(2) }), ctx.dispatch.processDueOutbox({ now: at(2) })]);
    expect(first.attempted + second.attempted).toBe(1);
    expect(first.sent + second.sent).toBe(1);
    expect(ctx.provider.calls).toHaveLength(2);
    expect(await ctx.dispatch.processDueOutbox({ now: at(3) })).toMatchObject({ attempted: 0 });
  });

  it("(i) treats a provider exception as transient and keeps its message out of the records", async () => {
    const ctx = await ready(["throw", ok]);
    const delivery = await ctx.send();
    expect(delivery).toMatchObject({ status: "failed", reason: "retry_scheduled:provider_exception" });
    expect(await ctx.repository.listOutbox(10)).toHaveLength(1);
    expect(await ctx.everything()).not.toContain("boom");
    expect(await ctx.dispatch.processDueOutbox({ now: at(2) })).toMatchObject({ sent: 1 });
  });

  it("fails a row whose payload cannot be decrypted", async () => {
    const ctx = await ready([transient]);
    await ctx.send();
    const [row] = await ctx.repository.listOutbox(1);
    await ctx.repository.updateOutbox(row!.id, { recipientEncrypted: "garbage" });
    expect(await ctx.dispatch.processDueOutbox({ now: at(2) })).toMatchObject({ failed: 1 });
    expect((await ctx.repository.listOutbox(1))[0]).toMatchObject({ status: "failed", lastErrorClass: "decrypt_failed", bodyEncrypted: "" });
    expect(ctx.provider.calls).toHaveLength(1);
  });
});
