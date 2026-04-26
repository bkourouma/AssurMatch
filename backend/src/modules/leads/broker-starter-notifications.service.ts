import type { BrokerStarterNotification } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterHistoryService } from "./broker-starter-history.service";
import { LeadAssignmentService } from "./lead-assignment.service";

interface StoredStarterNotification extends BrokerStarterNotification {
  partnerTenantId: string;
}

export class BrokerStarterNotificationsService {
  private readonly notifications: StoredStarterNotification[] = [];

  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly history: BrokerStarterHistoryService,
    private readonly audit: AuditLogWriter
  ) {}

  async createLeadAssigned(leadAssignmentId: string): Promise<BrokerStarterNotification> {
    const assignment = await this.assignments.require(leadAssignmentId);
    const notification: StoredStarterNotification = {
      id: crypto.randomUUID(),
      type: "broker_lead_assigned",
      leadAssignmentId,
      partnerTenantId: assignment.partnerTenantId,
      createdAt: new Date().toISOString(),
      read: false
    };
    this.notifications.push(notification);
    return this.toDto(notification);
  }

  list(actor: ActorContext): BrokerStarterNotification[] {
    this.access.assertPortalAccess(actor);
    const items = this.notifications.filter((notification) => notification.partnerTenantId === actor.partnerTenantId).map((notification) => this.toDto(notification));
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterNotificationViewed,
      targetType: "Notification",
      targetId: "list",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { count: items.length }
    });
    return items;
  }

  markRead(id: string, actor: ActorContext): BrokerStarterNotification {
    const notification = this.notifications.find((candidate) => candidate.id === id);
    if (!notification || notification.partnerTenantId !== actor.partnerTenantId) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.brokerStarterCrossTenantRefused,
        targetType: "Notification",
        targetId: id,
        scope: { partnerTenantId: actor.partnerTenantId },
        result: "refused",
        reason: "notification_not_assigned_to_tenant",
        context: {}
      });
      throw new Error("Notification access denied");
    }
    this.access.assertPortalAccess(actor);
    notification.read = true;
    this.history.append({
      leadAssignmentId: notification.leadAssignmentId,
      partnerTenantId: notification.partnerTenantId,
      actor,
      eventType: "notification_read"
    });
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterNotificationRead,
      targetType: "Notification",
      targetId: id,
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { leadAssignmentId: notification.leadAssignmentId }
    });
    return this.toDto(notification);
  }

  private toDto(notification: StoredStarterNotification): BrokerStarterNotification {
    return {
      id: notification.id,
      type: notification.type,
      leadAssignmentId: notification.leadAssignmentId,
      createdAt: notification.createdAt,
      read: notification.read
    };
  }
}
