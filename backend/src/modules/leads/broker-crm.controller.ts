import type { BrokerCrmExportQuery, BrokerCrmLeadListQuery, BrokerCrmStatusUpdate } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { BrokerCrmActivityService } from "./broker-crm-activity.service";
import { BrokerCrmLeadsService } from "./broker-crm-leads.service";
import { BrokerCrmNotificationsService } from "./broker-crm-notifications.service";
import { BrokerCrmPipelineService } from "./broker-crm-pipeline.service";

export class BrokerCrmController {
  constructor(
    private readonly leads: BrokerCrmLeadsService,
    private readonly pipeline: BrokerCrmPipelineService,
    private readonly activity: BrokerCrmActivityService,
    private readonly notifications: BrokerCrmNotificationsService
  ) {}

  dashboard(actor: ActorContext, query: BrokerCrmLeadListQuery = {}) {
    return this.leads.dashboard(actor, query);
  }

  list(actor: ActorContext, query: BrokerCrmLeadListQuery = {}) {
    return this.leads.list(actor, query);
  }

  kanban(actor: ActorContext, query: BrokerCrmLeadListQuery = {}) {
    return this.leads.kanban(actor, query);
  }

  detail(id: string, actor: ActorContext) {
    return this.leads.detail(id, actor);
  }

  changeStatus(id: string, input: BrokerCrmStatusUpdate, actor: ActorContext) {
    return this.pipeline.changeStatus(id, input, actor);
  }

  addNote(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addNote(id, input, actor);
  }

  addTask(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addTask(id, input, actor);
  }

  addReminder(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addReminder(id, input, actor);
  }

  assignAdvisor(id: string, input: unknown, actor: ActorContext) {
    return this.activity.assignAdvisor(id, input, actor);
  }

  addDocument(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addDocument(id, input, actor);
  }

  addProposal(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addProposal(id, input, actor);
  }

  addDispute(id: string, input: unknown, actor: ActorContext) {
    return this.activity.addDispute(id, input, actor);
  }

  exportCsv(actor: ActorContext, query: BrokerCrmExportQuery = {}) {
    return this.leads.exportCsv(actor, query);
  }

  listNotifications(actor: ActorContext) {
    return this.notifications.list(actor);
  }

  aiFoundations(actor: ActorContext) {
    return this.notifications.aiFoundations(actor);
  }
}
