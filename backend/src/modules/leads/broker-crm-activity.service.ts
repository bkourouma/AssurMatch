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
import { LeadDisputesService } from "./lead-disputes.service";

/** Identity of an advisor as known by the user directory (tenant and account status only). */
export interface AdvisorIdentity {
  partnerTenantId?: string | undefined;
  status?: string | undefined;
}

/** A suspended, locked or deleted account can no longer work a lead. */
const ASSIGNABLE_ADVISOR_STATUSES: ReadonlySet<string> = new Set(["active", "invited"]);

export class BrokerCrmActivityService {
  constructor(
    private readonly assignments: LeadAssignmentService,
    private readonly access: BrokerCrmAccessPolicy,
    private readonly history: BrokerCrmHistoryService,
    private readonly audit: AuditLogWriter,
    private readonly repository: CrmActivityRepository = new MemoryCrmActivityRepository(),
    /** Spec 063: shared dispute service (30-day window, one dispute per lead); built on the same repository when not injected. */
    private readonly disputes: LeadDisputesService = new LeadDisputesService({ audit, assignments, repository })
  ) {}

  private advisorDirectory: ((advisorId: string) => Promise<AdvisorIdentity | undefined>) | undefined;

  /**
   * Lot 3 (spec 069 FR-006): late port (set by the runtime) giving the partner tenant and the account status of a user id,
   * `undefined` when unknown. Mandatory in practice: without it every assignment is refused (fail closed).
   */
  setAdvisorTenantResolver(resolver: ((advisorId: string) => Promise<AdvisorIdentity | undefined>) | undefined): void {
    this.advisorDirectory = resolver;
  }

  async addNote(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmNote> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmNoteCreateSchema.parse(input);
    const note: BrokerCrmNote & { partnerTenantId: string } = { id: crypto.randomUUID(), leadAssignmentId: id, partnerTenantId: assignment.partnerTenantId, body: parsed.body, ...(actor.actorId ? { authorId: actor.actorId } : {}), createdAt: new Date().toISOString() };
    await this.repository.addNote(note);
    await this.track(assignment, actor, "note_created", QuoteAuditActions.brokerCrmNoteCreated);
    return note;
  }

  async addTask(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmTask> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmTaskCreateSchema.parse(input);
    if (parsed.assigneeId) this.access.assertSameTenantAssignee(actor, assignment, parsed.assigneeId);
    const task: BrokerCrmTask & { partnerTenantId: string } = { id: crypto.randomUUID(), leadAssignmentId: id, partnerTenantId: assignment.partnerTenantId, title: parsed.title, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}), ...(parsed.dueAt ? { dueAt: parsed.dueAt } : {}), createdAt: new Date().toISOString() };
    await this.repository.addTask(task);
    await this.track(assignment, actor, "task_created", QuoteAuditActions.brokerCrmTaskCreated);
    return task;
  }

  async addReminder(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmReminder> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmReminderCreateSchema.parse(input);
    if (parsed.assigneeId) this.access.assertSameTenantAssignee(actor, assignment, parsed.assigneeId);
    const reminder: BrokerCrmReminder & { partnerTenantId: string } = { id: crypto.randomUUID(), leadAssignmentId: id, partnerTenantId: assignment.partnerTenantId, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}), remindAt: parsed.remindAt, ...(parsed.message ? { message: parsed.message } : {}), createdAt: new Date().toISOString() };
    await this.repository.addReminder(reminder);
    await this.track(assignment, actor, "reminder_created", QuoteAuditActions.brokerCrmReminderCreated);
    return reminder;
  }

  async assignAdvisor(id: string, input: unknown, actor: ActorContext): Promise<LeadAssignmentRecord> {
    const parsed = brokerCrmAssignRequestSchema.parse(input);
    const assignment = await this.assignments.require(id);
    this.access.assertAssignment(actor, assignment, parsed.advisorPartnerTenantId);
    // Lot 3 (spec 069 FR-006): `advisorPartnerTenantId` is client-asserted; the advisor's real tenant comes from the user directory.
    // Fail closed: no directory wired, a lookup error, an unknown id or a disabled/deleted account all refuse the assignment.
    const advisor = this.advisorDirectory ? await this.advisorDirectory(parsed.advisorId).catch(() => undefined) : undefined;
    this.access.assertAdvisorTenantResolved(actor, assignment, advisor?.partnerTenantId);
    if (!ASSIGNABLE_ADVISOR_STATUSES.has(advisor?.status ?? "active")) this.access.refuseAdvisorUnavailable(actor, assignment);
    const updated = await this.assignments.updateCrmMetadata(id, { assignedAdvisorId: parsed.advisorId }, actor);
    await this.track(assignment, actor, "assigned", QuoteAuditActions.brokerCrmLeadAssigned);
    return updated;
  }

  async addDocument(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmDocument> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmDocumentCreateSchema.parse(input);
    // partnerTenantId is required by the persistence model even though the public DTO omits it.
    const document: BrokerCrmDocument & { partnerTenantId: string } = { id: crypto.randomUUID(), leadAssignmentId: id, partnerTenantId: assignment.partnerTenantId, label: parsed.label, storageKey: parsed.storageKey, visibility: parsed.visibility, createdAt: new Date().toISOString() };
    await this.repository.addDocument(document);
    await this.track(assignment, actor, "document_added", QuoteAuditActions.brokerCrmDocumentAdded);
    return document;
  }

  async addProposal(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmProposal> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmProposalCreateSchema.parse(input);
    const proposal: BrokerCrmProposal & { partnerTenantId: string } = { id: crypto.randomUUID(), leadAssignmentId: id, partnerTenantId: assignment.partnerTenantId, reference: parsed.reference, ...(parsed.amountIndicative !== undefined ? { amountIndicative: parsed.amountIndicative } : {}), currency: parsed.currency ?? "XOF", ...(parsed.notes ? { notes: parsed.notes } : {}), nonContractual: true, createdAt: new Date().toISOString() };
    await this.repository.addProposal(proposal);
    await this.track(assignment, actor, "proposal_added", QuoteAuditActions.brokerCrmProposalAdded);
    return proposal;
  }

  async addDispute(id: string, input: unknown, actor: ActorContext): Promise<BrokerCrmDispute> {
    const assignment = await this.requireMutable(id, actor);
    const parsed = brokerCrmDisputeCreateSchema.parse(input);
    const dispute = await this.disputes.open({ assignment, source: "crm", reason: parsed.reason, ...(parsed.comment ? { comment: parsed.comment } : {}), actor });
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

  /** Disputes of the lead (own tenant), with the decision and the credit note number (spec 063). */
  async disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]> {
    const assignment = await this.assignments.require(leadAssignmentId);
    return (await this.disputes.forLead(assignment)).map(({ partnerTenantId: _tenant, ...dispute }) => dispute);
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
