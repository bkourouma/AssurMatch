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

export interface ContentCmsRepository extends RuntimeRepository {
  create(entry: ContentEntryRecord): Promise<ContentEntryRecord>;
  update(id: string, patch: Partial<Omit<ContentEntryRecord, "id" | "createdAt">>): Promise<ContentEntryRecord>;
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
   * Publishing never leaves a key with zero or two published versions: the previous published
   * version is archived and the new one published in one write.
   */
  publishExclusively(id: string, publishedAt: Date, decidedById: string, note: string | null): Promise<ContentEntryRecord>;
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
    if (isOpen(entry) && this.entries.some((candidate) => sameKey(candidate, entry) && isOpen(candidate))) throw new OpenContentEntryExistsError();
    this.entries.push(copy(entry));
    return copy(entry);
  }

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

  async publishExclusively(id: string, publishedAt: Date, decidedById: string, note: string | null): Promise<ContentEntryRecord> {
    const entry = this.require(id);
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
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input?: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
  aggregate(input: unknown): Promise<{ _max: { version: number | null } }>;
};

const OPEN_STATUSES = ["draft", "pending_review"];

export class PrismaContentCmsRepository implements ContentCmsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(entry: ContentEntryRecord): Promise<ContentEntryRecord> {
    try {
      return this.toRecord(await this.entries().create({ data: entry }));
    } catch (error) {
      // The partial unique index "ContentEntry_open_key" turns a concurrent second draft into P2002.
      if ((error as { code?: string }).code === "P2002") throw new OpenContentEntryExistsError();
      throw error;
    }
  }

  async update(id: string, patch: Partial<Omit<ContentEntryRecord, "id" | "createdAt">>): Promise<ContentEntryRecord> {
    const data = { ...patch } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return this.toRecord(await this.entries().update({ where: { id }, data }));
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

  async publishExclusively(id: string, publishedAt: Date, decidedById: string, note: string | null): Promise<ContentEntryRecord> {
    return this.prisma.transaction(async () => {
      const entry = await this.entries().findUnique({ where: { id } });
      if (!entry) throw new Error(`Content entry ${id} not found`);
      const key = this.toRecord(entry);
      await this.entries().updateMany({
        where: { ...this.keyWhere(key), status: "published", id: { not: id } },
        data: { status: "archived", updatedAt: publishedAt }
      });
      return this.toRecord(await this.entries().update({
        where: { id },
        data: { status: "published", publishedAt, decidedById, decidedAt: publishedAt, decisionNote: note }
      }));
    });
  }

  private keyWhere(key: ContentEntryKey): Record<string, unknown> {
    return { kind: key.kind, entryKey: key.entryKey, locale: key.locale, countryCode: key.countryCode ?? null };
  }

  private entries(): ContentEntryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { contentEntry: ContentEntryDelegate }).contentEntry;
  }

  private toRecord(row: unknown): ContentEntryRecord {
    return row as ContentEntryRecord;
  }
}
