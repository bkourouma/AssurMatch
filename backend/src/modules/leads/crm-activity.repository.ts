import type {
  BrokerCrmDispute,
  BrokerCrmDocument,
  BrokerCrmHistoryEvent,
  BrokerCrmNote,
  BrokerCrmOutcomeReason,
  BrokerCrmPipelineStatus,
  BrokerCrmProposal,
  BrokerCrmReminder,
  BrokerCrmTask
} from "../../../../packages/shared/contracts/quote.contracts";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const CRM_ACTIVITY_REPOSITORY = Symbol("CRM_ACTIVITY_REPOSITORY");

export interface BrokerCrmPipelineHistoryRecord extends BrokerCrmHistoryEvent {
  leadAssignmentId: string;
  partnerTenantId: string;
  actorId?: string;
  reason?: BrokerCrmOutcomeReason;
  previousStatus?: BrokerCrmPipelineStatus;
  nextStatus?: BrokerCrmPipelineStatus;
}

export interface CrmActivityRepository extends RuntimeRepository {
  appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): BrokerCrmPipelineHistoryRecord;
  pipelineHistoryForLead(leadAssignmentId: string): BrokerCrmPipelineHistoryRecord[];
  addNote(note: BrokerCrmNote): BrokerCrmNote;
  addTask(task: BrokerCrmTask): BrokerCrmTask;
  addReminder(reminder: BrokerCrmReminder): BrokerCrmReminder;
  addDocument(document: BrokerCrmDocument): BrokerCrmDocument;
  addProposal(proposal: BrokerCrmProposal): BrokerCrmProposal;
  addDispute(dispute: BrokerCrmDispute): BrokerCrmDispute;
  notesForLead(leadAssignmentId: string): BrokerCrmNote[];
  tasksForLead(leadAssignmentId: string): BrokerCrmTask[];
  remindersForLead(leadAssignmentId: string): BrokerCrmReminder[];
  documentsForLead(leadAssignmentId: string): BrokerCrmDocument[];
  proposalsForLead(leadAssignmentId: string): BrokerCrmProposal[];
  disputesForLead(leadAssignmentId: string): BrokerCrmDispute[];
}

export class MemoryCrmActivityRepository implements CrmActivityRepository {
  readonly mode = "memory-test" as const;
  private readonly pipelineHistory: BrokerCrmPipelineHistoryRecord[] = [];
  private readonly notes: BrokerCrmNote[] = [];
  private readonly tasks: BrokerCrmTask[] = [];
  private readonly reminders: BrokerCrmReminder[] = [];
  private readonly documents: BrokerCrmDocument[] = [];
  private readonly proposals: BrokerCrmProposal[] = [];
  private readonly disputes: BrokerCrmDispute[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "CRMActivityRepository");
  }

  appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): BrokerCrmPipelineHistoryRecord {
    this.pipelineHistory.push(history);
    return history;
  }

  pipelineHistoryForLead(leadAssignmentId: string): BrokerCrmPipelineHistoryRecord[] {
    return this.pipelineHistory.filter((event) => event.leadAssignmentId === leadAssignmentId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  addNote(note: BrokerCrmNote): BrokerCrmNote {
    this.notes.push(note);
    return note;
  }

  addTask(task: BrokerCrmTask): BrokerCrmTask {
    this.tasks.push(task);
    return task;
  }

  addReminder(reminder: BrokerCrmReminder): BrokerCrmReminder {
    this.reminders.push(reminder);
    return reminder;
  }

  addDocument(document: BrokerCrmDocument): BrokerCrmDocument {
    this.documents.push(document);
    return document;
  }

  addProposal(proposal: BrokerCrmProposal): BrokerCrmProposal {
    this.proposals.push(proposal);
    return proposal;
  }

  addDispute(dispute: BrokerCrmDispute): BrokerCrmDispute {
    this.disputes.push(dispute);
    return dispute;
  }

  notesForLead(leadAssignmentId: string): BrokerCrmNote[] {
    return this.notes.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  tasksForLead(leadAssignmentId: string): BrokerCrmTask[] {
    return this.tasks.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  remindersForLead(leadAssignmentId: string): BrokerCrmReminder[] {
    return this.reminders.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  documentsForLead(leadAssignmentId: string): BrokerCrmDocument[] {
    return this.documents.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  proposalsForLead(leadAssignmentId: string): BrokerCrmProposal[] {
    return this.proposals.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  disputesForLead(leadAssignmentId: string): BrokerCrmDispute[] {
    return this.disputes.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }
}
