import type { BrokerCrmAiFoundations, BrokerCrmNotification } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { LeadAssignmentService } from "./lead-assignment.service";

export class BrokerCrmNotificationsService {
  private readonly readIds = new Set<string>();

  constructor(private readonly assignments: LeadAssignmentService, private readonly access: BrokerCrmAccessPolicy, private readonly audit: AuditLogWriter) {}

  list(actor: ActorContext): BrokerCrmNotification[] {
    this.access.assertCrmAccess(actor);
    const notifications = this.assignments.list()
      .filter((assignment) => assignment.partnerTenantId === actor.partnerTenantId)
      .slice(0, 20)
      .map((assignment) => ({
        id: `crm-${assignment.id}`,
        type: "lead_assigned" as const,
        leadAssignmentId: assignment.id,
        read: this.readIds.has(`crm-${assignment.id}`),
        createdAt: assignment.assignedAt.toISOString()
      }));
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmNotificationViewed,
      targetType: "BrokerCrmNotification",
      targetId: "list",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { count: notifications.length }
    });
    return notifications;
  }

  aiFoundations(actor: ActorContext): BrokerCrmAiFoundations {
    this.access.assertCrmAccess(actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmAiFoundationViewed,
      targetType: "BrokerCrmAiFoundation",
      targetId: "metadata",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { modelCall: false }
    });
    return {
      enabled: false,
      availableAssistTypes: ["lead_summary", "next_action", "relaunch_message", "loss_analysis"],
      message: "Fondations IA CRM disponibles pour activation future, sans appel modele ni conseil personnalise par defaut."
    };
  }
}
