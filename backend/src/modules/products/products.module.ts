import { productCreateSchema, productUpdateSchema, PRODUCT_FEATURE_FLAG_DEFAULTS, type ProductDto, type ProductFlags, type ProductRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface Product extends Omit<ProductRecord, "id" | "flags"> {
  id: string;
  flags: ProductFlags;
  countryIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class ProductsService {
  private readonly products: Product[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: ProductDto, actor: ActorContext): Product {
    const parsed = productCreateSchema.parse(input);
    const now = new Date();
    const product: Product = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      countryIds: [],
      requiresManualReview: parsed.sensitivity === "standard" ? parsed.requiresManualReview : true,
      createdAt: now,
      updatedAt: now
    };
    this.products.push(product);
    this.audit.write({
      actor,
      action: "product.created",
      targetType: "Product",
      targetId: product.id,
      result: "success",
      context: { key: product.key, status: product.status }
    });
    return product;
  }

  associateCountry(productId: string, countryId: string, actor: ActorContext): Product {
    const product = this.require(productId);
    if (!product.countryIds.includes(countryId)) product.countryIds.push(countryId);
    product.updatedAt = new Date();
    this.audit.write({
      actor,
      action: "product.country_associated",
      targetType: "Product",
      targetId: product.id,
      scope: { countryId, productId },
      result: "success",
      context: {}
    });
    return product;
  }

  update(id: string, input: Partial<ProductDto> & { reason: string }, actor: ActorContext): Product {
    const parsed = productUpdateSchema.parse(input);
    const product = this.require(id);
    if (parsed.status === "public" && (!product.countryIds.length || parsed.flags?.product_public_enabled !== true)) {
      throw new Error("Product public activation requires country association and product_public_enabled");
    }
    Object.assign(product, parsed, {
      flags: { ...product.flags, ...(parsed.flags ?? {}) },
      updatedAt: new Date()
    });
    this.audit.write({
      actor,
      action: "product.updated",
      targetType: "Product",
      targetId: product.id,
      scope: { productId: product.id },
      result: "success",
      reason: parsed.reason,
      context: { status: product.status, flags: product.flags }
    });
    return product;
  }

  listAdmin(countryId?: string): Product[] {
    return countryId ? this.products.filter((product) => product.countryIds.includes(countryId)) : [...this.products];
  }

  listPublic(countryId: string): Product[] {
    return this.products.filter((product) =>
      product.countryIds.includes(countryId) && product.status === "public" && product.flags.product_public_enabled
    );
  }

  require(id: string): Product {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) throw new Error(`Product ${id} not found`);
    return product;
  }
}

export class ProductsModule {
  readonly service: ProductsService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new ProductsService(audit);
  }
}
