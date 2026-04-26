import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import type { FeatureFlag, FeatureFlagHistory } from "./feature-flags.module";

export interface FeatureFlagRepository extends RuntimeRepository {
  list(): Promise<FeatureFlag[]>;
  upsert(flag: FeatureFlag, history: FeatureFlagHistory): Promise<void>;
  historyFor(featureFlagId: string): Promise<FeatureFlagHistory[]>;
}

export class MemoryFeatureFlagRepository implements FeatureFlagRepository {
  readonly mode = "memory-test" as const;
  private readonly flags: FeatureFlag[] = [];
  private readonly history: FeatureFlagHistory[] = [];

  async list(): Promise<FeatureFlag[]> {
    return [...this.flags];
  }

  async upsert(flag: FeatureFlag, history: FeatureFlagHistory): Promise<void> {
    const index = this.flags.findIndex((candidate) => candidate.id === flag.id);
    if (index >= 0) this.flags[index] = flag;
    else this.flags.push(flag);
    this.history.push(history);
  }

  async historyFor(featureFlagId: string): Promise<FeatureFlagHistory[]> {
    return this.history.filter((entry) => entry.featureFlagId === featureFlagId);
  }
}

export class PrismaFeatureFlagRepository implements FeatureFlagRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<FeatureFlag[]> {
    const client = this.prisma.requireRuntimeClient() as unknown as {
      featureFlag: { findMany(): Promise<Array<FeatureFlag & { changedAt: Date }>> };
    };
    return client.featureFlag.findMany();
  }

  async upsert(flag: FeatureFlag, history: FeatureFlagHistory): Promise<void> {
    const client = this.prisma.requireRuntimeClient() as unknown as {
      featureFlag: { upsert(input: unknown): Promise<unknown> };
      featureFlagHistory: { create(input: unknown): Promise<unknown> };
    };
    await client.featureFlag.upsert({
      where: { key_scopeType_scopeId: { key: flag.key, scopeType: flag.scopeType, scopeId: flag.scopeId ?? null } },
      create: {
        id: flag.id,
        key: flag.key,
        scopeType: flag.scopeType,
        scopeId: flag.scopeId,
        value: flag.value,
        defaultValue: false,
        reason: flag.reason,
        changedById: flag.changedById,
        changedAt: flag.changedAt,
        cacheVersion: flag.cacheVersion
      },
      update: {
        value: flag.value,
        reason: flag.reason,
        changedById: flag.changedById,
        changedAt: flag.changedAt,
        cacheVersion: flag.cacheVersion
      }
    });
    await client.featureFlagHistory.create({
      data: {
        id: history.id,
        featureFlagId: history.featureFlagId,
        key: flag.key,
        scopeType: flag.scopeType,
        scopeId: flag.scopeId,
        previousValue: history.previousValue,
        nextValue: history.nextValue,
        reason: history.reason,
        changedById: flag.changedById,
        changedAt: history.changedAt
      }
    });
  }

  async historyFor(featureFlagId: string): Promise<FeatureFlagHistory[]> {
    const client = this.prisma.requireRuntimeClient() as unknown as {
      featureFlagHistory: { findMany(input: unknown): Promise<FeatureFlagHistory[]> };
    };
    return client.featureFlagHistory.findMany({ where: { featureFlagId }, orderBy: { changedAt: "asc" } });
  }
}
