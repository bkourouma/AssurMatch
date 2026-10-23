import type {
  ChannelOutboxItem,
  InAppNotification,
  MessagingDelivery,
  NotificationChannel,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  OptionalChannel
} from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { notificationPreferencesUpdateSchema } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { EncryptionService } from "../auth/encryption.service";
import { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";
import type { MessagingFeatureFlags, MessagingProviderConfig } from "./messaging-provider.service";
import { LoggingMessagingProvider, type MessagingProviderPort, type MessagingSendResult } from "./messaging-provider.port";
import {
  MemoryMessagingRepository,
  type ChannelOutboxRecord,
  type InAppNotificationRecord,
  type MessagingDeliveryRecord,
  type MessagingRepository,
  type NotificationPreferenceRecord
} from "./messaging.repository";

export interface MessagingDispatchDeps {
  audit: AuditLogWriter;
  featureFlags: MessagingFeatureFlags;
  config: MessagingProviderConfig;
  repository?: MessagingRepository | undefined;
  smsProvider?: MessagingProviderPort | undefined;
  whatsappProvider?: MessagingProviderPort | undefined;
  /** Lot 10 (spec 076): encrypts the recipient and body kept in the retry outbox. */
  encryption?: { encrypt(plainText: string): string; decrypt(encrypted: string): string } | undefined;
  /** Lot 10 (spec 076): maxAttempts counts every attempt (default 4); delaysMs[i] is the wait before attempt i + 2. */
  retry?: { maxAttempts?: number | undefined; delaysMs?: number[] | undefined } | undefined;
  now?: (() => Date) | undefined;
  /** Called without any personal data when an outbox row reaches dead_letter; errors are swallowed. */
  onDeadLetter?: ((info: { channel: OptionalChannel; partnerTenantId: string | null; template: string; attempts: number; errorClass: string }) => void) | undefined;
}

export interface MessagingOutboxSummary {
  attempted: number;
  sent: number;
  retryable: number;
  deadLetter: number;
  failed: number;
  cancelled: number;
}

const DEFAULT_RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000];
const DEFAULT_MAX_ATTEMPTS = 4;
/** A claimed row stays invisible to other workers for this long (crash safety net). */
const CLAIM_WINDOW_MS = 10 * 60_000;

interface AuditExtras {
  action: string;
  result: "success" | "failed" | "refused";
  context?: Record<string, unknown>;
}

export interface DispatchRequest {
  channel: NotificationChannel;
  /** Preference and inbox scope: a partner tenant id for brokers, an actor id for admins. */
  scopeId: string;
  recipient: string;
  template: string;
  body: string;
  partnerTenantId?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  title?: string | undefined;
}

const FLAG_BY_CHANNEL: Record<OptionalChannel, string> = { sms: "sms_enabled", whatsapp: "whatsapp_enabled" };

/**
 * Single exit point for operational messages. A channel only reaches a provider when its feature
 * flag is on, a provider is configured and the recipient opted in; every attempt is recorded with a
 * masked recipient and audited with metadata only (never the message body).
 */
export class MessagingDispatchService {
  private readonly repository: MessagingRepository;
  private readonly encryption: NonNullable<MessagingDispatchDeps["encryption"]>;
  private readonly maxAttempts: number;
  private readonly delaysMs: number[];
  private deadLetterHook: MessagingDispatchDeps["onDeadLetter"];

  /** Lot 12 (spec 077): attached once the admin alerts service exists; called with no personal data, errors swallowed. */
  setDeadLetterHook(hook: MessagingDispatchDeps["onDeadLetter"]): void {
    this.deadLetterHook = hook;
  }

  constructor(private readonly deps: MessagingDispatchDeps) {
    this.repository = deps.repository ?? new MemoryMessagingRepository();
    this.encryption = deps.encryption ?? new EncryptionService();
    this.maxAttempts = Math.max(1, Math.floor(deps.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
    this.delaysMs = deps.retry?.delaysMs && deps.retry.delaysMs.length > 0 ? deps.retry.delaysMs : DEFAULT_RETRY_DELAYS_MS;
  }

  private clock(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  async dispatch(request: DispatchRequest, actor: ActorContext): Promise<MessagingDelivery> {
    if (request.channel === "in_app") {
      await this.publishInApp(request);
      return this.record(request, "sent", "in_app", null, actor);
    }
    if (request.channel === "email") {
      // Email delivery keeps flowing through the existing paired notification pipeline.
      return this.record(request, "sent", "email_pipeline", null, actor);
    }
    const channel = request.channel;
    if (!this.deps.featureFlags.isEnabled(FLAG_BY_CHANNEL[channel])) return this.record(request, "refused", "none", "channel_disabled", actor);
    const provider = this.providerFor(channel);
    if (!provider) return this.record(request, "refused", "none", "provider_not_configured", actor);
    const preferences = await this.preferencesFor(request.scopeId);
    if (!preferences[channel === "sms" ? "sms" : "whatsapp"]) return this.record(request, "refused", provider.name, "recipient_opted_out", actor);
    const result = await this.safeSend(provider, { channel, recipient: request.recipient, template: request.template, body: request.body });
    if (result.accepted) {
      return this.record(request, "sent", result.provider, null, actor, {
        action: MessagingProviderAuditActions.dispatched,
        result: "success",
        ...(result.providerMessageId ? { context: { providerMessageId: result.providerMessageId } } : {})
      });
    }
    const errorClass = this.errorClassOf(result);
    if (result.retryable === true && this.maxAttempts > 1) {
      const now = this.clock();
      const nextAttemptAt = new Date(now.getTime() + (this.delaysMs[0] as number));
      await this.repository.createOutbox({
        id: crypto.randomUUID(),
        channel,
        scopeId: request.scopeId,
        partnerTenantId: request.partnerTenantId ?? null,
        template: request.template,
        recipientEncrypted: this.encryption.encrypt(request.recipient),
        bodyEncrypted: this.encryption.encrypt(request.body),
        status: "retryable",
        attemptCount: 1,
        nextAttemptAt,
        lastErrorClass: errorClass,
        providerMessageId: null,
        correlationId: actor.correlationId ?? null,
        createdAt: now,
        updatedAt: now
      });
      return this.record(request, "failed", result.provider, `retry_scheduled:${errorClass}`, actor, {
        action: MessagingProviderAuditActions.retryScheduled,
        result: "failed",
        context: { attempt: 1, nextAttemptAt: nextAttemptAt.toISOString(), errorClass }
      });
    }
    return this.record(request, "failed", result.provider, errorClass, actor, {
      action: MessagingProviderAuditActions.failed,
      result: "failed",
      context: { errorClass }
    });
  }

  /**
   * Retries due outbox rows. Flag, provider and consent are re-checked at send time; a row whose
   * channel was closed or whose recipient opted out is cancelled and its encrypted data erased.
   */
  async processDueOutbox(input: { now?: Date; limit?: number } = {}, actor?: ActorContext): Promise<MessagingOutboxSummary> {
    const now = input.now ?? this.clock();
    const worker: ActorContext = actor ?? { actorId: "system:channel-outbox", roles: ["super_admin"], mfaVerified: true, correlationId: crypto.randomUUID() };
    const summary: MessagingOutboxSummary = { attempted: 0, sent: 0, retryable: 0, deadLetter: 0, failed: 0, cancelled: 0 };
    const due = await this.repository.listDueOutbox(now, input.limit ?? 50);
    for (const candidate of due) {
      const claimed = await this.repository.claimOutbox(candidate.id, now, new Date(now.getTime() + CLAIM_WINDOW_MS));
      if (!claimed) continue;
      await this.processRow(candidate, now, worker, summary);
    }
    return summary;
  }

  async listOutbox(limit = 50, actor?: ActorContext): Promise<ChannelOutboxItem[]> {
    const records = await this.repository.listOutbox(limit);
    if (actor) {
      this.deps.audit.write({
        actor,
        action: MessagingProviderAuditActions.outboxListed,
        targetType: "ChannelOutbox",
        targetId: "all",
        result: "success",
        context: { total: records.length }
      });
    }
    return records.map((record) => ({
      id: record.id,
      channel: record.channel,
      status: record.status,
      template: record.template,
      partnerTenantId: record.partnerTenantId,
      attemptCount: record.attemptCount,
      nextAttemptAt: record.nextAttemptAt ? record.nextAttemptAt.toISOString() : null,
      lastErrorClass: record.lastErrorClass,
      createdAt: record.createdAt.toISOString()
    }));
  }

  private async processRow(row: ChannelOutboxRecord, now: Date, actor: ActorContext, summary: MessagingOutboxSummary): Promise<void> {
    const erased = { recipientEncrypted: "", bodyEncrypted: "", nextAttemptAt: null, updatedAt: now } as const;
    const channel = row.channel;
    const base = { channel, template: row.template, partnerTenantId: row.partnerTenantId ?? undefined, scopeId: row.scopeId };
    let payload: { recipient: string; body: string };
    try {
      payload = { recipient: this.encryption.decrypt(row.recipientEncrypted), body: this.encryption.decrypt(row.bodyEncrypted) };
    } catch {
      await this.repository.updateOutbox(row.id, { ...erased, status: "failed", lastErrorClass: "decrypt_failed" });
      await this.record({ ...base, recipient: "" }, "failed", "none", "decrypt_failed", actor, { action: MessagingProviderAuditActions.retried, result: "failed", context: { attempt: row.attemptCount + 1, errorClass: "decrypt_failed", outboxId: row.id } });
      summary.failed += 1;
      return;
    }
    const { recipient, body } = payload;
    const provider = this.providerFor(channel);
    let cancelReason: string | null = null;
    if (!this.deps.featureFlags.isEnabled(FLAG_BY_CHANNEL[channel])) cancelReason = "channel_disabled";
    else if (!(await this.preferencesFor(row.scopeId))[channel === "sms" ? "sms" : "whatsapp"]) cancelReason = "recipient_opted_out";
    if (!cancelReason && !provider) {
      // A worker started without the provider variables must not destroy pending retries: keep the row
      // (encrypted data intact, attempt count unchanged) and look again later.
      const retryAt = new Date(now.getTime() + (this.delaysMs[this.delaysMs.length - 1] as number));
      await this.repository.updateOutbox(row.id, { status: "retryable", nextAttemptAt: retryAt, lastErrorClass: "provider_not_configured", updatedAt: now });
      await this.record({ ...base, recipient }, "refused", "none", "provider_not_configured_deferred", actor, { action: MessagingProviderAuditActions.retryScheduled, result: "refused", context: { outboxId: row.id, nextAttemptAt: retryAt.toISOString() } });
      summary.retryable += 1;
      return;
    }
    if (cancelReason || !provider) {
      const reason = cancelReason ?? "channel_disabled";
      await this.repository.updateOutbox(row.id, { ...erased, status: "cancelled", lastErrorClass: reason });
      await this.record({ ...base, recipient }, "refused", provider?.name ?? "none", reason, actor, { action: MessagingProviderAuditActions.cancelled, result: "refused", context: { outboxId: row.id } });
      summary.cancelled += 1;
      return;
    }
    summary.attempted += 1;
    const attempt = row.attemptCount + 1;
    const result = await this.safeSend(provider, { channel, recipient, template: row.template, body });
    if (result.accepted) {
      await this.repository.updateOutbox(row.id, { ...erased, status: "sent", attemptCount: attempt, lastErrorClass: null, providerMessageId: result.providerMessageId ?? null });
      await this.record({ ...base, recipient }, "sent", result.provider, null, actor, {
        action: MessagingProviderAuditActions.retried,
        result: "success",
        context: { attempt, outboxId: row.id, ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}) }
      });
      summary.sent += 1;
      return;
    }
    const errorClass = this.errorClassOf(result);
    if (result.retryable !== true) {
      await this.repository.updateOutbox(row.id, { ...erased, status: "failed", attemptCount: attempt, lastErrorClass: errorClass });
      await this.record({ ...base, recipient }, "failed", result.provider, errorClass, actor, { action: MessagingProviderAuditActions.retried, result: "failed", context: { attempt, errorClass, outboxId: row.id } });
      summary.failed += 1;
      return;
    }
    if (attempt >= this.maxAttempts) {
      await this.repository.updateOutbox(row.id, { ...erased, status: "dead_letter", attemptCount: attempt, lastErrorClass: errorClass });
      await this.record({ ...base, recipient }, "failed", result.provider, errorClass, actor, { action: MessagingProviderAuditActions.retried, result: "failed", context: { attempt, errorClass, outboxId: row.id } });
      this.deps.audit.write({
        actor,
        action: MessagingProviderAuditActions.deadLettered,
        targetType: "ChannelOutbox",
        targetId: row.id,
        scope: { channel, partnerTenantId: row.partnerTenantId, scopeId: row.scopeId },
        result: "failed",
        reason: errorClass,
        context: { channel, template: row.template, attempts: attempt, errorClass }
      });
      try {
        this.deps.onDeadLetter?.({ channel, partnerTenantId: row.partnerTenantId, template: row.template, attempts: attempt, errorClass });
      } catch {
        // A failing alert hook must never block the outbox.
      }
      try {
        this.deadLetterHook?.({ channel, partnerTenantId: row.partnerTenantId, template: row.template, attempts: attempt, errorClass });
      } catch {
        // Same rule for the hook attached after construction (Lot 12, spec 077).
      }
      summary.deadLetter += 1;
      return;
    }
    const delay = this.delaysMs[Math.min(attempt - 1, this.delaysMs.length - 1)] as number;
    const nextAttemptAt = new Date(now.getTime() + delay);
    await this.repository.updateOutbox(row.id, { status: "retryable", attemptCount: attempt, nextAttemptAt, lastErrorClass: errorClass, updatedAt: now });
    await this.record({ ...base, recipient }, "failed", result.provider, `retry_scheduled:${errorClass}`, actor, {
      action: MessagingProviderAuditActions.retried,
      result: "failed",
      context: { attempt, errorClass, nextAttemptAt: nextAttemptAt.toISOString(), outboxId: row.id }
    });
    summary.retryable += 1;
  }

  /** A provider exception is a transient failure; its message is never kept (it could echo the payload). */
  private async safeSend(provider: MessagingProviderPort, request: Parameters<MessagingProviderPort["send"]>[0]): Promise<MessagingSendResult> {
    try {
      return await provider.send(request);
    } catch {
      return { provider: provider.name, accepted: false, retryable: true, errorClass: "provider_exception" };
    }
  }

  private errorClassOf(result: MessagingSendResult): string {
    return (result.errorClass ?? result.reason ?? "provider_rejected").slice(0, 60);
  }

  async listDeliveries(limit = 50): Promise<MessagingDelivery[]> {
    return (await this.repository.listDeliveries(limit)).map((record) => this.toDeliveryDto(record));
  }

  async preferencesFor(scopeId: string): Promise<NotificationPreferences> {
    const record = await this.repository.findPreference(scopeId);
    return {
      scopeId,
      email: true,
      inApp: true,
      sms: record?.sms ?? false,
      whatsapp: record?.whatsapp ?? false,
      updatedAt: record ? record.updatedAt.toISOString() : null
    };
  }

  /** Email and in-app are the operational baseline: a request to disable them is refused. */
  async updatePreferences(scopeId: string, input: unknown, actor: ActorContext): Promise<NotificationPreferences> {
    const parsed: NotificationPreferencesUpdate = notificationPreferencesUpdateSchema.parse(input ?? {});
    if (parsed.email === false || parsed.inApp === false) {
      this.deps.audit.write({
        actor,
        action: MessagingProviderAuditActions.preferencesRefused,
        targetType: "NotificationPreference",
        targetId: scopeId,
        scope: { scopeId },
        result: "refused",
        reason: "baseline_channel_cannot_be_disabled",
        context: { channel: parsed.email === false ? "email" : "in_app" }
      });
      throw new Error("Notification preference conflict: email and in-app stay enabled as the operational baseline");
    }
    const existing = await this.repository.findPreference(scopeId);
    const now = new Date();
    const record: NotificationPreferenceRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      scopeId,
      sms: parsed.sms ?? existing?.sms ?? false,
      whatsapp: parsed.whatsapp ?? existing?.whatsapp ?? false,
      reason: parsed.reason,
      updatedById: actor.actorId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const saved = await this.repository.upsertPreference(record);
    this.deps.audit.write({
      actor,
      action: MessagingProviderAuditActions.preferencesChanged,
      targetType: "NotificationPreference",
      targetId: saved.scopeId,
      scope: { scopeId: saved.scopeId },
      result: "success",
      reason: parsed.reason,
      context: {
        previous: { sms: existing?.sms ?? false, whatsapp: existing?.whatsapp ?? false },
        next: { sms: saved.sms, whatsapp: saved.whatsapp }
      }
    });
    return this.preferencesFor(scopeId);
  }

  async publishInApp(request: Pick<DispatchRequest, "scopeId" | "template" | "body" | "targetType" | "targetId" | "title">): Promise<InAppNotification> {
    const record: InAppNotificationRecord = {
      id: crypto.randomUUID(),
      recipientScopeId: request.scopeId,
      type: request.template,
      title: request.title ?? request.template,
      body: request.body,
      targetType: request.targetType ?? null,
      targetId: request.targetId ?? null,
      read: false,
      createdAt: new Date()
    };
    return this.toInAppDto(await this.repository.createInApp(record));
  }

  async listInApp(scopeId: string, limit = 50): Promise<InAppNotification[]> {
    return (await this.repository.listInApp(scopeId, limit)).map((record) => this.toInAppDto(record));
  }

  async markInAppRead(id: string, scopeId: string): Promise<InAppNotification> {
    const updated = await this.repository.markInAppRead(id, scopeId);
    if (!updated) throw new Error("Notification not found");
    return this.toInAppDto(updated);
  }

  providerFor(channel: OptionalChannel): MessagingProviderPort | undefined {
    const configured = channel === "sms"
      ? Boolean(this.deps.config.smsProvider) && this.deps.config.smsSecretConfigured === true
      : Boolean(this.deps.config.whatsappProvider) && this.deps.config.whatsappSecretConfigured === true;
    if (!configured) return undefined;
    return (channel === "sms" ? this.deps.smsProvider : this.deps.whatsappProvider) ?? new LoggingMessagingProvider();
  }

  private async record(request: Pick<DispatchRequest, "channel" | "scopeId" | "recipient" | "template" | "partnerTenantId">, status: MessagingDelivery["status"], provider: string, reason: string | null, actor: ActorContext, extras?: AuditExtras): Promise<MessagingDelivery> {
    const record: MessagingDeliveryRecord = {
      id: crypto.randomUUID(),
      channel: request.channel,
      status,
      template: request.template,
      recipientMasked: this.mask(request.recipient),
      provider,
      partnerTenantId: request.partnerTenantId ?? null,
      scopeId: request.scopeId,
      reason,
      correlationId: actor.correlationId ?? null,
      createdAt: new Date()
    };
    const saved = await this.repository.recordDelivery(record);
    this.deps.audit.write({
      actor,
      action: extras?.action ?? (status === "sent" ? MessagingProviderAuditActions.dispatched : MessagingProviderAuditActions.dispatchRefused),
      targetType: "MessagingDelivery",
      targetId: saved.id,
      scope: { channel: saved.channel, partnerTenantId: saved.partnerTenantId, scopeId: saved.scopeId },
      result: extras?.result ?? (status === "sent" ? "success" : "refused"),
      ...(reason ? { reason } : {}),
      context: { channel: saved.channel, status, provider, recipientMasked: saved.recipientMasked, template: saved.template, ...(extras?.context ?? {}) }
    });
    return this.toDeliveryDto(saved);
  }

  private mask(recipient: string): string {
    const value = recipient.trim();
    if (value.includes("@")) {
      const [local = "", domain = ""] = value.split("@");
      return `${local.slice(0, 1)}***@${domain}`;
    }
    return `***${value.slice(-3)}`;
  }

  private toDeliveryDto(record: MessagingDeliveryRecord): MessagingDelivery {
    return {
      id: record.id,
      channel: record.channel,
      status: record.status,
      template: record.template,
      recipientMasked: record.recipientMasked,
      provider: record.provider,
      partnerTenantId: record.partnerTenantId,
      reason: record.reason,
      createdAt: record.createdAt.toISOString()
    };
  }

  private toInAppDto(record: InAppNotificationRecord): InAppNotification {
    return {
      id: record.id,
      recipientScopeId: record.recipientScopeId,
      type: record.type,
      title: record.title,
      body: record.body,
      targetType: record.targetType,
      targetId: record.targetId,
      read: record.read,
      createdAt: record.createdAt.toISOString()
    };
  }
}
