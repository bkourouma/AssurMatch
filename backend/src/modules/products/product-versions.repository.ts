import type { ProductVersionChange } from "../../../../packages/shared/contracts/catalog.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const PRODUCT_VERSIONS_REPOSITORY = Symbol("PRODUCT_VERSIONS_REPOSITORY");

/** Spec 070 PROD-008/009: one row per change of the content of a product (conditions shown and asked). */
export interface ProductVersionRecord {
  id: string;
  productId: string;
  versionNumber: number;
  /** Full content after the change. */
  snapshot: Record<string, unknown>;
  changes: ProductVersionChange[];
  reason: string;
  authorId?: string;
  createdAt: Date;
}

export interface ProductVersionsRepository extends RuntimeRepository {
  append(record: ProductVersionRecord): Promise<ProductVersionRecord>;
  /** Most recent first. */
  list(productId: string): Promise<ProductVersionRecord[]>;
}

export class MemoryProductVersionsRepository implements ProductVersionsRepository {
  readonly mode = "memory-test" as const;
  private readonly records: ProductVersionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProductVersionsRepository");
  }

  async append(record: ProductVersionRecord): Promise<ProductVersionRecord> {
    if (this.records.some((candidate) => candidate.productId === record.productId && candidate.versionNumber === record.versionNumber)) {
      throw new Error(`Product ${record.productId} already has version ${record.versionNumber}`);
    }
    const stored = structuredClone(record);
    this.records.push(stored);
    return structuredClone(stored);
  }

  async list(productId: string): Promise<ProductVersionRecord[]> {
    return this.records
      .filter((record) => record.productId === productId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((record) => structuredClone(record));
  }
}

type ProductVersionDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

type ProductVersionRow = {
  id: string;
  productId: string;
  versionNumber: number;
  snapshot: unknown;
  changes: unknown;
  reason: string;
  authorId?: string | null;
  createdAt: Date;
};

export class PrismaProductVersionsRepository implements ProductVersionsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async append(record: ProductVersionRecord): Promise<ProductVersionRecord> {
    const row = await this.versions().create({
      data: {
        id: record.id,
        productId: record.productId,
        versionNumber: record.versionNumber,
        snapshot: record.snapshot,
        changes: record.changes,
        reason: record.reason,
        authorId: record.authorId ?? null,
        createdAt: record.createdAt
      }
    });
    return this.toRecord(row as ProductVersionRow);
  }

  async list(productId: string): Promise<ProductVersionRecord[]> {
    const rows = await this.versions().findMany({ where: { productId }, orderBy: { versionNumber: "desc" } });
    return rows.map((row) => this.toRecord(row as ProductVersionRow));
  }

  private versions(): ProductVersionDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { productVersion: ProductVersionDelegate }).productVersion;
  }

  private toRecord(row: ProductVersionRow): ProductVersionRecord {
    const snapshot = row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot) ? row.snapshot as Record<string, unknown> : {};
    return {
      id: row.id,
      productId: row.productId,
      versionNumber: row.versionNumber,
      snapshot,
      changes: Array.isArray(row.changes) ? row.changes as ProductVersionChange[] : [],
      reason: row.reason,
      ...(row.authorId ? { authorId: row.authorId } : {}),
      createdAt: row.createdAt
    };
  }
}
