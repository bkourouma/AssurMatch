import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ConsentRecord, ConsentText } from "./consent.module";

export const CONSENT_RECORDS_REPOSITORY = Symbol("CONSENT_RECORDS_REPOSITORY");

/** The only mutation a consent record accepts: the visitor's withdrawal. */
export interface ConsentRecordUpdate {
  status?: ConsentRecord["status"];
  withdrawnAt?: Date;
}

/** Spec 059 follow-up: filters of the compliance consent-proof search (all optional, AND-ed). */
export interface ConsentRecordSearchFilter {
  ids?: string[];
  subjectReference?: string;
  countryId?: string;
  purpose?: ConsentRecord["purpose"];
  status?: ConsentRecord["status"];
  skip: number;
  take: number;
}

export interface ConsentRecordsRepository extends RuntimeRepository {
  createText(text: ConsentText): Promise<ConsentText>;
  updateText(id: string, update: Partial<ConsentText>): Promise<ConsentText>;
  listTexts(): Promise<ConsentText[]>;
  createRecord(record: ConsentRecord): Promise<ConsentRecord>;
  /**
   * Spec 045: a withdrawal flips the status in place and stamps `withdrawnAt`. The record is never
   * deleted, so the evidence of the original grant (text, hash, granted date) survives the revocation.
   */
  updateRecord(id: string, update: ConsentRecordUpdate): Promise<ConsentRecord>;
  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean>;
  /** Spec 042: routing reads the consent actually recorded, to know which recipients it covers. */
  findRecord(id: string): Promise<ConsentRecord | undefined>;
  searchRecords(): Promise<ConsentRecord[]>;
  /** Spec 059 follow-up: one page of matching proofs, newest first, and the total count. */
  searchRecordsPage(filter: ConsentRecordSearchFilter): Promise<{ items: ConsentRecord[]; total: number }>;
  requireText(id: string): Promise<ConsentText>;
}

function matchesFilter(record: ConsentRecord, filter: ConsentRecordSearchFilter): boolean {
  if (filter.ids && !filter.ids.includes(record.id)) return false;
  if (filter.subjectReference && record.subjectReference !== filter.subjectReference) return false;
  if (filter.countryId && record.countryId !== filter.countryId) return false;
  if (filter.purpose && record.purpose !== filter.purpose) return false;
  if (filter.status && record.status !== filter.status) return false;
  return true;
}

export class MemoryConsentRecordsRepository implements ConsentRecordsRepository {
  readonly mode = "memory-test" as const;
  private readonly texts: ConsentText[] = [];
  private readonly records: ConsentRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ConsentRecordsRepository");
  }

  async createText(text: ConsentText): Promise<ConsentText> {
    this.texts.push(text);
    return text;
  }

  async updateText(id: string, update: Partial<ConsentText>): Promise<ConsentText> {
    const text = await this.requireText(id);
    Object.assign(text, update);
    return text;
  }

  async listTexts(): Promise<ConsentText[]> {
    return [...this.texts];
  }

  async createRecord(record: ConsentRecord): Promise<ConsentRecord> {
    this.records.push(record);
    return record;
  }

  async updateRecord(id: string, update: ConsentRecordUpdate): Promise<ConsentRecord> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Consent record ${id} not found`);
    Object.assign(record, update, { updatedAt: new Date() });
    return record;
  }

  async hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean> {
    if (!recordId) return false;
    return this.records.some((record) =>
      record.id === recordId &&
      record.purpose === purpose &&
      record.countryId === countryId &&
      (productId === undefined || record.productId === productId) &&
      record.status === "granted"
    );
  }

  async findRecord(id: string): Promise<ConsentRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async searchRecords(): Promise<ConsentRecord[]> {
    return [...this.records];
  }

  async searchRecordsPage(filter: ConsentRecordSearchFilter): Promise<{ items: ConsentRecord[]; total: number }> {
    const matching = this.records.filter((record) => matchesFilter(record, filter)).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return { items: matching.slice(filter.skip, filter.skip + filter.take), total: matching.length };
  }

  async requireText(id: string): Promise<ConsentText> {
    const text = this.texts.find((candidate) => candidate.id === id);
    if (!text) throw new Error(`Consent text ${id} not found`);
    return text;
  }
}

type ConsentTextDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type ConsentRecordDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  count(input?: unknown): Promise<number>;
};

export class PrismaConsentRecordsRepository implements ConsentRecordsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async createText(text: ConsentText): Promise<ConsentText> {
    return this.toText(await this.texts().create({ data: { ...text } }));
  }

  async updateText(id: string, update: Partial<ConsentText>): Promise<ConsentText> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return this.toText(await this.texts().update({ where: { id }, data }));
  }

  async listTexts(): Promise<ConsentText[]> {
    return (await this.texts().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toText(row));
  }

  async createRecord(record: ConsentRecord): Promise<ConsentRecord> {
    return this.toRecord(await this.records().create({ data: { ...record } }));
  }

  async updateRecord(id: string, update: ConsentRecordUpdate): Promise<ConsentRecord> {
    const data: Record<string, unknown> = {};
    if (update.status) data.status = update.status;
    if (update.withdrawnAt) data.withdrawnAt = update.withdrawnAt;
    return this.toRecord(await this.records().update({ where: { id }, data }));
  }

  async hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean> {
    if (!recordId) return false;
    const record = await this.records().findFirst({
      where: {
        id: recordId,
        purpose,
        countryId,
        ...(productId ? { productId } : {}),
        status: "granted",
        withdrawnAt: null
      }
    });
    return Boolean(record);
  }

  async findRecord(id: string): Promise<ConsentRecord | undefined> {
    const row = await this.records().findFirst({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async searchRecords(): Promise<ConsentRecord[]> {
    return (await this.records().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async searchRecordsPage(filter: ConsentRecordSearchFilter): Promise<{ items: ConsentRecord[]; total: number }> {
    const where = {
      ...(filter.ids ? { id: { in: filter.ids } } : {}),
      ...(filter.subjectReference ? { subjectReference: filter.subjectReference } : {}),
      ...(filter.countryId ? { countryId: filter.countryId } : {}),
      ...(filter.purpose ? { purpose: filter.purpose } : {}),
      ...(filter.status ? { status: filter.status } : {})
    };
    const [rows, total] = await Promise.all([
      this.records().findMany({ where, orderBy: { createdAt: "desc" }, skip: filter.skip, take: filter.take }),
      this.records().count({ where })
    ]);
    return { items: rows.map((row) => this.toRecord(row)), total };
  }

  async requireText(id: string): Promise<ConsentText> {
    const row = await this.texts().findUnique({ where: { id } });
    if (!row) throw new Error(`Consent text ${id} not found`);
    return this.toText(row);
  }

  private texts(): ConsentTextDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { consentText: ConsentTextDelegate }).consentText;
  }

  private records(): ConsentRecordDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { consentRecord: ConsentRecordDelegate }).consentRecord;
  }

  private toText(row: unknown): ConsentText {
    return row as ConsentText;
  }

  private toRecord(row: unknown): ConsentRecord {
    return row as ConsentRecord;
  }
}
