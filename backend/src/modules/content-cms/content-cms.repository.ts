import type { ContentCmsLocale, ContentEntryListQuery, ContentKind, ContentStatus } from "../../../../packages/shared/contracts/content-cms.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const CONTENT_CMS_REPOSITORY = Symbol("CONTENT_CMS_REPOSITORY");

export interface ContentEntryRecord {
  id: string;
  kind: ContentKind;
  entryKey: string;
  locale: ContentCmsLocale;
  countryCode: string | null;
  version: number;
  status: ContentStatus;
  label: string;
  payload: Record<string, unknown>;
  basedOnId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedById: string | null;
  submittedAt: Date | null;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  publishedAt: Date | null;
}

/** Identity of a piece of content across its versions. */
export interface ContentEntryKey {
  kind: ContentKind;
  entryKey: string;
  locale: ContentCmsLocale;
  countryCode: string | null;
}

/** Thrown by `create` when another open (draft or pending_review) version of the key exists. */
export class OpenContentEntryExistsError extends Error {
  constructor() {
    super("An open version already exists for this content");
  }
}

/**
 * What a conditional write expects to find on the row. Any mismatch means another write landed
 * between the read and this write: nothing is written and the caller answers 409.
 */
export interface ContentEntryGuard {
  status: ContentStatus;
  /** `updatedAt` as read. The service moves it strictly forward on every write, so it is the row version. */
  updatedAt: Date;
  /** Four eyes, checked in the write itself: the stored submitter must be set and differ from this actor. */
  submittedByNot?: string;
}

/** Fields a transition may change; the identity of the content (key, version) never changes. */
export type ContentEntryPatch = Partial<Pick<ContentEntryRecord, "status" | "label" | "payload" | "submittedById" | "submittedAt" | "decidedById" | "decidedAt" | "decisionNote" | "publishedAt">> & { updatedAt: Date };

export interface ContentPublication {
  publishedAt: Date;
  decidedById: string;
  note: string | null;
}

export interface ContentCmsRepository extends RuntimeRepository {
  create(entry: ContentEntryRecord): Promise<ContentEntryRecord>;
  /**
   * Conditional write: applied only when the row still matches `guard` (compare-and-set). Returns
   * the updated row, or `undefined` when the row is gone or changed since it was read.
   */
  transition(id: string, guard: ContentEntryGuard, patch: ContentEntryPatch): Promise<ContentEntryRecord | undefined>;
  find(id: string): Promise<ContentEntryRecord | undefined>;
  list(filter: ContentEntryListQuery): Promise<ContentEntryRecord[]>;
  /** Every version of one key, newest version first. */
  history(key: ContentEntryKey): Promise<ContentEntryRecord[]>;
  /** The draft or pending_review version of a key, if any. */
  findOpen(key: ContentEntryKey): Promise<ContentEntryRecord | undefined>;
  /** The published version of a key, if any. */
  findPublishedVersion(key: ContentEntryKey): Promise<ContentEntryRecord | undefined>;
  nextVersion(key: ContentEntryKey): Promise<number>;
  /** Public read path: published rows of one locale only. */
  listPublished(locale: ContentCmsLocale): Promise<ContentEntryRecord[]>;
  /**
   * Publishing never leaves a key with zero or two published versions: in one transaction, the
   * previous published version is archived and `id` is published, the latter only when it still
   * matches `guard`. On a guard mismatch nothing stays written and `undefined` is returned.
   */
  publishExclusively(id: string, guard: ContentEntryGuard, publication: ContentPublication): Promise<ContentEntryRecord | undefined>;
}

function matchesGuard(entry: ContentEntryRecord, guard: ContentEntryGuard): boolean {
  if (entry.status !== guard.status || entry.updatedAt.getTime() !== guard.updatedAt.getTime()) return false;
  if (guard.submittedByNot === undefined) return true;
  return entry.submittedById !== null && entry.submittedById !== undefined && entry.submittedById !== guard.submittedByNot;
}

function sameKey(entry: ContentEntryRecord, key: ContentEntryKey): boolean {
  return entry.kind === key.kind && entry.entryKey === key.entryKey && entry.locale === key.locale && (entry.countryCode ?? null) === (key.countryCode ?? null);
}

function isOpen(entry: ContentEntryRecord): boolean {
  return entry.status === "draft" || entry.status === "pending_review";
}

function copy(entry: ContentEntryRecord): ContentEntryRecord {
  return { ...entry, payload: structuredClone(entry.payload) };
}

function matchesFilter(entry: ContentEntryRecord, filter: ContentEntryListQuery): boolean {
  if (filter.kind && entry.kind !== filter.kind) return false;
  if (filter.locale && entry.locale !== filter.locale) return false;
  if (filter.status && entry.status !== filter.status) return false;
  if (filter.countryCode && entry.countryCode !== filter.countryCode) return false;
  if (filter.entryKey && entry.entryKey !== filter.entryKey) return false;
  return true;
}

export class MemoryContentCmsRepository implements ContentCmsRepository {
  readonly mode = "memory-test" as const;
  private readonly entries: ContentEntryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ContentCmsRepository");
  }

  async create(entry: ContentEntryRecord): Promise<ContentEntryRecord> {
    // Same constraints as the SQL unique indexes: one open version per key, one row per key and version.
    if (isOpen(entry) && this.entries.some((candidate) => sameKey(candidate, entry) && isOpen(candidate))) throw new OpenContentEntryExistsError();
    if (this.entries.some((candidate) => sameKey(candidate, entry) && candidate.version === entry.version)) throw new OpenContentEntryExistsError();
    this.entries.push(copy(entry));
    return copy(entry);
  }

  /** Check and write happen with no `await` in between, so they are atomic on the event loop. */
  async transition(id: string, guard: ContentEntryGuard, patch: ContentEntryPatch): Promise<ContentEntryRecord | undefined> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || !matchesGuard(entry, guard)) return undefined;
    Object.assign(entry, patch);
    return copy(entry);
  }

  /** Test helper only (not part of the repository contract): unconditional overwrite, to simulate a tampered row. */
  async update(id: string, patch: Partial<Omit<ContentEntryRecord, "id" | "createdAt">>): Promise<ContentEntryRecord> {
    const entry = this.require(id);
    Object.assign(entry, patch);
    return copy(entry);
  }

  async find(id: string): Promise<ContentEntryRecord | undefined> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    return entry ? copy(entry) : undefined;
  }

  async list(filter: ContentEntryListQuery): Promise<ContentEntryRecord[]> {
    return this.entries.filter((entry) => matchesFilter(entry, filter)).map(copy).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async history(key: ContentEntryKey): Promise<ContentEntryRecord[]> {
    return this.entries.filter((entry) => sameKey(entry, key)).map(copy).sort((a, b) => b.version - a.version);
  }

  async findOpen(key: ContentEntryKey): Promise<ContentEntryRecord | undefined> {
    const entry = this.entries.find((candidate) => sameKey(candidate, key) && isOpen(candidate));
    return entry ? copy(entry) : undefined;
  }

  async findPublishedVersion(key: ContentEntryKey): Promise<ContentEntryRecord | undefined> {
    const entry = this.entries.find((candidate) => sameKey(candidate, key) && candidate.status === "published");
    return entry ? copy(entry) : undefined;
  }

  async nextVersion(key: ContentEntryKey): Promise<number> {
    return this.entries.filter((entry) => sameKey(entry, key)).reduce((max, entry) => Math.max(max, entry.version), 0) + 1;
  }

  async listPublished(locale: ContentCmsLocale): Promise<ContentEntryRecord[]> {
    return this.entries.filter((entry) => entry.status === "published" && entry.locale === locale).map(copy);
  }

  async publishExclusively(id: string, guard: ContentEntryGuard, publication: ContentPublication): Promise<ContentEntryRecord | undefined> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    // Guard first, then both writes, with no `await` in between: all or nothing.
    if (!entry || !matchesGuard(entry, guard)) return undefined;
    const { publishedAt, decidedById, note } = publication;
    for (const candidate of this.entries) {
      if (candidate.id === id || candidate.status !== "published" || !sameKey(candidate, entry)) continue;
      candidate.status = "archived";
      candidate.updatedAt = publishedAt;
    }
    Object.assign(entry, { status: "published", publishedAt, decidedById, decidedAt: publishedAt, decisionNote: note, updatedAt: publishedAt });
    return copy(entry);
  }

  private require(id: string): ContentEntryRecord {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Content entry ${id} not found`);
    return entry;
  }
}

type ContentEntryDelegate = {
  create(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input?: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
  aggregate(input: unknown): Promise<{ _max: { version: number | null } }>;
};

type ContentEntryTransactionClient = { contentEntry: ContentEntryDelegate };
type ContentEntryClient = ContentEntryTransactionClient & {
  /** Interactive transaction: every write inside goes through `tx`, so a throw rolls all of them back. */
  $transaction<T>(callback: (tx: ContentEntryTransactionClient) => Promise<T>): Promise<T>;
};

const OPEN_STATUSES = ["draft", "pending_review"];

/** Raised inside the publication transaction to roll back the archiving when the guard no longer matches. */
class StaleContentEntryError extends Error {
  constructor() {
    super("Content entry changed since it was read");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function guardWhere(id: string, guard: ContentEntryGuard): Record<string, unknown> {
  return {
    id,
    status: guard.status,
    updatedAt: guard.updatedAt,
    // SQL `<>` never matches NULL; the explicit `not: null` states it.
    ...(guard.submittedByNot !== undefined ? { AND: [{ submittedById: { not: null } }, { submittedById: { not: guard.submittedByNot } }] } : {})
  };
}

export class PrismaContentCmsRepository implements ContentCmsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(entry: ContentEntryRecord): Promise<ContentEntryRecord> {
    try {
      return this.toRecord(await this.entries().create({ data: entry }));
    } catch (error) {
      // The unique indexes "ContentEntry_open_key" and "ContentEntry_key_version" turn a concurrent
      // second draft (or a second row with the same version) into P2002.
      if (isUniqueViolation(error)) throw new OpenContentEntryExistsError();
      throw error;
    }
  }

  /**
   * `updateMany` with the guard in its WHERE: PostgreSQL re-checks the WHERE on the latest row
   * version once a concurrent writer commits, so of two racing writes exactly one matches.
   */
  async transition(id: string, guard: ContentEntryGuard, patch: ContentEntryPatch): Promise<ContentEntryRecord | undefined> {
    return this.client().$transaction(async (tx) => {
      const result = await tx.contentEntry.updateMany({ where: guardWhere(id, guard), data: { ...patch } });
      if (result.count !== 1) return undefined;
      const row = await tx.contentEntry.findUnique({ where: { id } });
      return row ? this.toRecord(row) : undefined;
    });
  }

  async find(id: string): Promise<ContentEntryRecord | undefined> {
    const row = await this.entries().findUnique({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async list(filter: ContentEntryListQuery): Promise<ContentEntryRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.kind) where.kind = filter.kind;
    if (filter.locale) where.locale = filter.locale;
    if (filter.status) where.status = filter.status;
    if (filter.countryCode) where.countryCode = filter.countryCode;
    if (filter.entryKey) where.entryKey = filter.entryKey;
    return (await this.entries().findMany({ where, orderBy: { updatedAt: "desc" }, take: 500 })).map((row) => this.toRecord(row));
  }

  async history(key: ContentEntryKey): Promise<ContentEntryRecord[]> {
    return (await this.entries().findMany({ where: this.keyWhere(key), orderBy: { version: "desc" } })).map((row) => this.toRecord(row));
  }

  async findOpen(key: ContentEntryKey): Promise<ContentEntryRecord | undefined> {
    const row = await this.entries().findFirst({ where: { ...this.keyWhere(key), status: { in: OPEN_STATUSES } } });
    return row ? this.toRecord(row) : undefined;
  }

  async findPublishedVersion(key: ContentEntryKey): Promise<ContentEntryRecord | undefined> {
    const row = await this.entries().findFirst({ where: { ...this.keyWhere(key), status: "published" } });
    return row ? this.toRecord(row) : undefined;
  }

  async nextVersion(key: ContentEntryKey): Promise<number> {
    const result = await this.entries().aggregate({ where: this.keyWhere(key), _max: { version: true } });
    return (result._max.version ?? 0) + 1;
  }

  async listPublished(locale: ContentCmsLocale): Promise<ContentEntryRecord[]> {
    return (await this.entries().findMany({ where: { locale, status: "published" } })).map((row) => this.toRecord(row));
  }

  /**
   * One interactive transaction on `tx` (not `PrismaService.transaction`, which does not hand the
   * transaction client over). The previous published version is archived first because the partial
   * unique index "ContentEntry_published_key" allows one published row per key; the guarded
   * publication follows, and a guard mismatch throws so that the archiving is rolled back too.
   */
  async publishExclusively(id: string, guard: ContentEntryGuard, publication: ContentPublication): Promise<ContentEntryRecord | undefined> {
    const { publishedAt, decidedById, note } = publication;
    try {
      return await this.client().$transaction(async (tx) => {
        const row = await tx.contentEntry.findUnique({ where: { id } });
        if (!row) return undefined;
        const key = this.toRecord(row);
        await tx.contentEntry.updateMany({
          where: { ...this.keyWhere(key), status: "published", id: { not: id } },
          data: { status: "archived", updatedAt: publishedAt }
        });
        const published = await tx.contentEntry.updateMany({
          where: guardWhere(id, guard),
          data: { status: "published", publishedAt, decidedById, decidedAt: publishedAt, decisionNote: note, updatedAt: publishedAt }
        });
        if (published.count !== 1) throw new StaleContentEntryError();
        const updated = await tx.contentEntry.findUnique({ where: { id } });
        if (!updated) throw new StaleContentEntryError();
        return this.toRecord(updated);
      });
    } catch (error) {
      // A version published meanwhile by another transaction surfaces as P2002 on the partial index.
      if (error instanceof StaleContentEntryError || isUniqueViolation(error)) return undefined;
      throw error;
    }
  }

  private keyWhere(key: ContentEntryKey): Record<string, unknown> {
    return { kind: key.kind, entryKey: key.entryKey, locale: key.locale, countryCode: key.countryCode ?? null };
  }

  private client(): ContentEntryClient {
    return this.prisma.requireRuntimeClient() as unknown as ContentEntryClient;
  }

  private entries(): ContentEntryDelegate {
    return this.client().contentEntry;
  }

  private toRecord(row: unknown): ContentEntryRecord {
    return row as ContentEntryRecord;
  }
}
