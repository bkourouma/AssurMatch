import type {
  AnonymizationBatchKind,
  AnonymizationBatchStatus,
  ErasureLookup,
  RetentionCategory,
  RetentionSubjectKind
} from "../../../../packages/shared/contracts/data-retention.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";
import type { RetentionPolicyRecord } from "./retention-policies";

/** Row ids frozen at preview time, per subject kind. Ids only: never an e-mail, a phone or a fingerprint. */
export type RetentionTargets = Partial<Record<RetentionSubjectKind, string[]>>;

export interface RetentionSubjectCount {
  selected: number;
  anonymized: number;
  skipped: number;
  failed: number;
  moreRemaining: boolean;
}

export type RetentionCounts = Partial<Record<RetentionSubjectKind, RetentionSubjectCount>>;

export interface AnonymizationBatchRecord {
  id: string;
  kind: AnonymizationBatchKind;
  status: AnonymizationBatchStatus;
  countryId: string | null;
  categories: RetentionCategory[];
  erasureLookup: ErasureLookup | null;
  reason: string;
  requestedById: string | null;
  approvedById: string | null;
  approvalReason: string | null;
  targets: RetentionTargets;
  counts: RetentionCounts;
  previewExpiresAt: Date;
  approvedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AnonymizationBatchUpdate = Partial<Pick<AnonymizationBatchRecord, "status" | "approvedById" | "approvalReason" | "counts" | "approvedAt" | "executedAt">>;

export interface DataRetentionRepository extends RuntimeRepository {
  listPolicies(): Promise<RetentionPolicyRecord[]>;
  /** Insert or replace the override of `(countryId, category)`; `countryId` null is the global override. */
  upsertPolicy(record: RetentionPolicyRecord): Promise<RetentionPolicyRecord>;
  deletePolicy(countryId: string | null, category: RetentionCategory): Promise<void>;
  createBatch(record: AnonymizationBatchRecord): Promise<AnonymizationBatchRecord>;
  findBatch(id: string): Promise<AnonymizationBatchRecord | undefined>;
  listBatches(limit: number): Promise<AnonymizationBatchRecord[]>;
  updateBatch(id: string, update: AnonymizationBatchUpdate): Promise<AnonymizationBatchRecord>;
  /**
   * Moves a batch from `previewed` to approved in one conditional write, so two concurrent approvals
   * cannot both execute it. Returns false when another approval (or a refusal) got there first.
   */
  claimForApproval(id: string, approvedById: string | null, approvalReason: string, approvedAt: Date): Promise<boolean>;
  /**
   * Conditional write for the `expired` and `refused` outcomes: it only applies while the batch is
   * still `previewed` and unclaimed, so it can never overwrite a batch that is being executed.
   */
  transitionFromPreview(id: string, update: AnonymizationBatchUpdate): Promise<boolean>;
}

export class MemoryDataRetentionRepository implements DataRetentionRepository {
  readonly mode = "memory-test" as const;
  private readonly policies: RetentionPolicyRecord[] = [];
  private readonly batches: AnonymizationBatchRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "DataRetentionRepository");
  }

  async listPolicies(): Promise<RetentionPolicyRecord[]> {
    return this.policies.map((policy) => ({ ...policy }));
  }

  async upsertPolicy(record: RetentionPolicyRecord): Promise<RetentionPolicyRecord> {
    const index = this.policies.findIndex((policy) => policy.countryId === record.countryId && policy.category === record.category);
    if (index >= 0) {
      const existing = this.policies[index] as RetentionPolicyRecord;
      const merged = { ...record, id: existing.id, createdAt: existing.createdAt };
      this.policies[index] = merged;
      return { ...merged };
    }
    this.policies.push({ ...record });
    return { ...record };
  }

  async deletePolicy(countryId: string | null, category: RetentionCategory): Promise<void> {
    const index = this.policies.findIndex((policy) => policy.countryId === countryId && policy.category === category);
    if (index >= 0) this.policies.splice(index, 1);
  }

  async createBatch(record: AnonymizationBatchRecord): Promise<AnonymizationBatchRecord> {
    this.batches.push(structuredClone(record));
    return structuredClone(record);
  }

  async findBatch(id: string): Promise<AnonymizationBatchRecord | undefined> {
    const batch = this.batches.find((candidate) => candidate.id === id);
    return batch ? structuredClone(batch) : undefined;
  }

  async listBatches(limit: number): Promise<AnonymizationBatchRecord[]> {
    return [...this.batches]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
      .map((batch) => structuredClone(batch));
  }

  async updateBatch(id: string, update: AnonymizationBatchUpdate): Promise<AnonymizationBatchRecord> {
    const batch = this.batches.find((candidate) => candidate.id === id);
    if (!batch) throw new Error(`Anonymization batch ${id} not found`);
    Object.assign(batch, structuredClone(update), { updatedAt: new Date() });
    return structuredClone(batch);
  }

  async claimForApproval(id: string, approvedById: string | null, approvalReason: string, approvedAt: Date): Promise<boolean> {
    const batch = this.batches.find((candidate) => candidate.id === id);
    if (!batch || batch.status !== "previewed" || batch.approvedAt !== null) return false;
    Object.assign(batch, { approvedById, approvalReason, approvedAt, updatedAt: new Date() });
    return true;
  }

  async transitionFromPreview(id: string, update: AnonymizationBatchUpdate): Promise<boolean> {
    const batch = this.batches.find((candidate) => candidate.id === id);
    if (!batch || batch.status !== "previewed" || batch.approvedAt !== null) return false;
    Object.assign(batch, structuredClone(update), { updatedAt: new Date() });
    return true;
  }
}

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  deleteMany(input: unknown): Promise<{ count: number }>;
};

export class PrismaDataRetentionRepository implements DataRetentionRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async listPolicies(): Promise<RetentionPolicyRecord[]> {
    return (await this.delegate("retentionPolicy").findMany({ orderBy: [{ category: "asc" }, { createdAt: "asc" }] })).map((row) => row as RetentionPolicyRecord);
  }

  /**
   * The compound unique key cannot address a NULL country, so the override is located first and
   * then updated or created; the partial unique index of migration 0018 backs the global case.
   */
  async upsertPolicy(record: RetentionPolicyRecord): Promise<RetentionPolicyRecord> {
    const existing = await this.delegate("retentionPolicy").findFirst({ where: { countryId: record.countryId, category: record.category } }) as RetentionPolicyRecord | null;
    const data = { retentionDays: record.retentionDays, reason: record.reason, updatedById: record.updatedById, updatedAt: record.updatedAt };
    if (existing) return await this.delegate("retentionPolicy").update({ where: { id: existing.id }, data }) as RetentionPolicyRecord;
    return await this.delegate("retentionPolicy").create({ data: { ...data, id: record.id, countryId: record.countryId, category: record.category, createdAt: record.createdAt } }) as RetentionPolicyRecord;
  }

  async deletePolicy(countryId: string | null, category: RetentionCategory): Promise<void> {
    await this.delegate("retentionPolicy").deleteMany({ where: { countryId, category } });
  }

  async createBatch(record: AnonymizationBatchRecord): Promise<AnonymizationBatchRecord> {
    return this.toBatch(await this.delegate("anonymizationBatch").create({ data: record }));
  }

  async findBatch(id: string): Promise<AnonymizationBatchRecord | undefined> {
    const row = await this.delegate("anonymizationBatch").findUnique({ where: { id } });
    return row ? this.toBatch(row) : undefined;
  }

  async listBatches(limit: number): Promise<AnonymizationBatchRecord[]> {
    return (await this.delegate("anonymizationBatch").findMany({ orderBy: { createdAt: "desc" }, take: limit })).map((row) => this.toBatch(row));
  }

  async updateBatch(id: string, update: AnonymizationBatchUpdate): Promise<AnonymizationBatchRecord> {
    const data = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    return this.toBatch(await this.delegate("anonymizationBatch").update({ where: { id }, data: { ...data, updatedAt: new Date() } }));
  }

  async claimForApproval(id: string, approvedById: string | null, approvalReason: string, approvedAt: Date): Promise<boolean> {
    const result = await this.delegate("anonymizationBatch").updateMany({
      where: { id, status: "previewed", approvedAt: null },
      data: { approvedById, approvalReason, approvedAt, updatedAt: new Date() }
    });
    return result.count === 1;
  }

  async transitionFromPreview(id: string, update: AnonymizationBatchUpdate): Promise<boolean> {
    const data = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    const result = await this.delegate("anonymizationBatch").updateMany({
      where: { id, status: "previewed", approvedAt: null },
      data: { ...data, updatedAt: new Date() }
    });
    return result.count === 1;
  }

  private delegate(name: "retentionPolicy" | "anonymizationBatch"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }

  private toBatch(row: unknown): AnonymizationBatchRecord {
    const batch = row as AnonymizationBatchRecord & { targets: unknown; counts: unknown };
    return {
      ...batch,
      targets: this.jsonObject(batch.targets) as RetentionTargets,
      counts: this.jsonObject(batch.counts) as RetentionCounts
    };
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
}

export const DATA_RETENTION_REPOSITORY = "DATA_RETENTION_REPOSITORY";
