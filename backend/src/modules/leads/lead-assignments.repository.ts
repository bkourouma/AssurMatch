import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { BrokerStarterLeadHistoryEvent } from "../../../../packages/shared/contracts/quote.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RoutingPartnerStats } from "../routing/routing-strategy";
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
  /** Leads assigned in the month containing `now`, excluding rejected and disputed ones. */
  monthlyCountForPartner(partnerTenantId: string, now: Date): Promise<number>;
  routingStatsForPartners(partnerTenantIds: string[], now: Date): Promise<Map<string, RoutingPartnerStats>>;
  list(): Promise<LeadAssignmentRecord[]>;
  require(id: string): Promise<LeadAssignmentRecord>;
  updateStatus(id: string, status: LeadAssignmentStatus, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord>;
  appendHistory(event: LeadAssignmentHistoryRecord): Promise<LeadAssignmentHistoryRecord>;
  historyForLead(leadAssignmentId: string): Promise<LeadAssignmentHistoryRecord[]>;
  historyForTenant(partnerTenantId: string): Promise<LeadAssignmentHistoryRecord[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUOTA_EXEMPT_STATUSES: ReadonlySet<LeadAssignmentStatus> = new Set(["rejected", "disputed"]);
const ACCEPTED_STATUSES: ReadonlySet<LeadAssignmentStatus> = new Set(["accepted", "received", "contacted", "closed"]);

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function countsTowardsMonthlyQuota(assignment: Pick<LeadAssignmentRecord, "assignedAt" | "status">, now: Date): boolean {
  return assignment.assignedAt >= monthStart(now) && assignment.assignedAt <= now && !QUOTA_EXEMPT_STATUSES.has(assignment.status);
}

/** Shared between the memory and Prisma repositories so both rank partners identically. */
export function computeRoutingStats(assignments: readonly LeadAssignmentRecord[], partnerTenantIds: readonly string[], now: Date): Map<string, RoutingPartnerStats> {
  const windowStart = new Date(now.getTime() - 90 * DAY_MS);
  const stats = new Map<string, RoutingPartnerStats & { firstActionSamples: number[] }>();
  for (const partnerTenantId of partnerTenantIds) stats.set(partnerTenantId, { monthlyCount: 0, received90d: 0, accepted90d: 0, firstActionSamples: [] });
  for (const assignment of assignments) {
    const entry = stats.get(assignment.partnerTenantId);
    if (!entry) continue;
    if (!entry.lastAssignedAt || assignment.assignedAt > entry.lastAssignedAt) entry.lastAssignedAt = assignment.assignedAt;
    if (countsTowardsMonthlyQuota(assignment, now)) entry.monthlyCount += 1;
    if (assignment.assignedAt < windowStart) continue;
    entry.received90d += 1;
    if (ACCEPTED_STATUSES.has(assignment.status) || assignment.acceptedAt) entry.accepted90d += 1;
    const firstAction = assignment.seenAt ?? assignment.acceptedAt ?? assignment.lastBrokerActionAt;
    if (firstAction) entry.firstActionSamples.push(Math.max(0, (firstAction.getTime() - assignment.assignedAt.getTime()) / 60_000));
  }
  return new Map([...stats.entries()].map(([partnerTenantId, { firstActionSamples, ...entry }]) => [partnerTenantId, {
    ...entry,
    ...(firstActionSamples.length > 0
      ? { averageFirstActionMinutes: firstActionSamples.reduce((sum, minutes) => sum + minutes, 0) / firstActionSamples.length }
      : {})
  }]));
}

export class MemoryLeadAssignmentsRepository implements LeadAssignmentsRepository {
  readonly mode = "memory-test" as const;
  private readonly assignments: LeadAssignmentRecord[] = [];
  private readonly history: LeadAssignmentHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "LeadAssignmentsRepository");
  }

  async create(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord> {
    // Spec 042: a request may reach several partners, but never the same partner twice.
    if (this.assignments.some((candidate) =>
      candidate.quoteRequestId === assignment.quoteRequestId
      && candidate.partnerTenantId === assignment.partnerTenantId
      && candidate.status !== "closed"
    )) {
      throw new Error("Quote request already has an active lead assignment for this partner");
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

  async monthlyCountForPartner(partnerTenantId: string, now: Date): Promise<number> {
    return this.assignments.filter((assignment) => assignment.partnerTenantId === partnerTenantId && countsTowardsMonthlyQuota(assignment, now)).length;
  }

  async routingStatsForPartners(partnerTenantIds: string[], now: Date): Promise<Map<string, RoutingPartnerStats>> {
    return computeRoutingStats(this.assignments, partnerTenantIds, now);
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

type ReadDelegate = {
  findMany(input?: unknown): Promise<unknown[]>;
};

interface QuoteRequestProjection {
  id: string;
  publicReference: string;
  countryId: string;
  productId: string;
  prospectId: string;
  consentRecordId: string;
  payload?: unknown;
}

interface ProspectProjection {
  id: string;
  displayName?: string | null;
  emailNormalized?: string | null;
  phoneNormalized?: string | null;
  preferredContactChannel?: string | null;
}

interface CountryProjection {
  id: string;
  isoCode: string;
}

interface ProductProjection {
  id: string;
  key: string;
}

interface CrmStateProjection {
  leadAssignmentId: string;
  status?: LeadAssignmentRecord["crmStatus"];
  urgency?: LeadAssignmentRecord["urgency"];
  source?: LeadAssignmentRecord["source"];
  assignedAdvisorId?: string | null;
  tags?: string[];
  updatedAt?: Date;
}

export class PrismaLeadAssignmentsRepository implements LeadAssignmentsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord> {
    return this.enrichOne(this.toDomain(await this.assignments().create({ data: this.toPrisma(assignment) })));
  }

  async update(id: string, update: Partial<LeadAssignmentRecord>): Promise<LeadAssignmentRecord> {
    return this.enrichOne(this.toDomain(await this.assignments().update({ where: { id }, data: this.toPrismaUpdate(update) })));
  }

  async activeCountForPartner(partnerTenantId: string): Promise<number> {
    return this.assignments().count({ where: { partnerTenantId, status: { not: "closed" } } });
  }

  async monthlyCountForPartner(partnerTenantId: string, now: Date): Promise<number> {
    return this.assignments().count({
      where: { partnerTenantId, assignedAt: { gte: monthStart(now), lte: now }, status: { notIn: [...QUOTA_EXEMPT_STATUSES] } }
    });
  }

  async routingStatsForPartners(partnerTenantIds: string[], now: Date): Promise<Map<string, RoutingPartnerStats>> {
    if (partnerTenantIds.length === 0) return new Map();
    // Ninety days covers every window the strategies use; older leads only matter for
    // last-assignment ordering, where "older than the window" already sorts first.
    const rows = await this.assignments().findMany({
      where: { partnerTenantId: { in: partnerTenantIds }, assignedAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      select: { partnerTenantId: true, assignedAt: true, status: true, acceptedAt: true, seenAt: true, lastBrokerActionAt: true }
    });
    return computeRoutingStats(rows.map((row) => this.toDomain(row)), partnerTenantIds, now);
  }

  async list(): Promise<LeadAssignmentRecord[]> {
    return this.enrichMany((await this.assignments().findMany({ orderBy: { assignedAt: "desc" } })).map((row) => this.toDomain(row)));
  }

  async require(id: string): Promise<LeadAssignmentRecord> {
    const row = await this.assignments().findUnique({ where: { id } });
    if (!row) throw new Error(`Lead assignment ${id} not found`);
    return this.enrichOne(this.toDomain(row));
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

  private delegate(name: string): ReadDelegate | undefined {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, ReadDelegate | undefined>)[name];
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

  private async enrichOne(assignment: LeadAssignmentRecord): Promise<LeadAssignmentRecord> {
    const [enriched] = await this.enrichMany([assignment]);
    if (!enriched) throw new Error(`Lead assignment ${assignment.id} not found`);
    return enriched;
  }

  private async enrichMany(assignments: LeadAssignmentRecord[]): Promise<LeadAssignmentRecord[]> {
    if (assignments.length === 0) return assignments;
    const quoteDelegate = this.delegate("quoteRequest");
    if (!quoteDelegate) return assignments;

    const quoteIds = [...new Set(assignments.map((assignment) => assignment.quoteRequestId))];
    const quoteRows = (await quoteDelegate.findMany({ where: { id: { in: quoteIds } } })).map((row) => row as QuoteRequestProjection);
    const quoteById = new Map(quoteRows.map((quote) => [quote.id, quote]));
    const countries = await this.readCountries(quoteRows);
    const products = await this.readProducts(quoteRows);
    const prospects = await this.readProspects(quoteRows);
    const crmStates = await this.readCrmStates(assignments);

    return assignments.map((assignment) => {
      const quote = quoteById.get(assignment.quoteRequestId);
      const payload = this.payloadObject(quote?.payload);
      const contact = this.contactFromPayload(payload);
      const answers = this.answersFromPayload(payload);
      const prospect = quote ? prospects.get(quote.prospectId) : undefined;
      const country = quote ? countries.get(quote.countryId) : undefined;
      const product = quote ? products.get(quote.productId) : undefined;
      const crm = crmStates.get(assignment.id);
      return {
        ...assignment,
        ...(quote?.publicReference ? { publicReference: quote.publicReference } : {}),
        ...(country?.isoCode ? { countryCode: country.isoCode } : {}),
        ...(product?.key ? { productKey: product.key } : {}),
        ...(quote?.consentRecordId ? { consentRecordId: quote.consentRecordId } : {}),
        contact: {
          ...contact,
          ...(prospect?.displayName && !contact.displayName ? { displayName: prospect.displayName } : {}),
          ...(prospect?.emailNormalized && !contact.email ? { email: prospect.emailNormalized } : {}),
          ...(prospect?.phoneNormalized && !contact.phone ? { phone: prospect.phoneNormalized } : {}),
          ...(prospect?.preferredContactChannel && !contact.preferredContactChannel ? { preferredContactChannel: prospect.preferredContactChannel } : {})
        },
        answers,
        ...(crm?.status ? { crmStatus: crm.status } : {}),
        ...(crm?.urgency ? { urgency: crm.urgency } : {}),
        ...(crm?.source ? { source: crm.source } : {}),
        ...(crm?.assignedAdvisorId ? { assignedAdvisorId: crm.assignedAdvisorId } : {}),
        ...(crm?.updatedAt ? { crmUpdatedAt: crm.updatedAt } : {}),
        ...(crm?.tags ? { tags: crm.tags } : {})
      };
    });
  }

  private async readCountries(quotes: QuoteRequestProjection[]): Promise<Map<string, CountryProjection>> {
    const delegate = this.delegate("country");
    if (!delegate) return new Map();
    const ids = [...new Set(quotes.map((quote) => quote.countryId))];
    if (ids.length === 0) return new Map();
    const rows = (await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, isoCode: true } })).map((row) => row as CountryProjection);
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async readProducts(quotes: QuoteRequestProjection[]): Promise<Map<string, ProductProjection>> {
    const delegate = this.delegate("product");
    if (!delegate) return new Map();
    const ids = [...new Set(quotes.map((quote) => quote.productId))];
    if (ids.length === 0) return new Map();
    const rows = (await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } })).map((row) => row as ProductProjection);
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async readProspects(quotes: QuoteRequestProjection[]): Promise<Map<string, ProspectProjection>> {
    const delegate = this.delegate("prospect");
    if (!delegate) return new Map();
    const ids = [...new Set(quotes.map((quote) => quote.prospectId))];
    if (ids.length === 0) return new Map();
    const rows = (await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, emailNormalized: true, phoneNormalized: true, preferredContactChannel: true } })).map((row) => row as ProspectProjection);
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async readCrmStates(assignments: LeadAssignmentRecord[]): Promise<Map<string, CrmStateProjection>> {
    const delegate = this.delegate("brokerCrmLeadState");
    if (!delegate) return new Map();
    const ids = assignments.map((assignment) => assignment.id);
    const rows = (await delegate.findMany({ where: { leadAssignmentId: { in: ids } } })).map((row) => row as CrmStateProjection);
    return new Map(rows.map((row) => [row.leadAssignmentId, row]));
  }

  private payloadObject(payload: unknown): Record<string, unknown> {
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  }

  private contactFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const contact = payload.contact;
    return contact && typeof contact === "object" && !Array.isArray(contact) ? contact as Record<string, unknown> : {};
  }

  private answersFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const answers = payload.answers;
    return answers && typeof answers === "object" && !Array.isArray(answers) ? answers as Record<string, unknown> : {};
  }

  private toHistory(row: unknown): LeadAssignmentHistoryRecord {
    return row as LeadAssignmentHistoryRecord;
  }
}
