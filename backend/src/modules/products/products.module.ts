import { COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS, productCreateSchema, productUpdateSchema, PRODUCT_FEATURE_FLAG_DEFAULTS, type CountryProductLinkStatus, type ProductDto, type ProductFlags, type ProductRecord, type ProductUpdateDto } from "../../../../packages/shared/contracts/catalog.contracts";
import type { ProductPageResponse, PublicProductDto } from "../../../../packages/shared/contracts/quote.contracts";
import { pickDefined } from "../../../../packages/shared/validation/patch.schemas";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { assertFreshVersion, catalogConflict } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { MemoryProductsRepository, type ProductsRepository } from "./products.repository";

export interface Product extends Omit<ProductRecord, "id" | "flags"> {
  id: string;
  flags: ProductFlags;
  /** Countries with a non-retired link. */
  countryIds: string[];
  /** Spec 050: every country link, retired ones included. Absent for in-memory legacy fixtures. */
  countryLinks?: CountryProductLink[];
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

/** Spec 050: the CountryProduct row. An absent flag key inherits the product flag (R2). */
export interface CountryProductLink {
  countryId: string;
  status: CountryProductLinkStatus;
  flags: Partial<ProductFlags>;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

const UNAVAILABLE_LINK_STATUSES = new Set<CountryProductLinkStatus>(["suspended", "retired"]);

/**
 * Spec 050 R2: effective flag of a product in a country. Enabling flags need the product flag AND
 * the link flag (an absent link key inherits). `product_manual_review_required` is a restriction,
 * so either level requiring the review keeps it required. A missing, suspended or retired link
 * closes every enabling flag.
 */
export function effectiveProductFlags(product: Pick<Product, "flags">, link: Pick<CountryProductLink, "status" | "flags"> | undefined): ProductFlags {
  const available = Boolean(link) && !UNAVAILABLE_LINK_STATUSES.has(link!.status);
  const linkFlags = link?.flags ?? {};
  const enabled = (key: Exclude<keyof ProductFlags, "product_manual_review_required">): boolean =>
    available && product.flags[key] === true && (linkFlags[key] ?? true) === true;
  return {
    product_public_enabled: enabled("product_public_enabled"),
    product_quote_enabled: enabled("product_quote_enabled"),
    product_comparison_enabled: enabled("product_comparison_enabled"),
    product_document_upload_enabled: enabled("product_document_upload_enabled"),
    product_sensitive_data_enabled: enabled("product_sensitive_data_enabled"),
    product_ai_scoring_enabled: enabled("product_ai_scoring_enabled"),
    product_ai_form_assistant_enabled: enabled("product_ai_form_assistant_enabled"),
    product_manual_review_required: product.flags.product_manual_review_required === true || (linkFlags.product_manual_review_required ?? product.flags.product_manual_review_required) === true
  };
}

/** Legacy links (seeds, fixtures) only carry the country id: they behave as an open link with no flag of their own. */
export function countryLinkFor(product: Pick<Product, "countryIds" | "countryLinks">, countryId: string): CountryProductLink | undefined {
  const link = product.countryLinks?.find((candidate) => candidate.countryId === countryId);
  if (link) return link;
  if (!product.countryIds.includes(countryId)) return undefined;
  const epoch = new Date(0);
  return { countryId, status: "public", flags: {}, createdAt: epoch, updatedAt: epoch };
}

export class ProductsService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: ProductsRepository = new MemoryProductsRepository()) {}

  async create(input: ProductDto, actor: ActorContext, reason?: string): Promise<Product> {
    const parsed = productCreateSchema.parse(input);
    const now = new Date();
    const product: Product = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      countryIds: [],
      requiresManualReview: parsed.sensitivity === "standard" ? parsed.requiresManualReview : true,
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.create(product);
    this.audit.write({
      actor,
      action: "product.created",
      targetType: "Product",
      targetId: product.id,
      scope: { productId: product.id },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { key: product.key, status: product.status, after: this.snapshot(product) }
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

  async update(id: string, input: ProductUpdateDto, actor: ActorContext): Promise<Product> {
    const { reason, flags, expectedUpdatedAt, ...changes } = productUpdateSchema.parse(input);
    const product = await this.require(id);
    try {
      assertFreshVersion(expectedUpdatedAt, product.updatedAt);
    } catch (error) {
      this.refuse(actor, product.id, "product.update_refused", "stale_version", reason);
      throw error;
    }
    const before = this.snapshot(product);
    const nextFlags: ProductFlags = { ...product.flags, ...pickDefined(flags) };
    if (changes.status === "public" && (!product.countryIds.length || !nextFlags.product_public_enabled)) {
      throw new Error("Product public activation requires country association and product_public_enabled");
    }
    const nextSensitivity = changes.sensitivity ?? product.sensitivity;
    Object.assign(product, pickDefined(changes), {
      flags: nextFlags,
      // Same invariant as create: anything above `standard` stays under manual review.
      requiresManualReview: nextSensitivity === "standard" ? changes.requiresManualReview ?? product.requiresManualReview : true,
      updatedAt: new Date()
    });
    await this.repository.update(id, product);
    this.audit.write({
      actor,
      action: "product.updated",
      targetType: "Product",
      targetId: product.id,
      // US2-4: a global change names every country the product is linked to (scope is not masked).
      scope: { productId: product.id, countryIds: [...product.countryIds] },
      result: "success",
      reason,
      context: { status: product.status, flags: product.flags, before, after: this.snapshot(product) }
    });
    return product;
  }

  /** Spec 050 R1: writes one global product flag; the catalogue flag service audits the toggle. */
  async writeFlag(id: string, key: keyof ProductFlags, value: boolean): Promise<Product> {
    const product = await this.require(id);
    return this.repository.update(id, { flags: { ...product.flags, [key]: value }, updatedAt: new Date() });
  }

  /** Spec 050 US2-1: an admin link starts `internal` with every product flag closed. */
  async createLink(productId: string, countryId: string, reason: string, actor: ActorContext): Promise<CountryProductLink> {
    const product = await this.require(productId);
    const existing = product.countryLinks?.find((link) => link.countryId === countryId)
      ?? (product.countryIds.includes(countryId) ? countryLinkFor(product, countryId) : undefined);
    if (existing && existing.status !== "retired") {
      this.refuse(actor, productId, "country_product.create_refused", "link_exists", reason, { countryId });
      throw catalogConflict("Country product link already exists", "CONFLICT");
    }
    const now = new Date();
    const link: CountryProductLink = {
      countryId,
      status: "internal",
      flags: { ...COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    const saved = await this.repository.saveLink(productId, link);
    this.audit.write({
      actor,
      action: "country_product.linked",
      targetType: "CountryProduct",
      targetId: `${productId}@${countryId}`,
      scope: { countryId, productId },
      result: "success",
      reason,
      context: { before: existing ? { status: existing.status } : null, after: { status: saved.status, flags: saved.flags } }
    });
    return saved;
  }

  /** Logical removal: status `retired` and every enabling flag closed. Always allowed (FR-005). */
  async retireLink(productId: string, countryId: string, reason: string, actor: ActorContext): Promise<CountryProductLink> {
    const product = await this.require(productId);
    const existing = countryLinkFor(product, countryId);
    if (!existing) throw catalogConflict("Country product link does not exist", "CONFLICT");
    const saved = await this.repository.saveLink(productId, {
      ...existing,
      status: "retired",
      flags: { ...existing.flags, ...COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS },
      updatedAt: new Date()
    });
    this.audit.write({
      actor,
      action: "country_product.retired",
      targetType: "CountryProduct",
      targetId: `${productId}@${countryId}`,
      scope: { countryId, productId },
      result: "success",
      reason,
      context: { before: { status: existing.status, flags: existing.flags }, after: { status: saved.status, flags: saved.flags } }
    });
    return saved;
  }

  /** Spec 050 R1: writes one link flag; the catalogue flag service audits the toggle. */
  async writeLinkFlag(productId: string, countryId: string, key: keyof ProductFlags, value: boolean): Promise<CountryProductLink> {
    const product = await this.require(productId);
    const existing = countryLinkFor(product, countryId);
    if (!existing) throw catalogConflict("Country product link does not exist", "CONFLICT");
    return this.repository.saveLink(productId, { ...existing, flags: { ...existing.flags, [key]: value }, updatedAt: new Date() });
  }

  linkFor(product: Product, countryId: string): CountryProductLink | undefined {
    return countryLinkFor(product, countryId);
  }

  effectiveFlags(product: Product, countryId: string): ProductFlags {
    return effectiveProductFlags(product, countryLinkFor(product, countryId));
  }

  /** Product as seen from one country: effective flags and the link status when it blocks. */
  forCountry(product: Product, countryId: string): Product {
    const link = countryLinkFor(product, countryId);
    const blocked = !link || UNAVAILABLE_LINK_STATUSES.has(link.status);
    return {
      ...product,
      flags: effectiveProductFlags(product, link),
      status: blocked ? (link?.status === "retired" ? "retired" : "suspended") : product.status
    };
  }

  async requireForCountry(productId: string, countryId: string): Promise<Product> {
    return this.forCountry(await this.require(productId), countryId);
  }

  listAdmin(countryId?: string): Promise<Product[]> {
    return this.repository.list(countryId);
  }

  /**
   * Spec 059 (SC-02 fix): products a broker may apply for in a country - every product linked to
   * it and not draft, suspended or retired (country link included), whatever its public journey
   * flags. The first broker of a country applies BEFORE the country opens to visitors (opening
   * requires a licensed broker), so the visitor-facing list is always empty at that point.
   */
  async listForBrokerOnboarding(countryId: string): Promise<Array<{ key: string; name: string }>> {
    return (await this.repository.list(countryId))
      .map((product) => this.forCountry(product, countryId))
      .filter((product) => product.countryIds.includes(countryId) && !["draft", "suspended", "retired"].includes(product.status))
      .map((product) => ({ key: product.key, name: product.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listPublic(countryId: string): Promise<Product[]> {
    return this.repository.listPublic(countryId);
  }

  async listPublicForCountry(countryId: string, countryFlags: Parameters<PublicJourneyFlagPolicy["resolve"]>[0]["countryFlags"], globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true }): Promise<PublicProductDto[]> {
    const policy = new PublicJourneyFlagPolicy();
    return (await this.repository.list(countryId))
      .map((product) => this.forCountry(product, countryId))
      .filter((product) => product.countryIds.includes(countryId) && product.status === "public")
      .map((product) => {
        const state = policy.resolve({ globalFlags, countryFlags, productFlags: product.flags, requireProductFlags: true });
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
    const linked = (await this.repository.list(countryId)).find((candidate) => candidate.key === productKey);
    const product = linked ? this.forCountry(linked, countryId) : undefined;
    const state = product ? new PublicJourneyFlagPolicy().resolve({ globalFlags, countryFlags, productFlags: product.flags, requireProductFlags: true }) : undefined;
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

  private snapshot(product: Product): Record<string, unknown> {
    return {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      sensitivity: product.sensitivity,
      requiresDocuments: product.requiresDocuments,
      requiresManualReview: product.requiresManualReview,
      status: product.status,
      flags: { ...product.flags }
    };
  }

  private refuse(actor: ActorContext, productId: string, action: string, refusal: string, requestReason?: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action,
      targetType: "Product",
      targetId: productId,
      scope: { productId, ...(typeof context.countryId === "string" ? { countryId: context.countryId } : {}) },
      result: "refused",
      reason: refusal,
      context: { requestReason, ...context }
    });
  }
}

export class ProductsModule {
  readonly service: ProductsService;

  constructor(audit = new AuditLogWriter(), repository?: ProductsRepository) {
    this.service = new ProductsService(audit, repository);
  }
}

export { PRODUCTS_REPOSITORY, MemoryProductsRepository, type ProductsRepository } from "./products.repository";
