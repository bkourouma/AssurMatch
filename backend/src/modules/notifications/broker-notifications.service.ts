import type { InAppNotification, MessagingDelivery, NotificationPreferences } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { messagingTestDispatchSchema } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { MessagingDispatchService } from "./messaging-dispatch.service";
import { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";

export interface BrokerNotificationsDeps {
  audit: AuditLogWriter;
  dispatch: MessagingDispatchService;
}

export class NotificationAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Notification access denied: ${reason}`);
    this.name = "NotificationAccessRefusedError";
  }
}

/**
 * Broker inbox and channel preferences. Everything is scoped to the caller's partner tenant: a
 * broker never reads another tenant's notifications and never changes another tenant's preferences.
 */
export class BrokerNotificationsService {
  constructor(private readonly deps: BrokerNotificationsDeps) {}

  async inbox(actor: ActorContext): Promise<InAppNotification[]> {
    const scopeId = this.assertBroker(actor);
    const notifications = await this.deps.dispatch.listInApp(scopeId);
    this.deps.audit.write({
      actor,
      action: MessagingProviderAuditActions.inboxRead,
      targetType: "InAppNotification",
      targetId: "inbox",
      scope: { partnerTenantId: scopeId },
      result: "success",
      context: { count: notifications.length, unread: notifications.filter((notification) => !notification.read).length }
    });
    return notifications;
  }

  async markRead(id: string, actor: ActorContext): Promise<InAppNotification> {
    const scopeId = this.assertBroker(actor);
    return this.deps.dispatch.markInAppRead(id, scopeId);
  }

  async preferences(actor: ActorContext): Promise<NotificationPreferences> {
    return this.deps.dispatch.preferencesFor(this.assertBroker(actor));
  }

  async updatePreferences(input: unknown, actor: ActorContext): Promise<NotificationPreferences> {
    return this.deps.dispatch.updatePreferences(this.assertBroker(actor), input, actor);
  }

  /** Super-admin only smoke test of a configured channel; never returns a provider secret. */
  async testDispatch(input: unknown, actor: ActorContext): Promise<MessagingDelivery> {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.includes("super_admin")) this.refuse(actor, "forbidden_role");
    const parsed = messagingTestDispatchSchema.parse(input ?? {});
    return this.deps.dispatch.dispatch({
      channel: parsed.channel,
      scopeId: parsed.scopeId,
      recipient: parsed.recipient,
      template: "messaging_channel_test",
      body: "Notification operationnelle de test AssurMatch. Aucun engagement contractuel."
    }, actor);
  }

  private assertBroker(actor: ActorContext): string {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.some((role) => role.startsWith("broker_"))) this.refuse(actor, "forbidden_role");
    if (!actor.partnerTenantId) this.refuse(actor, "missing_broker_tenant");
    return actor.partnerTenantId;
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: MessagingProviderAuditActions.dispatchRefused,
      targetType: "InAppNotification",
      targetId: "inbox",
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: {}
    });
    throw new NotificationAccessRefusedError(reason);
  }
}
