import { COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS, productCreateSchema, productUpdateSchema, PRODUCT_FEATURE_FLAG_DEFAULTS, type CountryProductLinkStatus, type ProductDto, type ProductFlags, type ProductLegalNotice, type ProductRecord, type ProductUpdateDto, type ProductVersionChange, type ProductVersionView, type PublicProductRequirements } from "../../../../packages/shared/contracts/catalog.contracts";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import type { ProductPageResponse, PublicProductDto } from "../../../../packages/shared/contracts/quote.contracts";
import { pickDefined } from "../../../../packages/shared/validation/patch.schemas";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { assertFreshVersion, catalogConflict, CatalogErrorCodes, catalogUnprocessable } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { MemoryProductCategoriesRepository, type ProductCategoriesRepository } from "./product-categories.repository";
import { MemoryProductVersionsRepository, type ProductVersionRecord, type ProductVersionsRepository } from "./product-versions.repository";
import { MemoryProductsRepository, type ProductsRepository } from "./products.repository";

export interface Product extends Omit<ProductRecord, "id" | "flags"> {
  id: string;
  flags: ProductFlags;
  /** Spec 070 PROD-008: number of the current content version (1 at creation). Absent on legacy fixtures. */
  version?: number;
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

export interface ProductsServiceOptions {
  /** Spec 070 PROD-001: categories a product may reference. Defaults to an empty in-memory repository. */
  categories?: ProductCategoriesRepository;
  /** Spec 070 PROD-008/009: content history. Defaults to an in-memory repository. */
  versions?: ProductVersionsRepository;
  /** Resolves the display label of a version author (never required to list versions). */
  resolveAuthorLabel?: (authorId: string) => Promise<string | undefined>;
}

/** The part of a product that is versioned: what visitors read and are asked (PROD-008). */
interface ProductContent {
  name: string;
  description: string | null;
  categoryId: string | null;
  sensitivity: string;
  requiresDocuments: boolean;
  requiresManualReview: boolean;
  legalNotice: ProductLegalNotice;
  requiredDocumentKinds: string[];
}

const LEGAL_NOTICE_LANGUAGES = ["fr", "en"] as const;
const LEGAL_NOTICE_FIELDS = ["legalText", "disclaimer"] as const;

/** Drops empty strings and empty languages so "no text" has a single representation. */
export function normalizeLegalNotice(notice: ProductLegalNotice | undefined): ProductLegalNotice {
  const result: ProductLegalNotice = {};
  for (const language of LEGAL_NOTICE_LANGUAGES) {
    const source = notice?.[language];
    const texts: { legalText?: string; disclaimer?: string } = {};
    for (const field of LEGAL_NOTICE_FIELDS) {
      const value = source?.[field]?.trim();
      if (value) texts[field] = value;
    }
    if (Object.keys(texts).length) result[language] = texts;
  }
  return result;
}

function contentOf(product: Product): ProductContent {
  return {
    name: product.name,
    description: product.description ?? null,
    categoryId: product.categoryId ?? null,
    sensitivity: product.sensitivity,
    requiresDocuments: product.requiresDocuments,
    requiresManualReview: product.requiresManualReview,
    legalNotice: normalizeLegalNotice(product.legalNotice),
    requiredDocumentKinds: [...(product.requiredDocumentKinds ?? [])]
  };
}

/** Field-level diff; legal notice texts are compared per language and field (legalNotice.en.disclaimer). */
export function diffProductContent(before: ProductContent, after: ProductContent): ProductVersionChange[] {
  const changes: ProductVersionChange[] = [];
  const scalar = (field: string, a: unknown, b: unknown): void => {
    if (a !== b) changes.push({ field, before: a ?? null, after: b ?? null });
  };
  scalar("name", before.name, after.name);
  scalar("description", before.description, after.description);
  scalar("categoryId", before.categoryId, after.categoryId);
  scalar("sensitivity", before.sensitivity, after.sensitivity);
  scalar("requiresDocuments", before.requiresDocuments, after.requiresDocuments);
  scalar("requiresManualReview", before.requiresManualReview, after.requiresManualReview);
  if (JSON.stringify([...before.requiredDocumentKinds].sort()) !== JSON.stringify([...after.requiredDocumentKinds].sort())) {
    changes.push({ field: "requiredDocumentKinds", before: [...before.requiredDocumentKinds], after: [...after.requiredDocumentKinds] });
  }
  for (const language of LEGAL_NOTICE_LANGUAGES) {
    for (const field of LEGAL_NOTICE_FIELDS) {
      scalar(`legalNotice.${language}.${field}`, before.legalNotice[language]?.[field] ?? null, after.legalNotice[language]?.[field] ?? null);
    }
  }
  return changes;
}

export class ProductsService {
  private readonly categories: ProductCategoriesRepository;
  private readonly versions: ProductVersionsRepository;
  private readonly resolveAuthorLabel: ProductsServiceOptions["resolveAuthorLabel"];

  constructor(private readonly audit: AuditLogWriter, private readonly repository: ProductsRepository = new MemoryProductsRepository(), options: ProductsServiceOptions = {}) {
    this.categories = options.categories ?? new MemoryProductCategoriesRepository();
    this.versions = options.versions ?? new MemoryProductVersionsRepository();
    this.resolveAuthorLabel = options.resolveAuthorLabel;
  }

  async create(input: ProductDto, actor: ActorContext, reason?: string): Promise<Product> {
    const parsed = productCreateSchema.parse(input);
    const legalNotice = normalizeLegalNotice(parsed.legalNotice);
    await this.assertContentAllowed(actor, parsed.key, "product.create_refused", { categoryId: parsed.categoryId, legalNotice }, reason);
    const now = new Date();
    const product: Product = {
      ...parsed,
      legalNotice,
      version: 1,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      countryIds: [],
      requiresManualReview: parsed.sensitivity === "standard" ? parsed.requiresManualReview : true,
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.create(product);
    await this.versions.append({
      id: crypto.randomUUID(),
      productId: product.id,
      versionNumber: 1,
      snapshot: { ...contentOf(product) },
      changes: [],
      reason: reason ?? "Création du produit",
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      createdAt: now
    });
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
    const contentBefore = contentOf(product);
    const nextFlags: ProductFlags = { ...product.flags, ...pickDefined(flags) };
    const nextLegalNotice = changes.legalNotice ? normalizeLegalNotice({ ...contentBefore.legalNotice, ...changes.legalNotice }) : contentBefore.legalNotice;
    await this.assertContentAllowed(
      actor,
      product.id,
      "product.update_refused",
      {
        ...(changes.categoryId !== undefined && changes.categoryId !== product.categoryId ? { categoryId: changes.categoryId } : {}),
        legalNotice: changes.legalNotice ? nextLegalNotice : {}
      },
      reason
    );
    if (changes.status === "public" && (!product.countryIds.length || !nextFlags.product_public_enabled)) {
      throw new Error("Product public activation requires country association and product_public_enabled");
    }
    const nextSensitivity = changes.sensitivity ?? product.sensitivity;
    Object.assign(product, pickDefined(changes), {
      flags: nextFlags,
      legalNotice: nextLegalNotice,
      // Same invariant as create: anything above `standard` stays under manual review.
      requiresManualReview: nextSensitivity === "standard" ? changes.requiresManualReview ?? product.requiresManualReview : true,
      updatedAt: new Date()
    });
    const contentChanges = diffProductContent(contentBefore, contentOf(product));
    const versionBefore = product.version ?? 1;
    if (contentChanges.length) product.version = versionBefore + 1;
    await this.repository.update(id, product);
    if (contentChanges.length) await this.recordVersion(product, versionBefore, contentBefore, contentChanges, reason, actor);
    this.audit.write({
      actor,
      action: "product.updated",
      targetType: "Product",
      targetId: product.id,
      // US2-4: a global change names every country the product is linked to (scope is not masked).
      scope: { productId: product.id, countryIds: [...product.countryIds] },
      result: "success",
      reason,
      context: { status: product.status, flags: product.flags, before, after: this.snapshot(product), ...(contentChanges.length ? { version: product.version, changedFields: contentChanges.map((change) => change.field) } : {}) }
    });
    return product;
  }

  /** Spec 070 PROD-009: content history of a product, most recent version first. */
  async listVersions(productId: string): Promise<ProductVersionView[]> {
    await this.require(productId);
    const labels = new Map<string, Promise<string | undefined>>();
    const labelOf = (authorId: string): Promise<string | undefined> => {
      if (!this.resolveAuthorLabel) return Promise.resolve(undefined);
      if (!labels.has(authorId)) labels.set(authorId, this.resolveAuthorLabel(authorId).catch(() => undefined));
      return labels.get(authorId)!;
    };
    const records = await this.versions.list(productId);
    return Promise.all(records.map(async (record): Promise<ProductVersionView> => {
      const authorLabel = record.authorId ? await labelOf(record.authorId) : undefined;
      return {
        versionNumber: record.versionNumber,
        createdAt: record.createdAt.toISOString(),
        authorId: record.authorId ?? null,
        ...(authorLabel ? { authorLabel } : {}),
        reason: record.reason,
        changes: record.changes,
        snapshot: record.snapshot
      };
    }));
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
    const { product, state } = await this.resolvePublicProduct(countryId, productKey, countryFlags, globalFlags, actor);
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

  /**
   * Spec 070 PROD-005/007: requirements of a publicly visible product (documents asked, legal notice,
   * category). Same visibility rules and the same audited refusal as the public product page.
   */
  async publicRequirements(countryId: string, productKey: string, countryFlags: Parameters<PublicJourneyFlagPolicy["resolve"]>[0]["countryFlags"], globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true, quote_request_enabled: true }, actor?: ActorContext): Promise<PublicProductRequirements> {
    const { product } = await this.resolvePublicProduct(countryId, productKey, countryFlags, globalFlags, actor);
    const category = product.categoryId ? await this.categories.find(product.categoryId) : undefined;
    return {
      productKey: product.key,
      requiredDocumentKinds: [...(product.requiredDocumentKinds ?? [])],
      legalNotice: normalizeLegalNotice(product.legalNotice),
      category: category ? { key: category.key, name: category.name, nameEn: category.nameEn ?? null } : null
    };
  }

  private async resolvePublicProduct(countryId: string, productKey: string, countryFlags: Parameters<PublicJourneyFlagPolicy["resolve"]>[0]["countryFlags"], globalFlags: Partial<Record<string, boolean>>, actor?: ActorContext): Promise<{ product: Product; state: ReturnType<PublicJourneyFlagPolicy["resolve"]> }> {
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
    return { product, state };
  }

  findByKey(productKey: string): Promise<Product | undefined> {
    return this.repository.findByKey(productKey);
  }

  require(id: string): Promise<Product> {
    return this.repository.require(id);
  }

  /** Category must exist and be active; legal notice texts must pass the regulated wording filter. */
  private async assertContentAllowed(actor: ActorContext, targetId: string, action: string, content: { categoryId?: string | undefined; legalNotice: ProductLegalNotice }, requestReason?: string): Promise<void> {
    if (content.categoryId) {
      const category = await this.categories.find(content.categoryId);
      if (!category || category.status !== "active") {
        this.refuseTarget(actor, targetId, action, category ? "category_not_active" : "category_not_found", requestReason, { categoryId: content.categoryId });
        throw catalogUnprocessable(CatalogErrorCodes.categoryInvalid, category ? "Product category must be active" : "Product category not found");
      }
    }
    const found = new Set<string>();
    for (const language of LEGAL_NOTICE_LANGUAGES) {
      for (const field of LEGAL_NOTICE_FIELDS) {
        const text = content.legalNotice[language]?.[field];
        if (text) for (const wording of findForbiddenWordingAnyLanguage(text)) found.add(wording);
      }
    }
    if (found.size) {
      this.refuseTarget(actor, targetId, action, "forbidden_wording", requestReason, { wording: [...found] });
      throw catalogUnprocessable(CatalogErrorCodes.forbiddenWording, `Legal notice contains forbidden wording: ${[...found].join(", ")}`);
    }
  }

  /** Writes the version row; a legacy product with no history first gets its baseline version 1. */
  private async recordVersion(product: Product, versionBefore: number, contentBefore: ProductContent, changes: ProductVersionChange[], reason: string, actor: ActorContext): Promise<void> {
    if (versionBefore === 1 && (await this.versions.list(product.id)).length === 0) {
      await this.versions.append({
        id: crypto.randomUUID(),
        productId: product.id,
        versionNumber: 1,
        snapshot: { ...contentBefore },
        changes: [],
        reason: "Version initiale (historique non enregistré)",
        createdAt: product.createdAt
      });
    }
    const record: ProductVersionRecord = {
      id: crypto.randomUUID(),
      productId: product.id,
      versionNumber: product.version ?? versionBefore + 1,
      snapshot: { ...contentOf(product) },
      changes,
      reason,
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      createdAt: new Date()
    };
    await this.versions.append(record);
  }

  private refuseTarget(actor: ActorContext, targetId: string, action: string, refusal: string, requestReason?: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action,
      targetType: "Product",
      targetId,
      scope: {},
      result: "refused",
      reason: refusal,
      context: { requestReason, ...context }
    });
  }

  private snapshot(product: Product): Record<string, unknown> {
    return {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      sensitivity: product.sensitivity,
      requiresDocuments: product.requiresDocuments,
      requiresManualReview: product.requiresManualReview,
      legalNotice: normalizeLegalNotice(product.legalNotice),
      requiredDocumentKinds: [...(product.requiredDocumentKinds ?? [])],
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

  constructor(audit = new AuditLogWriter(), repository?: ProductsRepository, options: ProductsServiceOptions = {}) {
    this.service = new ProductsService(audit, repository, options);
  }
}

export { PRODUCT_CATEGORIES_REPOSITORY, MemoryProductCategoriesRepository, type ProductCategoriesRepository, type ProductCategory } from "./product-categories.repository";
export { PRODUCT_VERSIONS_REPOSITORY, MemoryProductVersionsRepository, type ProductVersionsRepository } from "./product-versions.repository";
export { PRODUCTS_REPOSITORY, MemoryProductsRepository, type ProductsRepository } from "./products.repository";
