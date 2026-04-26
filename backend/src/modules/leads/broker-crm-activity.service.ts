import {
  brokerCrmAssignRequestSchema,
  brokerCrmDisputeCreateSchema,
  brokerCrmDocumentCreateSchema,
  brokerCrmNoteCreateSchema,
  brokerCrmProposalCreateSchema,
  brokerCrmReminderCreateSchema,
  brokerCrmTaskCreateSchema,
  type BrokerCrmDispute,
  type BrokerCrmDocument,
  type BrokerCrmNote,
  type BrokerCrmProposal,
  type BrokerCrmReminder,
  type BrokerCrmTask
} from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { BrokerCrmHistoryService } from "./broker-crm-history.service";
import { MemoryCrmActivityRepository, type CrmActivityRepository } from "./crm-activity.repository";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";

export class BrokerCrmActivityService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerCrmAccessPolicy,
    private readonly history: BrokerCrmHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly repository: CrmActivityRepository = new MemoryCrmActivityRepository()
  ) {}

  async addNote(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmNote> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmNoteCreateSchema.parse(input);
    const note: BrokerCrmNote = { id: crypto.randomUUID(), leadAssignmentId: id, body: parsed.body, ...(actor.actorId ? { authorId: actor.actorId } : {}), createdAt: new Date().toISOString() };
    await this.repository.addNote(note);
    await this.track(assignment, actor, "note_created", QuoteAuditActions.brokerCrmNoteCreated);
    return note;
  }

  async addTask(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmTask> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmTaskCreateSchema.parse(input);
    if (parsed.assigneeId) this.access.assertSameTenantAssignee(actor, assignment, parsed.assigneeId);
    const task: BrokerCrmTask = { id: crypto.randomUUID(), leadAssignmentId: id, title: parsed.title, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}), ...(parsed.dueAt ? { dueAt: parsed.dueAt } : {}), createdAt: new Date().toISOString() };
    await this.repository.addTask(task);
    await this.track(assignment, actor, "task_created", QuoteAuditActions.brokerCrmTaskCreated);
    return task;
  }

  async addReminder(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmReminder> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmReminderCreateSchema.parse(input);
    if (parsed.assigneeId) this.access.assertSameTenantAssignee(actor, assignment, parsed.assigneeId);
    const reminder: BrokerCrmReminder = { id: crypto.randomUUID(), leadAssignmentId: id, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}), remindAt: parsed.remindAt, ...(parsed.message ? { message: parsed.message } : {}), createdAt: new Date().toISOString() };
    await this.repository.addReminder(reminder);
    await this.track(assignment, actor, "reminder_created", QuoteAuditActions.brokerCrmReminderCreated);
    return reminder;
  }

  async assignAdvisor(id: string, input: unknown, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = brokerCrmAssignRequestSchema.parse(input);
    const assignment = await this.assignments.require(id);
    this.access.assertAssignment(actor, assignment, parsed.advisorPartnerTenantId);
    const updated = await this.assignments.updateCrmMetadata(id, { assignedAdvisorId: parsed.advisorId }, actor);
    await this.track(assignment, actor, "assigned", QuoteAuditActions.brokerCrmLeadAssigned);
    return updated;
  }

  async addDocument(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmDocument> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmDocumentCreateSchema.parse(input);
    const document: BrokerCrmDocument = { id: crypto.randomUUID(), leadAssignmentId: id, label: parsed.label, storageKey: parsed.storageKey, visibility: parsed.visibility, createdAt: new Date().toISOString() };
    await this.repository.addDocument(document);
    await this.track(assignment, actor, "document_added", QuoteAuditActions.brokerCrmDocumentAdded);
    return document;
  }

  async addProposal(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmProposal> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmProposalCreateSchema.parse(input);
    const proposal: BrokerCrmProposal = { id: crypto.randomUUID(), leadAssignmentId: id, reference: parsed.reference, ...(parsed.amountIndicative !== undefined ? { amountIndicative: parsed.amountIndicative } : {}), currency: parsed.currency ?? "XOF", ...(parsed.notes ? { notes: parsed.notes } : {}), nonContractual: true, createdAt: new Date().toISOString() };
    await this.repository.addProposal(proposal);
    await this.track(assignment, actor, "proposal_added", QuoteAuditActions.brokerCrmProposalAdded);
    return proposal;
  }

  async addDispute(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmDispute> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmDisputeCreateSchema.parse(input);
    const dispute: BrokerCrmDispute = { id: crypto.randomUUID(), leadAssignmentId: id, reason: parsed.reason, ...(parsed.comment ? { comment: parsed.comment } : {}), status: "opened", createdAt: new Date().toISOString() };
    await this.repository.addDispute(dispute);
    await this.track(assignment, actor, "disputed", QuoteAuditActions.brokerCrmLeadDisputed, parsed.reason);
    return dispute;
  }

  notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]> {
    return this.repository.notesForLead(leadAssignmentId);
  }

  tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]> {
    return this.repository.tasksForLead(leadAssignmentId);
  }

  remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]> {
    return this.repository.remindersForLead(leadAssignmentId);
  }

  documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]> {
    return this.repository.documentsForLead(leadAssignmentId);
  }

  proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]> {
    return this.repository.proposalsForLead(leadAssignmentId);
  }

  disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]> {
    return this.repository.disputesForLead(leadAssignmentId);
  }

  async overdueTaskCount(actor: ActorContext): Promise<number> {
    const now = new Date();
    const assignments = await this.assignments.list();
    let count = 0;
    for (const assignment of assignments) {
      if (assignment.partnerTenantId !== actor.partnerTenantId) continue;
      count += (await this.repository.tasksForLead(assignment.id)).filter((task) => task.dueAt && new Date(task.dueAt) < now && !task.completedAt).length;
    }
    return count;
  }

  private async requireMutable(id: string, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const assignment = await this.assignments.require(id);
    this.access.assertMutation(actor, assignment);
    return assignment;
  }

  private async track(assignment: LeadAssignmentRecord, actor: ActorContext, eventType: Parameters<BrokerCrmHistoryService["append"]>[0]["eventType"], action: string, reason?: Parameters<BrokerCrmHistoryService["append"]>[0]["reason"]): Promise<void> {
    await this.history.append({ leadAssignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, actor, eventType, ...(reason ? { reason } : {}) });
    this.audit.write({
      actor,
      action,
      targetType: "LeadAssignment",
      targetId: assignment.id,
      scope: { partnerTenantId: assignment.partnerTenantId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: {}
    });
  }
}
