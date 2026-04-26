import { productCreateSchema, productUpdateSchema, PRODUCT_FEATURE_FLAG_DEFAULTS, type ProductDto, type ProductFlags, type ProductRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import type { ProductPageResponse, PublicProductDto } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { MemoryProductsRepository, type ProductsRepository } from "./products.repository";

export interface Product extends Omit<ProductRecord, "id" | "flags"> {
  id: string;
  flags: ProductFlags;
  countryIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export class ProductsService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: ProductsRepository = new MemoryProductsRepository()) {}

  async create(input: ProductDto, actor: ActorContext): Promise<Product> {
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
    await this.repository.create(product);
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

  async associateCountry(productId: string, countryId: string, actor: ActorContext): Promise<Product> {
    const product = await this.repository.associateCountry(productId, countryId);
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

  async update(id: string, input: Partial<ProductDto> & { reason: string }, actor: ActorContext): Promise<Product> {
    const parsed = productUpdateSchema.parse(input);
    const product = await this.require(id);
    if (parsed.status === "public" && (!product.countryIds.length || parsed.flags?.product_public_enabled !== true)) {
      throw new Error("Product public activation requires country association and product_public_enabled");
    }
    Object.assign(product, parsed, {
      flags: { ...product.flags, ...(parsed.flags ?? {}) },
      updatedAt: new Date()
    });
    await this.repository.update(id, product);
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

  listAdmin(countryId?: string): Promise<Product[]> {
    return this.repository.list(countryId);
  }

  listPublic(countryId: string): Promise<Product[]> {
    return this.repository.listPublic(countryId);
  }

  async listPublicForCountry(countryId: string, countryFlags: Parameters<PublicJourneyFlagPolicy["resolve"]>[0]["countryFlags"], globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true }): Promise<PublicProductDto[]> {
    const policy = new PublicJourneyFlagPolicy();
    return (await this.repository.list(countryId))
      .filter((product) => product.countryIds.includes(countryId) && product.status === "public")
      .map((product) => {
        const state = policy.resolve({ globalFlags, countryFlags, productFlags: product.flags });
        return {
          id: product.id,
          key: product.key,
          name: product.name,
          comparisonEnabled: state.comparisonEnabled,
          quoteEnabled: state.quoteEnabled
        };
      })
      .filter((product) => product.comparisonEnabled || product.quoteEnabled);
  }

  async getPublicProductPage(countryId: string, productKey: string, countryFlags: Parameters<PublicJourneyFlagPolicy["resolve"]>[0]["countryFlags"], globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true, quote_request_enabled: true }, actor?: ActorContext): Promise<ProductPageResponse> {
    const product = (await this.repository.list(countryId)).find((candidate) => candidate.key === productKey);
    const state = product ? new PublicJourneyFlagPolicy().resolve({ globalFlags, countryFlags, productFlags: product.flags }) : undefined;
    if (!product || product.status !== "public" || !state?.publicEnabled) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.publicJourneyFlagBlocked,
        targetType: "Product",
        targetId: product?.id ?? productKey,
        scope: { countryId, productId: product?.id },
        result: "refused",
        reason: state?.reasons.join(",") ?? "product_not_found",
        context: { status: product?.status }
      });
      throw new Error("Product is not publicly available");
    }
    this.audit.write({
      actor,
      action: QuoteAuditActions.publicProductExposed,
      targetType: "Product",
      targetId: product.id,
      scope: { countryId, productId: product.id },
      result: "success",
      context: { key: product.key }
    });
    return {
      id: product.id,
      key: product.key,
      name: product.name,
      comparisonEnabled: state.comparisonEnabled,
      quoteEnabled: state.quoteEnabled,
      indicativeNotice: "Les offres et prix affiches sont indicatifs et a confirmer par le courtier partenaire."
    };
  }

  findByKey(productKey: string): Promise<Product | undefined> {
    return this.repository.findByKey(productKey);
  }

  require(id: string): Promise<Product> {
    return this.repository.require(id);
  }
}

export class ProductsModule {
  readonly service: ProductsService;

  constructor(audit = new AuditLogWriter(), repository?: ProductsRepository) {
    this.service = new ProductsService(audit, repository);
  }
}

export { PRODUCTS_REPOSITORY, MemoryProductsRepository, type ProductsRepository } from "./products.repository";
