import type { BrokerAlertNotificationType } from "../../../../packages/shared/contracts/ops.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { MessagingDispatchService } from "./messaging-dispatch.service";
import type { NotificationRecord, NotificationsService } from "./notifications.module";

/** System actor of the scheduled job and of the event hooks (no human behind the notification). */
export const ALERTS_SYSTEM_ACTOR: ActorContext = { actorId: "system:scheduled-alerts", roles: ["super_admin"], mfaVerified: true };

export const BrokerAlertAuditActions = {
  queued: "broker_alert.queued",
  optionalChannel: "broker_alert.optional_channel"
} as const;

export interface BrokerAlertInput {
  partnerTenantId: string;
  type: BrokerAlertNotificationType;
  /**
   * Idempotency key, persisted on the notification row (unique index): the same key never produces
   * a second in-app entry, e-mail or SMS, whatever the number of runs or concurrent workers.
   */
  dedupeKey: string;
  /** In-app template (kept as `offer_expiring` for the spec 052 inbox entries). */
  inAppTemplate?: string | undefined;
  title: string;
  body: string;
  targetType: string;
  targetId: string;
}

export type BrokerAlertOutcome = "created" | "duplicate";

export interface BrokerAlertNotifierDeps {
  notifications: NotificationsService;
  dispatch: MessagingDispatchService;
  audit: AuditLogWriter;
  /** Recipient of the optional SMS / WhatsApp channels (the partner's WhatsApp number). */
  partnerPhone?: (partnerTenantId: string) => Promise<string | undefined>;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Spec 061 FR-002 / FR-003: single exit point of the broker alerts.
 *
 * - in-app: always (operational baseline of spec 038);
 * - e-mail: a pointer to the portal, drained by the quote notification worker (baseline, spec 038);
 * - SMS / WhatsApp: only when the tenant opted in; the dispatcher still applies the channel flag and
 *   the provider configuration, so a channel that ships disabled stays disabled.
 *
 * Every alert is scoped to one partner tenant: the in-app entry, the e-mail recipient and the
 * preferences are all resolved from `partnerTenantId`, never from another tenant.
 */
export class BrokerAlertNotifier {
  constructor(private readonly deps: BrokerAlertNotifierDeps) {}

  async notify(input: BrokerAlertInput, actor: ActorContext = ALERTS_SYSTEM_ACTOR): Promise<BrokerAlertOutcome> {
    if (await this.deps.notifications.findByDedupeKey(input.dedupeKey)) return "duplicate";
    const now = new Date();
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: input.type,
      recipientScope: `partner:${input.partnerTenantId}`,
      // WhatsApp goes through the dispatcher below (opt-in), never through the paired e-mail row.
      whatsAppStatus: "pending",
      emailStatus: "queued",
      payloadReference: input.targetId,
      dedupeKey: input.dedupeKey,
      eventPayload: { targetType: input.targetType, partnerTenantId: input.partnerTenantId },
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.deps.notifications.recordQueued(notification, actor);
    } catch (error) {
      // A concurrent run stored the same key first: nothing else is sent.
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
    await this.deps.dispatch.publishInApp({
      scopeId: input.partnerTenantId,
      template: input.inAppTemplate ?? input.type,
      title: input.title,
      body: input.body,
      targetType: input.targetType,
      targetId: input.targetId
    });
    await this.optionalChannels(input, actor);
    this.deps.audit.write({
      actor,
      action: BrokerAlertAuditActions.queued,
      targetType: input.targetType,
      targetId: input.targetId,
      scope: { partnerTenantId: input.partnerTenantId },
      result: "success",
      context: { type: input.type }
    });
    return "created";
  }

  /** SMS / WhatsApp only for a tenant that opted in (FR-003); the body is the in-app title only. */
  async optionalChannels(input: Pick<BrokerAlertInput, "partnerTenantId" | "type" | "title">, actor: ActorContext = ALERTS_SYSTEM_ACTOR): Promise<number> {
    const preferences = await this.deps.dispatch.preferencesFor(input.partnerTenantId);
    const channels = (["sms", "whatsapp"] as const).filter((channel) => preferences[channel]);
    if (channels.length === 0) return 0;
    const phone = await this.deps.partnerPhone?.(input.partnerTenantId).catch(() => undefined);
    if (!phone) return 0;
    for (const channel of channels) {
      await this.deps.dispatch.dispatch({
        channel,
        scopeId: input.partnerTenantId,
        partnerTenantId: input.partnerTenantId,
        recipient: phone,
        template: input.type,
        body: `AssurMatch: ${input.title}. Detail dans votre back-office. Notification operationnelle, aucun engagement contractuel.`
      }, actor);
    }
    return channels.length;
  }
}
