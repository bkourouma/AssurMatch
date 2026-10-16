import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

/**
 * Spec 063: a browser the user chose to trust after a valid MFA code. Only the SHA-256 of the 256-bit
 * token is stored (`tokenHash`); the clear token lives in the browser cookie of the app.
 */
export interface TrustedDeviceRecord {
  id: string;
  userId: string;
  tokenHash: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface TrustedDevicesRepository extends RuntimeRepository {
  create(record: TrustedDeviceRecord): Promise<TrustedDeviceRecord>;
  findByTokenHash(tokenHash: string): Promise<TrustedDeviceRecord | undefined>;
  /** Not revoked and not expired at `now`, oldest first. */
  listActiveForUser(userId: string, now: Date): Promise<TrustedDeviceRecord[]>;
  markUsed(id: string, now: Date): Promise<void>;
  /** True when the device was active and is now revoked. */
  revoke(id: string, reason: string, now: Date): Promise<boolean>;
  /** Revokes every active device of the user; returns how many. */
  revokeAllForUser(userId: string, reason: string, now: Date): Promise<number>;
}

export class MemoryTrustedDevicesRepository implements TrustedDevicesRepository {
  readonly mode = "memory-test" as const;
  private readonly records = new Map<string, TrustedDeviceRecord>();

  constructor() {
    assertRuntimeRepository(this.mode, "TrustedDevicesRepository");
  }

  async create(record: TrustedDeviceRecord): Promise<TrustedDeviceRecord> {
    if ([...this.records.values()].some((existing) => existing.tokenHash === record.tokenHash)) throw new Error("Trusted device hash already exists");
    this.records.set(record.id, { ...record });
    return { ...record };
  }

  async findByTokenHash(tokenHash: string): Promise<TrustedDeviceRecord | undefined> {
    const found = [...this.records.values()].find((record) => record.tokenHash === tokenHash);
    return found ? { ...found } : undefined;
  }

  async listActiveForUser(userId: string, now: Date): Promise<TrustedDeviceRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.userId === userId && !record.revokedAt && record.expiresAt > now)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((record) => ({ ...record }));
  }

  async markUsed(id: string, now: Date): Promise<void> {
    const record = this.records.get(id);
    if (record) record.lastUsedAt = now;
  }

  async revoke(id: string, reason: string, now: Date): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.revokedAt || record.expiresAt <= now) return false;
    record.revokedAt = now;
    record.revokedReason = reason;
    return true;
  }

  async revokeAllForUser(userId: string, reason: string, now: Date): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.userId !== userId || record.revokedAt || record.expiresAt <= now) continue;
      record.revokedAt = now;
      record.revokedReason = reason;
      count += 1;
    }
    return count;
  }
}

interface TrustedDeviceDelegate {
  create(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
}

export class PrismaTrustedDevicesRepository implements TrustedDevicesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(record: TrustedDeviceRecord): Promise<TrustedDeviceRecord> {
    return this.toRecord(await this.delegate().create({ data: this.toData(record) }));
  }

  async findByTokenHash(tokenHash: string): Promise<TrustedDeviceRecord | undefined> {
    const row = await this.delegate().findUnique({ where: { tokenHash } });
    return row ? this.toRecord(row) : undefined;
  }

  async listActiveForUser(userId: string, now: Date): Promise<TrustedDeviceRecord[]> {
    const rows = await this.delegate().findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((row) => this.toRecord(row));
  }

  async markUsed(id: string, now: Date): Promise<void> {
    await this.delegate().update({ where: { id }, data: { lastUsedAt: now } });
  }

  async revoke(id: string, reason: string, now: Date): Promise<boolean> {
    const result = await this.delegate().updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokedReason: reason }
    });
    return result.count > 0;
  }

  async revokeAllForUser(userId: string, reason: string, now: Date): Promise<number> {
    const result = await this.delegate().updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokedReason: reason }
    });
    return result.count;
  }

  private delegate(): TrustedDeviceDelegate {
    const client = this.prisma.requireRuntimeClient() as unknown as { trustedDevice?: TrustedDeviceDelegate };
    if (!client.trustedDevice) throw new Error("Prisma trustedDevice delegate is not connected");
    return client.trustedDevice;
  }

  private toData(record: TrustedDeviceRecord): Record<string, unknown> {
    return {
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      label: record.label,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      revokedReason: record.revokedReason
    };
  }

  private toRecord(row: unknown): TrustedDeviceRecord {
    const value = row as Record<string, unknown>;
    return {
      id: value.id as string,
      userId: value.userId as string,
      tokenHash: value.tokenHash as string,
      label: (value.label as string | null | undefined) ?? null,
      createdAt: value.createdAt as Date,
      expiresAt: value.expiresAt as Date,
      lastUsedAt: (value.lastUsedAt as Date | null | undefined) ?? null,
      revokedAt: (value.revokedAt as Date | null | undefined) ?? null,
      revokedReason: (value.revokedReason as string | null | undefined) ?? null
    };
  }
}
