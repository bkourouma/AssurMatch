import type { BrokerCrmAiFoundations, BrokerCrmNotification } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { customRoleAllows } from "../common/rbac/actor-permissions";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { LeadAssignmentService } from "./lead-assignment.service";

export class BrokerCrmNotificationsService {
  private readonly readIds = new Set<string>();

  constructor(private readonly assignments: LeadAssignmentService, private readonly access: BrokerCrmAccessPolicy, private readonly audit: AuditLogWriter) {}

  async list(actor: ActorContext): Promise<BrokerCrmNotification[]> {
    this.access.assertCrmAccess(actor);
    // Spec 064: a custom role that does not grant notifications:read closes the feed (it only restricts).
    if (!customRoleAllows(actor, "notifications:read")) {
      this.audit.write({ actor, action: QuoteAuditActions.brokerCrmAccessRefused, targetType: "BrokerCrmNotification", targetId: "list", scope: { partnerTenantId: actor.partnerTenantId }, result: "refused", reason: "custom_role_restricted", context: {} });
      throw new Error("Broker CRM access denied");
    }
    const notifications = (await this.assignments.list())
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
