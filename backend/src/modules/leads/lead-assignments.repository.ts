import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { BrokerStarterLeadHistoryEvent } from "../../../../packages/shared/contracts/quote.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { LeadAssignmentRecord, LeadAssignmentStatus } from "./lead-assignment.service";

export const LEAD_ASSIGNMENTS_REPOSITORY = Symbol("LEAD_ASSIGNMENTS_REPOSITORY");

export interface LeadAssignmentHistoryRecord extends BrokerStarterLeadHistoryEvent {
  leadAssignmentId: string;
  partnerTenantId: string;
  actorId?: string;
}

export interface LeadAssignmentsRepository extends RuntimeRepository {
  create(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord>;
  update(id: string, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord>;
  activeCountForPartner(partnerTenantId: string): Promise<number>;
  list(): Promise<LeadAssignmentRecord[]>;
  require(id: string): Promise<LeadAssignmentRecord>;
  updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord>;
  appendHistory(event: LeadAssignmentHistoryRecord): Promise<LeadAssignmentHistoryRecord>;
  historyForLead(leadAssignmentId: string): Promise<LeadAssignmentHistoryRecord[]>;
  historyForTenant(partnerTenantId: string): Promise<LeadAssignmentHistoryRecord[]>;
}

export class MemoryLeadAssignmentsRepository implements LeadAssignmentsRepository {
  readonly mode = "memory-test" as const;
  private readonly assignments: LeadAssignmentRecord[] = [];
  private readonly history: LeadAssignmentHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "LeadAssignmentsRepository");
  }

  async create(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord> {
    if (this.assignments.some((candidate) => candidate.quoteRequestId === assignment.quoteRequestId && candidate.status !== "closed")) {
      throw new Error("Quote request already has an active lead assignment");
    }
    this.assignments.push(assignment);
    return assignment;
  }

  async update(id: string, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord> {
    const assignment = await this.require(id);
    Object.assign(assignment, update);
    return assignment;
  }

  async activeCountForPartner(partnerTenantId: string): Promise<number> {
    return this.assignments.filter((assignment) => assignment.partnerTenantId === partnerTenantId && assignment.status !== "closed").length;
  }

  async list(): Promise<LeadAssignmentRecord[]> {
    return [...this.assignments];
  }

  async require(id: string): Promise<LeadAssignmentRecord> {
    const assignment = this.assignments.find((candidate) => candidate.id === id);
    if (!assignment) throw new Error(`Lead assignment ${id} not found`);
    return assignment;
  }

  async updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord> {
    return this.update(id, { ...update, status });
  }

  async appendHistory(event: LeadAssignmentHistoryRecord): Promise<LeadAssignmentHistoryRecord> {
    this.history.push(event);
    return event;
  }

  async historyForLead(leadAssignmentId: string): Promise<LeadAssignmentHistoryRecord[]> {
    return this.history.filter((event) => event.leadAssignmentId === leadAssignmentId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async historyForTenant(partnerTenantId: string): Promise<LeadAssignmentHistoryRecord[]> {
    return this.history.filter((event) => event.partnerTenantId === partnerTenantId);
  }
}

type LeadAssignmentDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  count(input?: unknown): Promise<number>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type LeadActionHistoryDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaLeadAssignmentsRepository implements LeadAssignmentsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord> {
    return this.toDomain(await this.assignments().create({ data: this.toPrisma(assignment) }));
  }

  async update(id: string, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord> {
    return this.toDomain(await this.assignments().update({ where: { id }, data: this.toPrismaUpdate(update) }));
  }

  async activeCountForPartner(partnerTenantId: string): Promise<number> {
    return this.assignments().count({ where: { partnerTenantId, status: { not: "closed" } } });
  }

  async list(): Promise<LeadAssignmentRecord[]> {
    return (await this.assignments().findMany({ orderBy: { assignedAt: "desc" } })).map((row) => this.toDomain(row));
  }

  async require(id: string): Promise<LeadAssignmentRecord> {
    const row = await this.assignments().findUnique({ where: { id } });
    if (!row) throw new Error(`Lead assignment ${id} not found`);
    return this.toDomain(row);
  }

  async updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord> {
    return this.update(id, { ...update, status });
  }

  async appendHistory(event: LeadAssignmentHistoryRecord): Promise<LeadAssignmentHistoryRecord> {
    return this.toHistory(await this.history().create({ data: this.toPrismaHistory(event) }));
  }

  async historyForLead(leadAssignmentId: string): Promise<LeadAssignmentHistoryRecord[]> {
    return (await this.history().findMany({ where: { leadAssignmentId }, orderBy: { occurredAt: "asc" } })).map((row) => this.toHistory(row));
  }

  async historyForTenant(partnerTenantId: string): Promise<LeadAssignmentHistoryRecord[]> {
    return (await this.history().findMany({ where: { partnerTenantId }, orderBy: { occurredAt: "desc" } })).map((row) => this.toHistory(row));
  }

  private assignments(): LeadAssignmentDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadAssignment: LeadAssignmentDelegate }).leadAssignment;
  }

  private history(): LeadActionHistoryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadActionHistory: LeadActionHistoryDelegate }).leadActionHistory;
  }

  private toPrisma(assignment: LeadAssignmentRecord): Record<string, unknown> {
    const data = { ...assignment } as Record<string, unknown>;
    delete data.publicReference;
    delete data.countryCode;
    delete data.productKey;
    delete data.contact;
    delete data.answers;
    delete data.consentRecordId;
    delete data.crmStatus;
    delete data.urgency;
    delete data.source;
    delete data.assignedAdvisorId;
    delete data.crmUpdatedAt;
    delete data.tags;
    return data;
  }

  private toPrismaUpdate(update: Partial<LeadAssignmentRecord>): Record<string, unknown> {
    const data = this.toPrisma(update as LeadAssignmentRecord);
    delete data.id;
    delete data.createdAt;
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private toPrismaHistory(event: LeadAssignmentHistoryRecord): Record<string, unknown> {
    return {
      id: event.id,
      leadAssignmentId: event.leadAssignmentId,
      partnerTenantId: event.partnerTenantId,
      actorId: event.actorId,
      eventType: event.eventType,
      previousStatus: event.previousStatus,
      nextStatus: event.nextStatus,
      reason: event.reason,
      comment: event.comment,
      context: {},
      occurredAt: new Date(event.occurredAt),
      createdAt: new Date()
    };
  }

  private toDomain(row: unknown): LeadAssignmentRecord {
    return row as LeadAssignmentRecord;
  }

  private toHistory(row: unknown): LeadAssignmentHistoryRecord {
    return row as LeadAssignmentHistoryRecord;
  }
}
