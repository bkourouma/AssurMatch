import type {
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
import { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";
import type { MessagingFeatureFlags, MessagingProviderConfig } from "./messaging-provider.service";
import { LoggingMessagingProvider, type MessagingProviderPort } from "./messaging-provider.port";
import {
  MemoryMessagingRepository,
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

  constructor(private readonly deps: MessagingDispatchDeps) {
    this.repository = deps.repository ?? new MemoryMessagingRepository();
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
    try {
      const result = await provider.send({ channel, recipient: request.recipient, template: request.template, body: request.body });
      return this.record(request, result.accepted ? "sent" : "failed", result.provider, result.accepted ? null : result.reason ?? "provider_rejected", actor);
    } catch (error) {
      return this.record(request, "failed", provider.name, error instanceof Error ? error.message.slice(0, 160) : "provider_error", actor);
    }
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

  private async record(request: DispatchRequest, status: MessagingDelivery["status"], provider: string, reason: string | null, actor: ActorContext): Promise<MessagingDelivery> {
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
      action: status === "sent" ? MessagingProviderAuditActions.dispatched : MessagingProviderAuditActions.dispatchRefused,
      targetType: "MessagingDelivery",
      targetId: saved.id,
      scope: { channel: saved.channel, partnerTenantId: saved.partnerTenantId, scopeId: saved.scopeId },
      result: status === "sent" ? "success" : "refused",
      ...(reason ? { reason } : {}),
      context: { channel: saved.channel, status, provider, recipientMasked: saved.recipientMasked, template: saved.template }
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
