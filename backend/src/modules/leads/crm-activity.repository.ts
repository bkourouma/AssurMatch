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

/** Spec 063: a dispute as stored, with the tenant it belongs to (the public DTO omits it). */
export type LeadDisputeRecord = BrokerCrmDispute & { partnerTenantId: string };

/** Spec 063: filters of the admin dispute list; the country filter is applied by the service. */
export interface LeadDisputeFilter {
  status?: BrokerCrmDispute["status"] | undefined;
  partnerTenantId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/** Spec 063: the dispute was decided by someone else between the read and the conditional write. */
export class DisputeStatusConflictError extends Error {
  constructor() {
    super("Dispute status changed concurrently");
  }
}

/** Spec 063 D-B1: a dispute already exists for this lead assignment (one per lead, also guaranteed by a partial unique index). */
export class DisputeAlreadyExistsError extends Error {
  constructor() {
    super("A dispute already exists for this lead");
  }
}

export interface CrmActivityRepository extends RuntimeRepository {
  appendPipelineHistory(history: BrokerCrmPipelineHistoryRecord): Promise<BrokerCrmPipelineHistoryRecord>;
  pipelineHistoryForLead(leadAssignmentId: string): Promise<BrokerCrmPipelineHistoryRecord[]>;
  addNote(note: BrokerCrmNote): Promise<BrokerCrmNote>;
  addTask(task: BrokerCrmTask): Promise<BrokerCrmTask>;
  addReminder(reminder: BrokerCrmReminder): Promise<BrokerCrmReminder>;
  addDocument(document: BrokerCrmDocument): Promise<BrokerCrmDocument>;
  addProposal(proposal: BrokerCrmProposal): Promise<BrokerCrmProposal>;
  addDispute(dispute: LeadDisputeRecord): Promise<LeadDisputeRecord>;
  notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]>;
  tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]>;
  remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]>;
  documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]>;
  proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]>;
  disputesForLead(leadAssignmentId: string): Promise<LeadDisputeRecord[]>;
  /** Spec 063: one dispute by id, with its tenant. */
  findDispute(id: string): Promise<LeadDisputeRecord | undefined>;
  /** Spec 063: persists the finance decision (status, reason, credit) of an existing dispute. */
  /**
   * Persists a dispute. With `expectedStatus` the write is conditional (compare-and-set): when the stored
   * status differs (another instance decided first) it throws `DisputeStatusConflictError`.
   */
  updateDispute(dispute: LeadDisputeRecord, expectedStatus?: LeadDisputeRecord["status"]): Promise<LeadDisputeRecord>;
  /** Spec 063: disputes across tenants, newest first (admin list and broker billing view). */
  listDisputes(filter?: LeadDisputeFilter): Promise<LeadDisputeRecord[]>;
  /** Spec 061: open tasks due in [from, to], across tenants (scheduled-alerts job only). */
  openTasksDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmTask & { partnerTenantId?: string }>>;
  /** Spec 061: reminders scheduled in [from, to], across tenants (scheduled-alerts job only). */
  remindersDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmReminder & { partnerTenantId?: string }>>;
}

function within(value: string | Date | undefined, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export class MemoryCrmActivityRepository implements CrmActivityRepository {
  readonly mode = "memory-test" as const;
  private readonly pipelineHistory: BrokerCrmPipelineHistoryRecord[] = [];
  private readonly notes: BrokerCrmNote[] = [];
  private readonly tasks: BrokerCrmTask[] = [];
  private readonly reminders: BrokerCrmReminder[] = [];
  private readonly documents: BrokerCrmDocument[] = [];
  private readonly proposals: BrokerCrmProposal[] = [];
  private readonly disputes: LeadDisputeRecord[] = [];

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

  async addDispute(dispute: LeadDisputeRecord): Promise<LeadDisputeRecord> {
    if (this.disputes.some((item) => item.leadAssignmentId === dispute.leadAssignmentId)) throw new DisputeAlreadyExistsError();
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

  async disputesForLead(leadAssignmentId: string): Promise<LeadDisputeRecord[]> {
    // Live references on purpose: the retention anonymizer scrubs the comment in place.
    return this.disputes.filter((item) => item.leadAssignmentId === leadAssignmentId);
  }

  async findDispute(id: string): Promise<LeadDisputeRecord | undefined> {
    const found = this.disputes.find((item) => item.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async updateDispute(dispute: LeadDisputeRecord, expectedStatus?: LeadDisputeRecord["status"]): Promise<LeadDisputeRecord> {
    const index = this.disputes.findIndex((item) => item.id === dispute.id);
    if (index < 0) throw new Error("Dispute not found");
    if (expectedStatus && this.disputes[index]?.status !== expectedStatus) throw new DisputeStatusConflictError();
    this.disputes[index] = structuredClone(dispute);
    return structuredClone(dispute);
  }

  async listDisputes(filter: LeadDisputeFilter = {}): Promise<LeadDisputeRecord[]> {
    return this.disputes
      .filter((item) => !filter.status || item.status === filter.status)
      .filter((item) => !filter.partnerTenantId || item.partnerTenantId === filter.partnerTenantId)
      .filter((item) => !filter.from || new Date(item.createdAt) >= filter.from)
      .filter((item) => !filter.to || new Date(item.createdAt) <= filter.to)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => structuredClone(item));
  }

  async openTasksDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmTask & { partnerTenantId?: string }>> {
    return this.tasks.filter((item) => !item.completedAt && within(item.dueAt, from, to));
  }

  async remindersDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmReminder & { partnerTenantId?: string }>> {
    return this.reminders.filter((item) => within(item.remindAt, from, to));
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
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
      eventType: history.eventType,
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

  async addDispute(dispute: LeadDisputeRecord): Promise<LeadDisputeRecord> {
    try {
      return this.toDispute(await this.delegate("brokerCrmDispute").create({ data: this.disputeData(dispute) }));
    } catch (error) {
      // Partial unique index on leadAssignmentId (migration 0030): a concurrent opening won.
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002") throw new DisputeAlreadyExistsError();
      throw error;
    }
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

  async disputesForLead(leadAssignmentId: string): Promise<LeadDisputeRecord[]> {
    return (await this.delegate("brokerCrmDispute").findMany({ where: { leadAssignmentId }, orderBy: { createdAt: "asc" } })).map((row) => this.toDispute(row));
  }

  async findDispute(id: string): Promise<LeadDisputeRecord | undefined> {
    const row = await this.delegate("brokerCrmDispute").findUnique({ where: { id } });
    return row ? this.toDispute(row) : undefined;
  }

  async updateDispute(dispute: LeadDisputeRecord, expectedStatus?: LeadDisputeRecord["status"]): Promise<LeadDisputeRecord> {
    const data: Record<string, unknown> = { ...this.disputeData(dispute) };
    delete data.id;
    if (expectedStatus) {
      const result = await this.delegate("brokerCrmDispute").updateMany({ where: { id: dispute.id, status: expectedStatus }, data });
      if (result.count !== 1) throw new DisputeStatusConflictError();
      return this.toDispute(await this.delegate("brokerCrmDispute").findUnique({ where: { id: dispute.id } }));
    }
    return this.toDispute(await this.delegate("brokerCrmDispute").update({ where: { id: dispute.id }, data }));
  }

  async listDisputes(filter: LeadDisputeFilter = {}): Promise<LeadDisputeRecord[]> {
    const createdAt = filter.from || filter.to ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } : undefined;
    const where = { ...(filter.status ? { status: filter.status } : {}), ...(filter.partnerTenantId ? { partnerTenantId: filter.partnerTenantId } : {}), ...(createdAt ? { createdAt } : {}) };
    return (await this.delegate("brokerCrmDispute").findMany({ where, orderBy: { createdAt: "desc" } })).map((row) => this.toDispute(row));
  }

  async openTasksDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmTask & { partnerTenantId?: string }>> {
    return (await this.delegate("brokerCrmTask").findMany({ where: { completedAt: null, dueAt: { gte: from, lte: to } }, orderBy: { dueAt: "asc" } })).map((row) => this.toTask(row));
  }

  async remindersDueBetween(from: Date, to: Date): Promise<Array<BrokerCrmReminder & { partnerTenantId?: string }>> {
    return (await this.delegate("brokerCrmReminder").findMany({ where: { remindAt: { gte: from, lte: to } }, orderBy: { remindAt: "asc" } })).map((row) => this.toReminder(row));
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
    const item = row as Omit<BrokerCrmPipelineHistoryRecord, "eventType" | "nextStatus" | "previousStatus" | "reason" | "actorId"> & { eventType?: BrokerCrmPipelineHistoryRecord["eventType"] | null; nextStatus?: BrokerCrmPipelineStatus | null; previousStatus?: BrokerCrmPipelineStatus | null; reason?: BrokerCrmOutcomeReason | null; actorId?: string | null };
    // Rows written before the eventType column existed were all status changes.
    return {
      id: item.id,
      leadAssignmentId: item.leadAssignmentId,
      partnerTenantId: item.partnerTenantId,
      eventType: item.eventType ?? "status_changed",
      ...(item.actorId ? { actorId: item.actorId } : {}),
      ...(item.previousStatus ? { previousStatus: item.previousStatus } : {}),
      ...(item.nextStatus ? { nextStatus: item.nextStatus } : {}),
      ...(item.reason ? { reason: item.reason } : {}),
      occurredAt: this.dateString(item.occurredAt)
    };
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
    // Spec 055: the file columns are null for a metadata-only reference; they are left out then.
    const item = Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([, value]) => value !== null)) as BrokerCrmDocument;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }

  private toProposal(row: unknown): BrokerCrmProposal {
    const item = row as BrokerCrmProposal;
    return { ...item, createdAt: this.dateString(item.createdAt) };
  }

  private disputeData(dispute: LeadDisputeRecord) {
    return {
      id: dispute.id,
      leadAssignmentId: dispute.leadAssignmentId,
      partnerTenantId: dispute.partnerTenantId,
      reason: dispute.reason,
      comment: dispute.comment ?? null,
      status: dispute.status,
      source: dispute.source ?? "crm",
      countryCode: dispute.countryCode ?? null,
      createdAt: new Date(dispute.createdAt),
      decidedAt: dispute.decidedAt ? new Date(dispute.decidedAt) : null,
      decidedById: dispute.decidedById ?? null,
      decisionReason: dispute.decisionReason ?? null,
      creditMode: dispute.creditMode ?? null,
      creditNoteId: dispute.creditNoteId ?? null,
      creditPackId: dispute.creditPackId ?? null,
      creditAmount: dispute.creditAmount ?? null
    };
  }

  /** Null columns are left out so the DTO keeps its optional fields absent; internal columns never leak. */
  private toDispute(row: unknown): LeadDisputeRecord {
    const item = row as Record<string, unknown>;
    const text = (key: string): string | undefined => (typeof item[key] === "string" ? (item[key] as string) : undefined);
    const decidedAt = item.decidedAt ? this.dateString(item.decidedAt) : undefined;
    return {
      id: String(item.id),
      leadAssignmentId: String(item.leadAssignmentId),
      partnerTenantId: String(item.partnerTenantId),
      reason: String(item.reason) as LeadDisputeRecord["reason"],
      ...(text("comment") ? { comment: text("comment") as string } : {}),
      status: String(item.status) as LeadDisputeRecord["status"],
      createdAt: this.dateString(item.createdAt),
      source: item.source === "starter" ? "starter" : "crm",
      ...(text("countryCode") ? { countryCode: text("countryCode") as string } : {}),
      ...(decidedAt ? { decidedAt } : {}),
      ...(text("decidedById") ? { decidedById: text("decidedById") as string } : {}),
      ...(text("decisionReason") ? { decisionReason: text("decisionReason") as string } : {}),
      ...(text("creditMode") ? { creditMode: text("creditMode") as NonNullable<LeadDisputeRecord["creditMode"]> } : {}),
      ...(text("creditNoteId") ? { creditNoteId: text("creditNoteId") as string } : {}),
      ...(text("creditPackId") ? { creditPackId: text("creditPackId") as string } : {}),
      ...(typeof item.creditAmount === "number" ? { creditAmount: item.creditAmount } : {})
    };
  }
}
