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
import type { PrismaService } from "../common/prisma/prisma.service";

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
  appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): Promise<BrokerCrmPipelineHistoryRecord>;
  pipelineHistoryForLead(leadAssignmentId: string): Promise<BrokerCrmPipelineHistoryRecord[]>;
  addNote(note: BrokerCrmNote): Promise<BrokerCrmNote>;
  addTask(task: BrokerCrmTask): Promise<BrokerCrmTask>;
  addReminder(reminder: BrokerCrmReminder): Promise<BrokerCrmReminder>;
  addDocument(document: BrokerCrmDocument): Promise<BrokerCrmDocument>;
  addProposal(proposal: BrokerCrmProposal): Promise<BrokerCrmProposal>;
  addDispute(dispute: BrokerCrmDispute): Promise<BrokerCrmDispute>;
  notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]>;
  tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]>;
  remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]>;
  documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]>;
  proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]>;
  disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]>;
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

  async appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): Promise<BrokerCrmPipelineHistoryRecord> {
    this.pipelineHistory.push(history);
    return history;
  }

  async pipelineHistoryForLead(leadAssignmentId: string): Promise<BrokerCrmPipelineHistoryRecord[]> {
    return this.pipelineHistory.filter((event) => event.leadAssignmentId === leadAssignmentId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async addNote(note: BrokerCrmNote): Promise<BrokerCrmNote> {
    this.notes.push(note);
    return note;
  }

  async addTask(task: BrokerCrmTask): Promise<BrokerCrmTask> {
    this.tasks.push(task);
    return task;
  }

  async addReminder(reminder: BrokerCrmReminder): Promise<BrokerCrmReminder> {
    this.reminders.push(reminder);
    return reminder;
  }

  async addDocument(document: BrokerCrmDocument): Promise<BrokerCrmDocument> {
    this.documents.push(document);
    return document;
  }

  async addProposal(proposal: BrokerCrmProposal): Promise<BrokerCrmProposal> {
    this.proposals.push(proposal);
    return proposal;
  }

  async addDispute(dispute: BrokerCrmDispute): Promise<BrokerCrmDispute> {
    this.disputes.push(dispute);
    return dispute;
  }

  async notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]> {
    return this.notes.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]> {
    return this.tasks.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]> {
    return this.reminders.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]> {
    return this.documents.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]> {
    return this.proposals.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]> {
    return this.disputes.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaCrmActivityRepository implements CrmActivityRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): Promise<BrokerCrmPipelineHistoryRecord> {
    return this.toPipelineHistory(await this.delegate("brokerCrmPipelineHistory").create({ data: {
      id: history.id,
      leadAssignmentId: history.leadAssignmentId,
      partnerTenantId: history.partnerTenantId,
      actorId: history.actorId,
      previousStatus: history.previousStatus,
      nextStatus: history.nextStatus,
      reason: history.reason,
      occurredAt: new Date(history.occurredAt),
      createdAt: new Date()
    } }));
  }

  async pipelineHistoryForLead(leadAssignmentId: string): Promise<BrokerCrmPipelineHistoryRecord[]> {
    return (await this.delegate("brokerCrmPipelineHistory").findMany({ where: { leadAssignmentId }, orderBy: { occurredAt: "asc" } })).map((row) => this.toPipelineHistory(row));
  }

  async addNote(note: BrokerCrmNote): Promise<BrokerCrmNote> {
    return this.toNote(await this.delegate("brokerCrmNote").create({ data: { ...note, createdAt: new Date(note.createdAt) } }));
  }

  async addTask(task: BrokerCrmTask): Promise<BrokerCrmTask> {
    return this.toTask(await this.delegate("brokerCrmTask").create({ data: { ...task, dueAt: task.dueAt ? new Date(task.dueAt) : undefined, completedAt: task.completedAt ? new Date(task.completedAt) : undefined, createdAt: new Date(task.createdAt) } }));
  }

  async addReminder(reminder: BrokerCrmReminder): Promise<BrokerCrmReminder> {
    return this.toReminder(await this.delegate("brokerCrmReminder").create({ data: { ...reminder, remindAt: new Date(reminder.remindAt), createdAt: new Date(reminder.createdAt) } }));
  }

  async addDocument(document: BrokerCrmDocument): Promise<BrokerCrmDocument> {
    return this.toDocument(await this.delegate("brokerCrmDocument").create({ data: { ...document, createdAt: new Date(document.createdAt) } }));
  }

  async addProposal(proposal: BrokerCrmProposal): Promise<BrokerCrmProposal> {
    return this.toProposal(await this.delegate("brokerCrmProposal").create({ data: { ...proposal, createdAt: new Date(proposal.createdAt) } }));
  }

  async addDispute(dispute: BrokerCrmDispute): Promise<BrokerCrmDispute> {
    return this.toDispute(await this.delegate("brokerCrmDispute").create({ data: { ...dispute, createdAt: new Date(dispute.createdAt) } }));
  }

  async notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]> {
    return (await this.delegate("brokerCrmNote").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toNote(row));
  }

  async tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]> {
    return (await this.delegate("brokerCrmTask").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toTask(row));
  }

  async remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]> {
    return (await this.delegate("brokerCrmReminder").findMany({ where: { leadAssignmentId }, orderBy: { remindAt: "asc" } })).map((row) => this.toReminder(row));
  }

  async documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]> {
    return (await this.delegate("brokerCrmDocument").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toDocument(row));
  }

  async proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]> {
    return (await this.delegate("brokerCrmProposal").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toProposal(row));
  }

  async disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]> {
    return (await this.delegate("brokerCrmDispute").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toDispute(row));
  }

  private delegate(name: string): Delegate {
    const delegate = (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name];
    if (!delegate) throw new Error(`Prisma delegate ${name} is unavailable`);
    return delegate;
  }

  private dateString(value: unknown): string {
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private toPipelineHistory(row: unknown): BrokerCrmPipelineHistoryRecord {
    const item = row as BrokerCrmPipelineHistoryRecord;
    return { ...item, occurredAt: this.dateString(item.occurredAt) };
  }

  private toNote(row: unknown): BrokerCrmNote {
    const item = row as BrokerCrmNote;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }

  private toTask(row: unknown): BrokerCrmTask {
    const item = row as BrokerCrmTask;
    return { ...item, createdAt: this.dateString(item.createdAt), dueAt: item.dueAt ? this.dateString(item.dueAt) : undefined, completedAt: item.completedAt ? this.dateString(item.completedAt) : undefined };
  }

  private toReminder(row: unknown): BrokerCrmReminder {
    const item = row as BrokerCrmReminder;
    return { ...item, createdAt: this.dateString(item.createdAt), remindAt: this.dateString(item.remindAt) };
  }

  private toDocument(row: unknown): BrokerCrmDocument {
    const item = row as BrokerCrmDocument;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }

  private toProposal(row: unknown): BrokerCrmProposal {
    const item = row as BrokerCrmProposal;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }

  private toDispute(row: unknown): BrokerCrmDispute {
    const item = row as BrokerCrmDispute;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }
}
