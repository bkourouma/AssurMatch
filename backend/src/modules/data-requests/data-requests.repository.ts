import type { DataRequestStatus, DataRequestType } from "../../../../packages/shared/contracts/data-requests";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

/**
 * Spec 062 (D-10): one visitor data-subject request. `detail` and `decisionNote` are personal or
 * internal free text: they are the only fields the spec 046 anonymization replaces; the reference,
 * type, status and timestamps stay as the minimal proof that the request was handled.
 */
export interface DataRequestRecord {
  id: string;
  reference: string;
  quoteRequestId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  detail?: string | undefined;
  locale: "fr" | "en";
  dueAt: Date;
  acknowledgedAt?: Date | undefined;
  reviewedById?: string | undefined;
  reviewedAt?: Date | undefined;
  decidedById?: string | undefined;
  decidedAt?: Date | undefined;
  decisionNote?: string | undefined;
  erasureBatchId?: string | undefined;
  anonymizedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataRequestListFilter {
  status?: DataRequestStatus | undefined;
  type?: DataRequestType | undefined;
  /** Rows strictly older than this position in the (createdAt, id) descending order. */
  after?: { createdAt: Date; id: string } | undefined;
  limit: number;
}

/** The only fields a workflow transition writes. */
export interface DataRequestTransitionPatch {
  status: DataRequestStatus;
  reviewedById?: string | undefined;
  reviewedAt?: Date | undefined;
  decidedById?: string | undefined;
  decidedAt?: Date | undefined;
  decisionNote?: string | undefined;
  erasureBatchId?: string | undefined;
}

/** What the spec 046 retention reads and scrubs (a structural subset, see `MemoryRetentionSources`). */
export interface DataRequestRetentionSource {
  listAll(): Promise<DataRequestRecord[]>;
  anonymizeById(id: string, marker: string, now: Date): Promise<boolean>;
  anonymizeForQuote(quoteRequestId: string, marker: string, now: Date): Promise<void>;
}

export interface DataRequestsRepository extends RuntimeRepository, DataRequestRetentionSource {
  /**
   * Throws `DuplicateDataRequestReferenceError` on a reference collision (the caller retries with another
   * one) and `OpenDataRequestExistsError` when an open request of this type already exists for the quote
   * request (the concurrent creation that lost).
   */
  create(record: DataRequestRecord): Promise<DataRequestRecord>;
  find(id: string): Promise<DataRequestRecord | undefined>;
  /** The open (`received` or `in_review`) request of this type for the quote request, if any. */
  findOpen(quoteRequestId: string, type: DataRequestType): Promise<DataRequestRecord | undefined>;
  listForQuote(quoteRequestId: string): Promise<DataRequestRecord[]>;
  /** Newest first (`createdAt` then `id` descending); the caller asks for `limit + 1` rows to detect a next page. */
  list(filter: DataRequestListFilter): Promise<DataRequestRecord[]>;
  markAcknowledged(id: string, at: Date): Promise<void>;
  /** One conditional write: applied only while the request is still in one of `from`. */
  transition(id: string, from: readonly DataRequestStatus[], patch: DataRequestTransitionPatch, at: Date): Promise<DataRequestRecord | undefined>;
}

export class DuplicateDataRequestReferenceError extends Error {
  constructor() {
    super("Data request reference already exists");
    this.name = "DuplicateDataRequestReferenceError";
  }
}

/**
 * An open (`received` / `in_review`) request of the same type already exists for the quote request
 * (partial unique index `DataRequest_open_quote_type_key`): two concurrent creations, only one wins.
 * `reference` is the reference of the request that won, when the repository could read it.
 */
export class OpenDataRequestExistsError extends Error {
  constructor(readonly reference?: string) {
    super("An open data request of this type already exists");
    this.name = "OpenDataRequestExistsError";
  }
}

function byNewest(left: DataRequestRecord, right: DataRequestRecord): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function copy(record: DataRequestRecord): DataRequestRecord {
  return { ...record };
}

function applyPatch(record: DataRequestRecord, patch: DataRequestTransitionPatch, at: Date): void {
  record.status = patch.status;
  if (patch.reviewedById !== undefined) record.reviewedById = patch.reviewedById;
  if (patch.reviewedAt !== undefined) record.reviewedAt = patch.reviewedAt;
  if (patch.decidedById !== undefined) record.decidedById = patch.decidedById;
  if (patch.decidedAt !== undefined) record.decidedAt = patch.decidedAt;
  if (patch.decisionNote !== undefined) record.decisionNote = patch.decisionNote;
  if (patch.erasureBatchId !== undefined) record.erasureBatchId = patch.erasureBatchId;
  record.updatedAt = at;
}

export class MemoryDataRequestsRepository implements DataRequestsRepository {
  readonly mode = "memory-test" as const;
  private readonly records: DataRequestRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "DataRequestsRepository");
  }

  async create(record: DataRequestRecord): Promise<DataRequestRecord> {
    if (this.records.some((candidate) => candidate.reference === record.reference)) throw new DuplicateDataRequestReferenceError();
    const open = this.records.find((candidate) => candidate.quoteRequestId === record.quoteRequestId && candidate.type === record.type && (candidate.status === "received" || candidate.status === "in_review"));
    if (open && (record.status === "received" || record.status === "in_review")) throw new OpenDataRequestExistsError(open.reference);
    this.records.push(copy(record));
    return copy(record);
  }

  async find(id: string): Promise<DataRequestRecord | undefined> {
    const found = this.records.find((record) => record.id === id);
    return found ? copy(found) : undefined;
  }

  async findOpen(quoteRequestId: string, type: DataRequestType): Promise<DataRequestRecord | undefined> {
    const found = this.records.find((record) => record.quoteRequestId === quoteRequestId && record.type === type && (record.status === "received" || record.status === "in_review"));
    return found ? copy(found) : undefined;
  }

  async listForQuote(quoteRequestId: string): Promise<DataRequestRecord[]> {
    return this.records.filter((record) => record.quoteRequestId === quoteRequestId).sort(byNewest).map(copy);
  }

  async list(filter: DataRequestListFilter): Promise<DataRequestRecord[]> {
    const { after } = filter;
    return this.records
      .filter((record) => !filter.status || record.status === filter.status)
      .filter((record) => !filter.type || record.type === filter.type)
      .sort(byNewest)
      .filter((record) => !after || record.createdAt.getTime() < after.createdAt.getTime() || (record.createdAt.getTime() === after.createdAt.getTime() && record.id.localeCompare(after.id) < 0))
      .slice(0, filter.limit)
      .map(copy);
  }

  async markAcknowledged(id: string, at: Date): Promise<void> {
    const found = this.records.find((record) => record.id === id);
    if (found && !found.acknowledgedAt) {
      found.acknowledgedAt = at;
      found.updatedAt = at;
    }
  }

  async transition(id: string, from: readonly DataRequestStatus[], patch: DataRequestTransitionPatch, at: Date): Promise<DataRequestRecord | undefined> {
    const found = this.records.find((record) => record.id === id);
    if (!found || !from.includes(found.status)) return undefined;
    applyPatch(found, patch, at);
    return copy(found);
  }

  async listAll(): Promise<DataRequestRecord[]> {
    return this.records.map(copy);
  }

  async anonymizeById(id: string, marker: string, now: Date): Promise<boolean> {
    const found = this.records.find((record) => record.id === id);
    if (!found || found.anonymizedAt) return false;
    this.scrub(found, marker, now);
    return true;
  }

  async anonymizeForQuote(quoteRequestId: string, marker: string, now: Date): Promise<void> {
    for (const record of this.records) {
      if (record.quoteRequestId === quoteRequestId && !record.anonymizedAt) this.scrub(record, marker, now);
    }
  }

  private scrub(record: DataRequestRecord, marker: string, now: Date): void {
    if (record.detail !== undefined) record.detail = marker;
    if (record.decisionNote !== undefined) record.decisionNote = marker;
    record.anonymizedAt = now;
    record.updatedAt = now;
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  updateMany(input: unknown): Promise<{ count: number }>;
};

/** Prisma returns `null` for empty optional columns; the domain record leaves them out. */
function toDomain(row: unknown): DataRequestRecord {
  const record = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(record)) {
    if (value === null) delete record[key];
  }
  return record as unknown as DataRequestRecord;
}

const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }];

export class PrismaDataRequestsRepository implements DataRequestsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: DataRequestRecord): Promise<DataRequestRecord> {
    try {
      return toDomain(await this.table().create({ data: { ...record } }));
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      // P2002 is either the unique `reference` or the partial unique index of the open request
      // (quote request + type, migration 0031): the second one means a concurrent creation won.
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      const onReference = Array.isArray(target) ? target.includes("reference") : typeof target === "string" && target.includes("reference");
      if (onReference) throw new DuplicateDataRequestReferenceError();
      const open = await this.findOpen(record.quoteRequestId, record.type);
      if (open && open.reference !== record.reference) throw new OpenDataRequestExistsError(open.reference);
      throw new DuplicateDataRequestReferenceError();
    }
  }

  async find(id: string): Promise<DataRequestRecord | undefined> {
    const row = await this.table().findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findOpen(quoteRequestId: string, type: DataRequestType): Promise<DataRequestRecord | undefined> {
    const row = await this.table().findFirst({ where: { quoteRequestId, type, status: { in: ["received", "in_review"] } }, orderBy: NEWEST_FIRST });
    return row ? toDomain(row) : undefined;
  }

  async listForQuote(quoteRequestId: string): Promise<DataRequestRecord[]> {
    return (await this.table().findMany({ where: { quoteRequestId }, orderBy: NEWEST_FIRST })).map(toDomain);
  }

  async list(filter: DataRequestListFilter): Promise<DataRequestRecord[]> {
    const { after } = filter;
    const rows = await this.table().findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {})
      },
      orderBy: NEWEST_FIRST,
      take: filter.limit
    });
    return rows.map(toDomain);
  }

  async markAcknowledged(id: string, at: Date): Promise<void> {
    await this.table().updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: at } });
  }

  async transition(id: string, from: readonly DataRequestStatus[], patch: DataRequestTransitionPatch, at: Date): Promise<DataRequestRecord | undefined> {
    const data: Record<string, unknown> = { status: patch.status, updatedAt: at };
    for (const key of ["reviewedById", "reviewedAt", "decidedById", "decidedAt", "decisionNote", "erasureBatchId"] as const) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    const result = await this.table().updateMany({ where: { id, status: { in: [...from] } }, data });
    if (result.count === 0) return undefined;
    return this.find(id);
  }

  async listAll(): Promise<DataRequestRecord[]> {
    return (await this.table().findMany({ orderBy: NEWEST_FIRST })).map(toDomain);
  }

  async anonymizeById(id: string, marker: string, now: Date): Promise<boolean> {
    return (await this.scrub({ id, anonymizedAt: null }, marker, now)) === 1;
  }

  async anonymizeForQuote(quoteRequestId: string, marker: string, now: Date): Promise<void> {
    await this.scrub({ quoteRequestId, anonymizedAt: null }, marker, now);
  }

  /** `detail` is nullable: it only becomes the marker when it was written. */
  private async scrub(where: Record<string, unknown>, marker: string, now: Date): Promise<number> {
    const withDetail = await this.table().updateMany({ where: { ...where, detail: { not: null } }, data: { detail: marker } });
    const withNote = await this.table().updateMany({ where: { ...where, decisionNote: { not: null } }, data: { decisionNote: marker } });
    const stamped = await this.table().updateMany({ where, data: { anonymizedAt: now, updatedAt: now } });
    return Math.max(stamped.count, withDetail.count > 0 || withNote.count > 0 ? 1 : 0);
  }

  private table(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { dataRequest: Delegate }).dataRequest;
  }
}

export const DATA_REQUESTS_REPOSITORY = Symbol("DATA_REQUESTS_REPOSITORY");
