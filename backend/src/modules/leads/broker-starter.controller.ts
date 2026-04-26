import type {
  BrokerStarterExportQuery,
  BrokerStarterLeadActionRequest,
  BrokerStarterLeadListQuery
} from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";
import { BrokerStarterLeadActionsService } from "./broker-starter-lead-actions.service";
import { BrokerStarterLeadsService } from "./broker-starter-leads.service";
import { BrokerStarterNotificationsService } from "./broker-starter-notifications.service";

export class BrokerStarterController {
  constructor(
    private readonly leads: BrokerStarterLeadsService,
    private readonly actions: BrokerStarterLeadActionsService,
    private readonly notifications: BrokerStarterNotificationsService,
    private readonly access: BrokerStarterAccessPolicy,
    private readonly audit: AuditLogWriter
  ) {}

  dashboard(actor: ActorContext, query: BrokerStarterLeadListQuery = {}) {
    return this.leads.dashboard(actor, query);
  }

  list(actor: ActorContext, query: BrokerStarterLeadListQuery = {}) {
    return this.leads.list(actor, query);
  }

  detail(id: string, actor: ActorContext) {
    return this.leads.detail(id, actor);
  }

  history(id: string, actor: ActorContext) {
    return this.leads.historyForLead(id, actor);
  }

  accept(id: string, actor: ActorContext) {
    return this.actions.accept(id, actor);
  }

  reject(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext) {
    return this.actions.reject(id, input, actor);
  }

  dispute(id: string, input: BrokerStarterLeadActionRequest, actor: ActorContext) {
    return this.actions.dispute(id, input, actor);
  }

  exportCsv(actor: ActorContext, query: BrokerStarterExportQuery = {}) {
    return this.leads.exportCsv(actor, query);
  }

  listNotifications(actor: ActorContext) {
    return this.notifications.list(actor);
  }

  markNotificationRead(id: string, actor: ActorContext) {
    return this.notifications.markRead(id, actor);
  }

  planCapabilities(actor: ActorContext) {
    this.access.assertPortalAccess(actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterPortalOpened,
      targetType: "BrokerStarterPortal",
      targetId: "capabilities",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: {}
    });
    return this.access.capabilities();
  }

  blockedProCapability(actor: ActorContext, capability: string): never {
    this.access.assertProCapabilityBlocked(actor, capability);
    throw new Error("Le plan Starter ne comprend pas le CRM complet");
  }
}
