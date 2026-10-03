import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { VisitorDeclineReason, VisitorResponseType } from "../../../../packages/shared/contracts/lead-proposals";

export type LeadProposalStoredStatus = "sent" | "viewed" | "responded" | "withdrawn";
export type LeadProposalChannel = "starter" | "crm";
export type ScanStatus = "pending" | "clean" | "infected" | "failed";

export interface LeadProposalDocument {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  scanStatus: ScanStatus;
  scanEngine?: string | undefined;
  scannedAt?: Date | undefined;
}

/**
 * Spec 055: a sent proposal. The content (message, amounts, guarantees, validity, document) never
 * changes after creation; only the lifecycle fields below do (FR-003).
 */
export interface LeadProposalRecord {
  id: string;
  leadAssignmentId: string;
  quoteRequestId: string;
  /** Broker that sent it; differs from the assignment's partner after a reassignment. */
  partnerTenantId: string;
  authorId?: string | undefined;
  channel: LeadProposalChannel;
  status: LeadProposalStoredStatus;
  message: string;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  currency: string;
  guarantees: string[];
  validUntil: Date;
  nonContractual: true;
  document?: LeadProposalDocument | undefined;
  sentAt: Date;
  viewedAt?: Date | undefined;
  respondedAt?: Date | undefined;
  withdrawnAt?: Date | undefined;
  withdrawnById?: string | undefined;
  withdrawReason?: string | undefined;
  anonymizedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/** The only fields a sent proposal may still change. */
export type LeadProposalLifecyclePatch = Partial<Pick<LeadProposalRecord, "status" | "viewedAt" | "respondedAt" | "withdrawnAt" | "withdrawnById" | "withdrawReason">>;

export interface VisitorProposalResponseRecord {
  id: string;
  proposalId: string;
  leadAssignmentId: string;
  quoteRequestId: string;
  partnerTenantId: string;
  type: VisitorResponseType;
  callbackSlot?: string | undefined;
  declineReason?: VisitorDeclineReason | undefined;
  question?: string | undefined;
  createdAt: Date;
}

export interface LeadProposalsRepository extends RuntimeRepository {
  create(record: LeadProposalRecord): Promise<LeadProposalRecord>;
  find(id: string): Promise<LeadProposalRecord | undefined>;
  updateLifecycle(id: string, patch: LeadProposalLifecyclePatch): Promise<LeadProposalRecord>;
  listForAssignment(leadAssignmentId: string): Promise<LeadProposalRecord[]>;
  listForQuote(quoteRequestId: string): Promise<LeadProposalRecord[]>;
  addResponse(record: VisitorProposalResponseRecord): Promise<VisitorProposalResponseRecord>;
  responsesForProposals(proposalIds: readonly string[]): Promise<VisitorProposalResponseRecord[]>;
  /** Spec 046 policy: free text written for or by the visitor is scrubbed; the facts stay. */
  anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void>;
}

const LIFECYCLE_KEYS = ["status", "viewedAt", "respondedAt", "withdrawnAt", "withdrawnById", "withdrawReason"] as const;

function lifecycleOnly(patch: LeadProposalLifecyclePatch): LeadProposalLifecyclePatch {
  const result: Record<string, unknown> = {};
  for (const key of LIFECYCLE_KEYS) if (patch[key] !== undefined) result[key] = patch[key];
  return result as LeadProposalLifecyclePatch;
}

function copy(record: LeadProposalRecord): LeadProposalRecord {
  return { ...record, guarantees: [...record.guarantees], ...(record.document ? { document: { ...record.document } } : {}) };
}

export class MemoryLeadProposalsRepository implements LeadProposalsRepository {
  readonly mode = "memory-test" as const;
  private readonly proposals: LeadProposalRecord[] = [];
  private readonly responses: VisitorProposalResponseRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "LeadProposalsRepository");
  }

  async create(record: LeadProposalRecord): Promise<LeadProposalRecord> {
    this.proposals.push(copy(record));
    return copy(record);
  }

  async find(id: string): Promise<LeadProposalRecord | undefined> {
    const found = this.proposals.find((proposal) => proposal.id === id);
    return found ? copy(found) : undefined;
  }

  async updateLifecycle(id: string, patch: LeadProposalLifecyclePatch): Promise<LeadProposalRecord> {
    const found = this.proposals.find((proposal) => proposal.id === id);
    if (!found) throw new Error(`Lead proposal ${id} not found`);
    Object.assign(found, lifecycleOnly(patch), { updatedAt: new Date() });
    return copy(found);
  }

  async listForAssignment(leadAssignmentId: string): Promise<LeadProposalRecord[]> {
    return this.sorted(this.proposals.filter((proposal) => proposal.leadAssignmentId === leadAssignmentId));
  }

  async listForQuote(quoteRequestId: string): Promise<LeadProposalRecord[]> {
    return this.sorted(this.proposals.filter((proposal) => proposal.quoteRequestId === quoteRequestId));
  }

  async addResponse(record: VisitorProposalResponseRecord): Promise<VisitorProposalResponseRecord> {
    this.responses.push({ ...record });
    return { ...record };
  }

  async responsesForProposals(proposalIds: readonly string[]): Promise<VisitorProposalResponseRecord[]> {
    const ids = new Set(proposalIds);
    return this.responses.filter((response) => ids.has(response.proposalId)).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).map((response) => ({ ...response }));
  }

  async anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    const ids = new Set(leadAssignmentIds);
    for (const proposal of this.proposals) {
      if (!ids.has(proposal.leadAssignmentId)) continue;
      proposal.message = marker;
      proposal.guarantees = [];
      delete proposal.withdrawReason;
      if (proposal.document) proposal.document.fileName = marker;
      proposal.anonymizedAt = now;
    }
    for (const response of this.responses) {
      if (!ids.has(response.leadAssignmentId)) continue;
      delete response.callbackSlot;
      delete response.question;
    }
  }

  private sorted(rows: LeadProposalRecord[]): LeadProposalRecord[] {
    return rows.sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime()).map(copy);
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  findUnique(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

type ProposalRow = Omit<LeadProposalRecord, "document" | "priceMin" | "priceMax"> & {
  priceMin: unknown;
  priceMax: unknown;
  documentStorageKey: string | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  documentSizeBytes: number | null;
  documentChecksum: string | null;
  documentScanStatus: string | null;
  documentScanEngine: string | null;
  documentScannedAt: Date | null;
};

function decimal(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(typeof value === "object" ? String(value) : value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)) as T;
}

export class PrismaLeadProposalsRepository implements LeadProposalsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: LeadProposalRecord): Promise<LeadProposalRecord> {
    const { document, ...rest } = record;
    const row = await this.proposalsTable().create({
      data: {
        ...rest,
        ...(document ? {
          documentStorageKey: document.storageKey,
          documentFileName: document.fileName,
          documentMimeType: document.mimeType,
          documentSizeBytes: document.sizeBytes,
          documentChecksum: document.checksum,
          documentScanStatus: document.scanStatus,
          documentScanEngine: document.scanEngine,
          documentScannedAt: document.scannedAt
        } : {})
      }
    });
    return this.toRecord(row);
  }

  async find(id: string): Promise<LeadProposalRecord | undefined> {
    const row = await this.proposalsTable().findUnique({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async updateLifecycle(id: string, patch: LeadProposalLifecyclePatch): Promise<LeadProposalRecord> {
    return this.toRecord(await this.proposalsTable().update({ where: { id }, data: lifecycleOnly(patch) }));
  }

  async listForAssignment(leadAssignmentId: string): Promise<LeadProposalRecord[]> {
    return (await this.proposalsTable().findMany({ where: { leadAssignmentId }, orderBy: { sentAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async listForQuote(quoteRequestId: string): Promise<LeadProposalRecord[]> {
    return (await this.proposalsTable().findMany({ where: { quoteRequestId }, orderBy: { sentAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async addResponse(record: VisitorProposalResponseRecord): Promise<VisitorProposalResponseRecord> {
    return defined(await this.responsesTable().create({ data: { ...record } }) as unknown as Record<string, unknown>) as unknown as VisitorProposalResponseRecord;
  }

  async responsesForProposals(proposalIds: readonly string[]): Promise<VisitorProposalResponseRecord[]> {
    if (proposalIds.length === 0) return [];
    return (await this.responsesTable().findMany({ where: { proposalId: { in: [...proposalIds] } }, orderBy: { createdAt: "asc" } }))
      .map((row) => defined(row as Record<string, unknown>) as unknown as VisitorProposalResponseRecord);
  }

  async anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    if (leadAssignmentIds.length === 0) return;
    const where = { leadAssignmentId: { in: [...leadAssignmentIds] } };
    await this.proposalsTable().updateMany({ where, data: { message: marker, guarantees: [], withdrawReason: null, documentFileName: marker, anonymizedAt: now } });
    await this.responsesTable().updateMany({ where, data: { callbackSlot: null, question: null } });
  }

  private toRecord(raw: unknown): LeadProposalRecord {
    const row = raw as ProposalRow;
    const { documentStorageKey, documentFileName, documentMimeType, documentSizeBytes, documentChecksum, documentScanStatus, documentScanEngine, documentScannedAt, priceMin, priceMax, ...rest } = row;
    const base = defined(rest as unknown as Record<string, unknown>) as unknown as LeadProposalRecord;
    const min = decimal(priceMin);
    const max = decimal(priceMax);
    return {
      ...base,
      guarantees: Array.isArray(rest.guarantees) ? [...rest.guarantees] : [],
      nonContractual: true,
      ...(min !== undefined ? { priceMin: min } : {}),
      ...(max !== undefined ? { priceMax: max } : {}),
      ...(documentStorageKey ? {
        document: {
          storageKey: documentStorageKey,
          fileName: documentFileName ?? "proposition.pdf",
          mimeType: documentMimeType ?? "application/pdf",
          sizeBytes: documentSizeBytes ?? 0,
          checksum: documentChecksum ?? "",
          scanStatus: (documentScanStatus ?? "pending") as ScanStatus,
          ...(documentScanEngine ? { scanEngine: documentScanEngine } : {}),
          ...(documentScannedAt ? { scannedAt: documentScannedAt } : {})
        }
      } : {})
    };
  }

  private proposalsTable(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadProposal: Delegate }).leadProposal;
  }

  private responsesTable(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { visitorProposalResponse: Delegate }).visitorProposalResponse;
  }
}
