import type { ProductCategoryStatus } from "../../../../packages/shared/contracts/catalog.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const PRODUCT_CATEGORIES_REPOSITORY = Symbol("PRODUCT_CATEGORIES_REPOSITORY");

/** Spec 070 PROD-001: a product category. The `key` is immutable once created. */
export interface ProductCategory {
  id: string;
  key: string;
  name: string;
  nameEn?: string;
  description?: string;
  sortOrder: number;
  status: ProductCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface ProductCategoriesRepository extends RuntimeRepository {
  create(category: ProductCategory): Promise<ProductCategory>;
  /** Replaces the mutable fields; `nameEn`/`description` absent in `next` are cleared. */
  save(next: ProductCategory): Promise<ProductCategory>;
  /** Ordered by `sortOrder` then `name`. */
  list(): Promise<ProductCategory[]>;
  find(id: string): Promise<ProductCategory | undefined>;
  findByKey(key: string): Promise<ProductCategory | undefined>;
}

function ordered(categories: ProductCategory[]): ProductCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export class MemoryProductCategoriesRepository implements ProductCategoriesRepository {
  readonly mode = "memory-test" as const;
  private readonly categories: ProductCategory[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProductCategoriesRepository");
  }

  async create(category: ProductCategory): Promise<ProductCategory> {
    this.categories.push({ ...category });
    return { ...category };
  }

  async save(next: ProductCategory): Promise<ProductCategory> {
    const index = this.categories.findIndex((candidate) => candidate.id === next.id);
    if (index < 0) throw new Error(`Product category ${next.id} not found`);
    this.categories[index] = { ...next };
    return { ...next };
  }

  async list(): Promise<ProductCategory[]> {
    return ordered(this.categories).map((category) => ({ ...category }));
  }

  async find(id: string): Promise<ProductCategory | undefined> {
    const found = this.categories.find((candidate) => candidate.id === id);
    return found ? { ...found } : undefined;
  }

  async findByKey(key: string): Promise<ProductCategory | undefined> {
    const found = this.categories.find((candidate) => candidate.key === key);
    return found ? { ...found } : undefined;
  }
}

type ProductCategoryDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type ProductCategoryRow = {
  id: string;
  key: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  sortOrder?: number | null;
  status: ProductCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
};

export class PrismaProductCategoriesRepository implements ProductCategoriesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(category: ProductCategory): Promise<ProductCategory> {
    const row = await this.categories().create({
      data: {
        id: category.id,
        key: category.key,
        name: category.name,
        nameEn: category.nameEn ?? null,
        description: category.description ?? null,
        sortOrder: category.sortOrder,
        status: category.status,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
        createdById: category.createdById ?? null
      }
    });
    return this.toCategory(row as ProductCategoryRow);
  }

  async save(next: ProductCategory): Promise<ProductCategory> {
    const row = await this.categories().update({
      where: { id: next.id },
      data: {
        name: next.name,
        nameEn: next.nameEn ?? null,
        description: next.description ?? null,
        sortOrder: next.sortOrder,
        status: next.status,
        updatedAt: next.updatedAt
      }
    });
    return this.toCategory(row as ProductCategoryRow);
  }

  async list(): Promise<ProductCategory[]> {
    const rows = await this.categories().findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map((row) => this.toCategory(row as ProductCategoryRow));
  }

  async find(id: string): Promise<ProductCategory | undefined> {
    const row = await this.categories().findUnique({ where: { id } });
    return row ? this.toCategory(row as ProductCategoryRow) : undefined;
  }

  async findByKey(key: string): Promise<ProductCategory | undefined> {
    const row = await this.categories().findUnique({ where: { key } });
    return row ? this.toCategory(row as ProductCategoryRow) : undefined;
  }

  private categories(): ProductCategoryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { productCategory: ProductCategoryDelegate }).productCategory;
  }

  private toCategory(row: ProductCategoryRow): ProductCategory {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      ...(row.nameEn ? { nameEn: row.nameEn } : {}),
      ...(row.description ? { description: row.description } : {}),
      sortOrder: row.sortOrder ?? 0,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.createdById ? { createdById: row.createdById } : {})
    };
  }
}
