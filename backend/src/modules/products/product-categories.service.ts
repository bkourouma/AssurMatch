import {
  adminProductCategoryCreateSchema,
  adminProductCategoryUpdateSchema,
  type AdminProductCategoryView
} from "../../../../packages/shared/contracts/catalog.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { assertFreshVersion, catalogConflict, CatalogErrorCodes, catalogNotFound } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { MemoryProductCategoriesRepository, type ProductCategoriesRepository, type ProductCategory } from "./product-categories.repository";
import type { ProductsRepository } from "./products.repository";

export const ProductCategoryAuditActions = {
  created: "product_category.created",
  updated: "product_category.updated",
  retired: "product_category.retired",
  createRefused: "product_category.create_refused",
  updateRefused: "product_category.update_refused",
  retireRefused: "product_category.retire_refused",
  readRefused: "product_category.read_refused"
} as const;

/**
 * Spec 070 PROD-001: admin CRUD of product categories. The key is immutable. A category starts in
 * `draft`; only an `active` one can be chosen for a product (checked by ProductsService). Retiring
 * is refused while non-retired products are attached. Every write and every refusal is audited.
 */
export class ProductCategoriesService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly products: Pick<ProductsRepository, "list">,
    private readonly repository: ProductCategoriesRepository = new MemoryProductCategoriesRepository()
  ) {}

  async list(): Promise<AdminProductCategoryView[]> {
    const [categories, counts] = await Promise.all([this.repository.list(), this.countByCategory()]);
    return categories.map((category) => this.view(category, counts.get(category.id) ?? 0));
  }

  async get(id: string): Promise<AdminProductCategoryView> {
    const category = await this.require(id);
    return this.view(category, (await this.countByCategory()).get(id) ?? 0);
  }

  /** For the product forms: categories a product may be attached to. */
  async listActive(): Promise<ProductCategory[]> {
    return (await this.repository.list()).filter((category) => category.status === "active");
  }

  async create(input: unknown, actor: ActorContext): Promise<AdminProductCategoryView> {
    const { reason, ...parsed } = adminProductCategoryCreateSchema.parse(input);
    if (await this.repository.findByKey(parsed.key)) {
      this.refuse(actor, ProductCategoryAuditActions.createRefused, parsed.key, "duplicate_key", reason);
      throw catalogConflict(`Product category ${parsed.key} already exists`, "CONFLICT");
    }
    const now = new Date();
    const category: ProductCategory = {
      id: crypto.randomUUID(),
      key: parsed.key,
      name: parsed.name,
      ...(parsed.nameEn ? { nameEn: parsed.nameEn } : {}),
      ...(parsed.description ? { description: parsed.description } : {}),
      sortOrder: parsed.sortOrder,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    const saved = await this.repository.create(category);
    this.audit.write({
      actor,
      action: ProductCategoryAuditActions.created,
      targetType: "ProductCategory",
      targetId: saved.id,
      scope: {},
      result: "success",
      reason,
      context: { key: saved.key, after: this.snapshot(saved) }
    });
    return this.view(saved, 0);
  }

  async update(id: string, input: unknown, actor: ActorContext): Promise<AdminProductCategoryView> {
    const { reason, expectedUpdatedAt, ...patch } = adminProductCategoryUpdateSchema.parse(input);
    const current = await this.require(id);
    try {
      assertFreshVersion(expectedUpdatedAt, current.updatedAt);
    } catch (error) {
      this.refuse(actor, ProductCategoryAuditActions.updateRefused, id, "stale_version", reason);
      throw error;
    }
    const retiring = patch.status === "retired" && current.status !== "retired";
    const attached = (await this.countByCategory()).get(id) ?? 0;
    if (retiring && attached > 0) {
      this.refuse(actor, ProductCategoryAuditActions.retireRefused, id, "category_in_use", reason, { productCount: attached });
      throw catalogConflict(`Product category ${current.key} is used by ${attached} product(s); move or retire them first`, CatalogErrorCodes.categoryInUse);
    }
    const next: ProductCategory = {
      id: current.id,
      key: current.key,
      name: patch.name ?? current.name,
      sortOrder: patch.sortOrder ?? current.sortOrder,
      status: patch.status ?? current.status,
      createdAt: current.createdAt,
      updatedAt: new Date(),
      ...this.optional("nameEn", patch.nameEn, current.nameEn),
      ...this.optional("description", patch.description, current.description),
      ...(current.createdById ? { createdById: current.createdById } : {})
    };
    // `updatedAt` is the concurrency token: it must move even when the clock did not.
    if (next.updatedAt.getTime() <= current.updatedAt.getTime()) next.updatedAt = new Date(current.updatedAt.getTime() + 1);
    const saved = await this.repository.save(next);
    this.audit.write({
      actor,
      action: retiring ? ProductCategoryAuditActions.retired : ProductCategoryAuditActions.updated,
      targetType: "ProductCategory",
      targetId: saved.id,
      scope: {},
      result: "success",
      reason,
      context: { key: saved.key, before: this.snapshot(current), after: this.snapshot(saved) }
    });
    return this.view(saved, attached);
  }

  private async require(id: string): Promise<ProductCategory> {
    const category = await this.repository.find(id);
    if (!category) throw catalogNotFound(`Product category ${id} not found`);
    return category;
  }

  /** Non-retired products attached to each category (retired products never block nor count). */
  private async countByCategory(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const product of await this.products.list()) {
      if (product.categoryId && product.status !== "retired") counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }
    return counts;
  }

  private optional<K extends "nameEn" | "description">(key: K, patch: string | null | undefined, current: string | undefined): Partial<Record<K, string>> {
    if (patch === null) return {};
    const value = patch ?? current;
    return value ? { [key]: value } as Partial<Record<K, string>> : {};
  }

  private view(category: ProductCategory, productCount: number): AdminProductCategoryView {
    return {
      id: category.id,
      key: category.key,
      name: category.name,
      nameEn: category.nameEn ?? null,
      description: category.description ?? null,
      sortOrder: category.sortOrder,
      status: category.status,
      productCount,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    };
  }

  private snapshot(category: ProductCategory): Record<string, unknown> {
    return { name: category.name, nameEn: category.nameEn ?? null, description: category.description ?? null, sortOrder: category.sortOrder, status: category.status };
  }

  private refuse(actor: ActorContext, action: string, targetId: string, refusal: string, requestReason?: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action,
      targetType: "ProductCategory",
      targetId,
      scope: {},
      result: "refused",
      reason: refusal,
      context: { ...(requestReason ? { requestReason } : {}), ...context }
    });
  }
}
