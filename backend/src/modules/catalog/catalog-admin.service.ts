import {
  adminCountryCreateSchema,
  adminCountryUpdateSchema,
  adminProductCreateSchema,
  adminProductUpdateSchema,
  catalogActionReasonSchema,
  countryProductLinkCreateSchema,
  countryStatusChangeSchema,
  COUNTRY_FEATURE_FLAG_DEFAULTS,
  PRODUCT_FEATURE_FLAG_DEFAULTS,
  type AdminCountryProductLinkView,
  type AdminCountryView,
  type AdminProductView,
  type AdminRegulatoryRegimeView,
  type CatalogFlagToggleDto
} from "../../../../packages/shared/contracts/catalog.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { Country, CountriesService } from "../countries/countries.module";
import { countryLinkFor, effectiveProductFlags, type CountryProductLink, type Product, type ProductsService } from "../products/products.module";
import type { RegulatoryRegime, RegulatoryRegimesService } from "../regulatory-regimes/regulatory-regimes.module";
import { CatalogAccess } from "./catalog-access";
import type { CatalogActivationGuard } from "./catalog-activation-guard";
import { catalogConflict, CatalogErrorCodes, catalogNotFound, catalogUnprocessable } from "./catalog-errors";
import type { CatalogFlagService } from "./catalog-flag.service";

export interface CatalogAdminServiceDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  regimes: RegulatoryRegimesService;
  flags: CatalogFlagService;
  guard: CatalogActivationGuard;
  onCatalogChanged?: () => Promise<void> | void;
}

/**
 * Spec 050: orchestration behind the admin catalogue routes. Controllers stay thin; this service
 * applies role and country scope, delegates the domain change, and returns admin views.
 */
export class CatalogAdminService {
  private readonly access: CatalogAccess;

  constructor(private readonly deps: CatalogAdminServiceDeps) {
    this.access = new CatalogAccess(deps.audit);
  }

  /* ----------------------------------------------------------------- countries */

  async listCountries(actor: ActorContext): Promise<AdminCountryView[]> {
    this.access.require(actor, this.access.canRead(actor, "countries:read"), this.readRefusal("Country", "list"));
    const countries = await this.deps.countries.listAdmin();
    return countries.filter((country) => this.access.inCountryScope(actor, country.id)).map((country) => this.countryView(country));
  }

  async getCountry(actor: ActorContext, countryId: string): Promise<AdminCountryView> {
    this.access.require(actor, this.access.canRead(actor, "countries:read", { countryId }) && this.access.inCountryScope(actor, countryId), this.readRefusal("Country", countryId, { countryId }));
    const country = await this.requireCountry(countryId);
    const [links, blockers] = await Promise.all([
      this.linksForCountry(country.id),
      this.deps.guard.countryPublicBlockers(country.id)
    ]);
    return { ...this.countryView(country), links, checklist: { ready: blockers.length === 0, blockers } };
  }

  async createCountry(actor: ActorContext, input: unknown): Promise<AdminCountryView> {
    const { reason, ...parsed } = adminCountryCreateSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "countries:create") && this.access.isUnscoped(actor), {
      action: "country.create_refused", targetType: "Country", targetId: parsed.isoCode, refusal: "rbac_denied", requestReason: reason
    });
    if (await this.deps.countries.findByIsoCode(parsed.isoCode)) {
      this.access.refuse(actor, { action: "country.create_refused", targetType: "Country", targetId: parsed.isoCode, refusal: "duplicate_iso_code", requestReason: reason });
      throw catalogConflict(`Country ${parsed.isoCode} already exists`, "CONFLICT");
    }
    await this.assertRegime(actor, parsed.regulatoryRegimeId, parsed.isoCode, reason);
    // A new country always starts in draft with every flag closed (contract).
    const country = await this.deps.countries.create({ ...parsed, status: "draft", flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS } }, actor, reason);
    await this.changed();
    return this.countryView(country);
  }

  async updateCountry(actor: ActorContext, countryId: string, input: unknown): Promise<AdminCountryView> {
    const parsed = adminCountryUpdateSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "countries:update", { countryId }), {
      action: "country.update_refused", targetType: "Country", targetId: countryId, scope: { countryId }, refusal: "rbac_denied", requestReason: parsed.reason
    });
    await this.requireCountry(countryId);
    const country = await this.deps.countries.update(countryId, parsed, actor);
    await this.changed();
    return this.countryView(country);
  }

  async changeCountryStatus(actor: ActorContext, countryId: string, input: unknown): Promise<AdminCountryView> {
    const { status, reason } = countryStatusChangeSchema.parse(input);
    const target = { action: "country.status_change_refused", targetType: "Country", targetId: countryId, scope: { countryId }, requestReason: reason, context: { status } };
    if (status === "public") {
      this.access.require(actor, this.access.isCompliance(actor), { ...target, refusal: "public_activation_requires_compliance" });
    } else {
      this.access.require(actor, this.access.can(actor, "countries:update", { countryId }), { ...target, refusal: "rbac_denied" });
    }
    const country = await this.requireCountry(countryId);
    if (status === "public" && country.status !== "public") {
      const blockers = await this.deps.guard.countryPublicBlockers(countryId);
      if (blockers.length) {
        this.access.refuse(actor, { ...target, refusal: "activation_blocked", context: { status, blockers } });
        throw catalogUnprocessable(CatalogErrorCodes.activationBlocked, "Activation blocked: the activation checklist has failing blocking controls", blockers);
      }
    }
    const updated = await this.deps.countries.changeStatus(countryId, status, reason, actor);
    await this.changed();
    return this.countryView(updated);
  }

  async toggleCountryFlag(actor: ActorContext, countryId: string, input: CatalogFlagToggleDto): Promise<AdminCountryView> {
    await this.requireCountry(countryId);
    return this.countryView(await this.deps.flags.toggleCountryFlag(actor, countryId, input));
  }

  /* ------------------------------------------------------------------ products */

  async listProducts(actor: ActorContext, countryId?: string): Promise<AdminProductView[]> {
    this.access.require(
      actor,
      this.access.canRead(actor, "products:read", countryId ? { countryId } : {}) && (!countryId || this.access.inCountryScope(actor, countryId)),
      this.readRefusal("Product", "list", countryId ? { countryId } : {})
    );
    return (await this.deps.products.listAdmin(countryId)).map((product) => this.productView(product));
  }

  async getProduct(actor: ActorContext, productId: string): Promise<AdminProductView> {
    this.access.require(actor, this.access.canRead(actor, "products:read", { productId }), this.readRefusal("Product", productId, { productId }));
    return this.productView(await this.requireProduct(productId));
  }

  async createProduct(actor: ActorContext, input: unknown): Promise<AdminProductView> {
    const { reason, ...parsed } = adminProductCreateSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "products:create") && this.access.isUnscoped(actor), {
      action: "product.create_refused", targetType: "Product", targetId: parsed.key, refusal: "rbac_denied", requestReason: reason
    });
    if (await this.deps.products.findByKey(parsed.key)) {
      this.access.refuse(actor, { action: "product.create_refused", targetType: "Product", targetId: parsed.key, refusal: "duplicate_key", requestReason: reason });
      throw catalogConflict(`Product ${parsed.key} already exists`, "CONFLICT");
    }
    const product = await this.deps.products.create({ ...parsed, status: "draft", flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS } }, actor, reason);
    await this.changed();
    return this.productView(product);
  }

  async updateProduct(actor: ActorContext, productId: string, input: unknown): Promise<AdminProductView> {
    const parsed = adminProductUpdateSchema.parse(input);
    // A product is global: suspending it closes it in every country (US2-4).
    this.access.require(actor, this.access.can(actor, "products:update", { productId }) && this.access.isUnscoped(actor), {
      action: "product.update_refused", targetType: "Product", targetId: productId, scope: { productId }, refusal: "rbac_denied", requestReason: parsed.reason
    });
    const current = await this.requireProduct(productId);
    if (parsed.requiresManualReview === false && current.requiresManualReview && current.sensitivity !== "standard") {
      this.access.require(actor, this.access.isCompliance(actor), {
        action: "product.update_refused", targetType: "Product", targetId: productId, scope: { productId }, refusal: "manual_review_removal_requires_compliance", requestReason: parsed.reason
      });
    }
    try {
      const product = await this.deps.products.update(productId, parsed, actor);
      await this.changed();
      return this.productView(product);
    } catch (error) {
      if (error instanceof Error && /Product public activation requires/.test(error.message)) {
        this.access.refuse(actor, { action: "product.update_refused", targetType: "Product", targetId: productId, scope: { productId }, refusal: "activation_blocked", requestReason: parsed.reason });
        throw catalogUnprocessable(CatalogErrorCodes.activationBlocked, error.message);
      }
      throw error;
    }
  }

  async toggleProductFlag(actor: ActorContext, productId: string, input: CatalogFlagToggleDto): Promise<AdminProductView> {
    await this.requireProduct(productId);
    return this.productView(await this.deps.flags.toggleProductFlag(actor, productId, input));
  }

  /* --------------------------------------------------------------------- links */

  async listLinks(actor: ActorContext, countryId: string): Promise<AdminCountryProductLinkView[]> {
    this.access.require(actor, this.access.canRead(actor, "products:read", { countryId }) && this.access.inCountryScope(actor, countryId), this.readRefusal("CountryProduct", countryId, { countryId }));
    await this.requireCountry(countryId);
    return this.linksForCountry(countryId);
  }

  async createLink(actor: ActorContext, countryId: string, input: unknown): Promise<AdminCountryProductLinkView> {
    const { productId, reason } = countryProductLinkCreateSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "products:update", { countryId, productId }), {
      action: "country_product.create_refused", targetType: "CountryProduct", targetId: `${productId}@${countryId}`, scope: { countryId, productId }, refusal: "rbac_denied", requestReason: reason
    });
    await this.requireCountry(countryId);
    const product = await this.requireProduct(productId);
    const link = await this.deps.products.createLink(product.id, countryId, reason, actor);
    await this.changed();
    return this.linkView(await this.requireProduct(productId), link);
  }

  async retireLink(actor: ActorContext, countryId: string, productId: string, input: unknown): Promise<AdminCountryProductLinkView> {
    const { reason } = catalogActionReasonSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "products:update", { countryId, productId }), {
      action: "country_product.retire_refused", targetType: "CountryProduct", targetId: `${productId}@${countryId}`, scope: { countryId, productId }, refusal: "rbac_denied", requestReason: reason
    });
    await this.requireCountry(countryId);
    await this.requireProduct(productId);
    const link = await this.deps.products.retireLink(productId, countryId, reason, actor);
    await this.changed();
    return this.linkView(await this.requireProduct(productId), link);
  }

  async toggleLinkFlag(actor: ActorContext, countryId: string, productId: string, input: CatalogFlagToggleDto): Promise<AdminCountryProductLinkView> {
    await this.requireCountry(countryId);
    await this.requireProduct(productId);
    const link = await this.deps.flags.toggleLinkFlag(actor, countryId, productId, input);
    return this.linkView(await this.requireProduct(productId), link);
  }

  /* ------------------------------------------------------------------- regimes */

  async listRegimes(actor: ActorContext): Promise<AdminRegulatoryRegimeView[]> {
    this.access.require(actor, this.access.canRead(actor, "countries:read"), this.readRefusal("RegulatoryRegime", "list"));
    return (await this.deps.regimes.list()).map((regime) => this.regimeView(regime));
  }

  async createRegime(actor: ActorContext, input: unknown): Promise<AdminRegulatoryRegimeView> {
    this.access.require(actor, this.access.can(actor, "countries:create") && this.access.isUnscoped(actor), {
      action: "regulatory_regime.create_refused", targetType: "RegulatoryRegime", targetId: "new", refusal: "rbac_denied"
    });
    return this.regimeView(await this.deps.regimes.createFromAdmin(input, actor));
  }

  async updateRegime(actor: ActorContext, regimeId: string, input: Parameters<RegulatoryRegimesService["update"]>[1]): Promise<AdminRegulatoryRegimeView> {
    this.access.require(actor, this.access.can(actor, "countries:update") && this.access.isUnscoped(actor), {
      action: "regulatory_regime.update_refused", targetType: "RegulatoryRegime", targetId: regimeId, refusal: "rbac_denied", requestReason: input.reason
    });
    return this.regimeView(await this.deps.regimes.update(regimeId, input, actor));
  }

  async retireRegime(actor: ActorContext, regimeId: string, reason: string): Promise<AdminRegulatoryRegimeView> {
    this.access.require(actor, this.access.can(actor, "countries:update") && this.access.isUnscoped(actor), {
      action: "regulatory_regime.retire_refused", targetType: "RegulatoryRegime", targetId: regimeId, refusal: "rbac_denied", requestReason: reason
    });
    return this.regimeView(await this.deps.regimes.retire(regimeId, reason, actor));
  }

  /* --------------------------------------------------------------------- views */

  private async linksForCountry(countryId: string): Promise<AdminCountryProductLinkView[]> {
    const products = await this.deps.products.listAdmin();
    return products.flatMap((product) => {
      const link = product.countryLinks?.find((candidate) => candidate.countryId === countryId) ?? (product.countryIds.includes(countryId) ? countryLinkFor(product, countryId) : undefined);
      return link ? [this.linkView(product, link)] : [];
    });
  }

  private linkView(product: Product, link: CountryProductLink): AdminCountryProductLinkView {
    return {
      countryId: link.countryId,
      productId: product.id,
      productKey: product.key,
      productName: product.name,
      status: link.status,
      flags: { ...link.flags },
      effectiveFlags: effectiveProductFlags(product, link),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString()
    };
  }

  private countryView(country: Country): AdminCountryView {
    return {
      id: country.id,
      isoCode: country.isoCode,
      name: country.name,
      currency: country.currency,
      languages: [...country.languages],
      timezone: country.timezone,
      regulatoryFamily: country.regulatoryFamily,
      regulatoryRegimeId: country.regulatoryRegimeId ?? null,
      phoneDialCode: country.phoneDialCode ?? null,
      phoneNationalLengths: [...(country.phoneNationalLengths ?? [])],
      status: country.status,
      flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS, ...country.flags },
      publicSince: country.publicSince ? new Date(country.publicSince).toISOString() : null,
      createdAt: new Date(country.createdAt).toISOString(),
      updatedAt: new Date(country.updatedAt).toISOString()
    };
  }

  private productView(product: Product): AdminProductView {
    return {
      id: product.id,
      key: product.key,
      name: product.name,
      description: product.description ?? null,
      categoryId: product.categoryId ?? null,
      sensitivity: product.sensitivity,
      requiresDocuments: product.requiresDocuments,
      requiresManualReview: product.requiresManualReview,
      status: product.status,
      flags: { ...PRODUCT_FEATURE_FLAG_DEFAULTS, ...product.flags },
      countryIds: [...product.countryIds],
      createdAt: new Date(product.createdAt).toISOString(),
      updatedAt: new Date(product.updatedAt).toISOString()
    };
  }

  private regimeView(regime: RegulatoryRegime): AdminRegulatoryRegimeView {
    return {
      id: regime.id,
      key: regime.key,
      name: regime.name,
      description: regime.description ?? null,
      retentionOverrideYears: regime.retentionOverrideYears ?? null,
      requiresManualActivationReview: regime.requiresManualActivationReview,
      status: regime.status,
      createdAt: new Date(regime.createdAt).toISOString(),
      updatedAt: new Date(regime.updatedAt).toISOString()
    };
  }

  /* ------------------------------------------------------------------- helpers */

  private async requireCountry(countryId: string): Promise<Country> {
    try {
      return await this.deps.countries.require(countryId);
    } catch {
      throw catalogNotFound(`Country ${countryId} not found`);
    }
  }

  private async requireProduct(productId: string): Promise<Product> {
    try {
      return await this.deps.products.require(productId);
    } catch {
      throw catalogNotFound(`Product ${productId} not found`);
    }
  }

  private async assertRegime(actor: ActorContext, regimeId: string | undefined, targetId: string, reason: string): Promise<void> {
    if (!regimeId) return;
    const regime = await this.deps.regimes.find(regimeId);
    if (regime && regime.status !== "retired") return;
    this.access.refuse(actor, { action: "country.create_refused", targetType: "Country", targetId, refusal: regime ? "regime_retired" : "regime_not_found", requestReason: reason });
    throw catalogUnprocessable("REGULATORY_REGIME_INVALID", "Regulatory regime must exist and not be retired");
  }

  private readRefusal(targetType: string, targetId: string, scope: Record<string, unknown> = {}) {
    return { action: "catalog.read_refused", targetType, targetId, scope, refusal: "rbac_denied" };
  }

  private async changed(): Promise<void> {
    await this.deps.onCatalogChanged?.();
  }
}
