import {
  catalogFlagToggleSchema,
  COUNTRY_CATALOG_TOGGLEABLE_FLAGS,
  PRODUCT_CATALOG_TOGGLEABLE_FLAGS,
  type CatalogActivationBlocker,
  type CatalogFlagToggleDto,
  type CountryCatalogToggleableFlag,
  type ProductCatalogToggleableFlag
} from "../../../../packages/shared/contracts/catalog.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { Country, CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import { countryLinkFor, type CountryProductLink, type Product, type ProductsService } from "../products/products.module";
import { CatalogAccess } from "./catalog-access";
import type { CatalogActivationGuard } from "./catalog-activation-guard";
import { catalogConflict, CatalogErrorCodes, catalogForbidden, catalogUnprocessable } from "./catalog-errors";

export const CatalogFlagAuditActions = {
  country: "country.flag_changed",
  product: "product.flag_changed",
  link: "country_product.flag_changed"
} as const;

const SENSITIVE_FLAG_MESSAGE = "Sensitive flag: it follows the audited compliance procedure and cannot be toggled from the catalogue";
const SENSITIVE_PRODUCTS = new Set(["sensitive", "highly_sensitive"]);

export interface CatalogFlagServiceDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  featureFlags: FeatureFlagsService;
  guard: CatalogActivationGuard;
  /** Called after every successful toggle so cached public reads drop at once (SC-006). */
  onCatalogChanged?: () => Promise<void> | void;
}

interface ToggleTarget {
  action: string;
  targetType: string;
  targetId: string;
  scope: Record<string, unknown>;
}

/**
 * Spec 050 R1/R3/R4: the only path that toggles a country, product or country link flag.
 * 1. allowlist (sensitive and AI flags are refused, 403);
 * 2. role and scope;
 * 3. activation conditions (deactivation is always free);
 * 4. writes the JSON read by the public journey, then the FeatureFlag row and its history;
 * 5. audits success and every refusal.
 */
export class CatalogFlagService {
  private readonly access: CatalogAccess;

  constructor(private readonly deps: CatalogFlagServiceDeps) {
    this.access = new CatalogAccess(deps.audit);
  }

  async toggleCountryFlag(actor: ActorContext, countryId: string, input: CatalogFlagToggleDto): Promise<Country> {
    const { key, value, reason } = catalogFlagToggleSchema.parse(input);
    const target: ToggleTarget = { action: CatalogFlagAuditActions.country, targetType: "Country", targetId: countryId, scope: { countryId } };
    this.assertToggleable(actor, key, COUNTRY_CATALOG_TOGGLEABLE_FLAGS, target, reason, value);
    const flag = key as CountryCatalogToggleableFlag;
    const publicActivation = flag === "country_public_enabled" && value;
    if (publicActivation) {
      // R4: opening a country to the public is approved by compliance only.
      this.access.require(actor, this.access.isCompliance(actor), this.refusal(target, "public_activation_requires_compliance", reason, { key, value }));
    } else {
      this.access.require(actor, this.access.can(actor, "countries:update", { countryId }), this.refusal(target, "rbac_denied", reason, { key, value }));
    }
    const country = await this.deps.countries.require(countryId);
    const previous = country.flags[flag] === true;
    if (previous === value) return country;
    if (value) {
      if (flag === "country_public_enabled") {
        await this.assertNoBlockers(actor, target, reason, key, await this.deps.guard.countryPublicBlockers(countryId));
      }
      if (flag === "country_quote_enabled") {
        const linked = (await this.deps.products.listAdmin(countryId)).filter((product) => product.countryIds.includes(countryId)).map((product) => product.id);
        if (!await this.deps.guard.countryHasPublishedForm(countryId, linked)) {
          this.refuseCondition(actor, target, reason, key, "quote_form_required");
          throw catalogUnprocessable(CatalogErrorCodes.quoteFormRequired, "Country quote activation requires a published quote form for at least one linked product");
        }
      }
    }
    const updated = await this.deps.countries.writeFlag(countryId, flag, value);
    await this.recordHistory(actor, flag, "country", countryId, value, reason);
    this.auditSuccess(actor, target, reason, key, previous, value);
    await this.deps.onCatalogChanged?.();
    return updated;
  }

  async toggleProductFlag(actor: ActorContext, productId: string, input: CatalogFlagToggleDto): Promise<Product> {
    const { key, value, reason } = catalogFlagToggleSchema.parse(input);
    const target: ToggleTarget = { action: CatalogFlagAuditActions.product, targetType: "Product", targetId: productId, scope: { productId } };
    this.assertToggleable(actor, key, PRODUCT_CATALOG_TOGGLEABLE_FLAGS, target, reason, value);
    const flag = key as ProductCatalogToggleableFlag;
    const product = await this.deps.products.require(productId);
    const manualReviewRemoval = flag === "product_manual_review_required" && !value && SENSITIVE_PRODUCTS.has(product.sensitivity);
    if (manualReviewRemoval) {
      this.access.require(actor, this.access.isCompliance(actor), this.refusal(target, "manual_review_removal_requires_compliance", reason, { key, value }));
    } else {
      // A global product flag reaches every country: a country scoped admin cannot change it.
      this.access.require(
        actor,
        this.access.can(actor, "products:update", { productId }) && this.access.isUnscoped(actor),
        this.refusal(target, "rbac_denied", reason, { key, value })
      );
    }
    const previous = product.flags[flag] === true;
    if (previous === value) return product;
    if (value && (flag === "product_quote_enabled" || flag === "product_public_enabled")) {
      // Links that inherit this flag would open with it: each of them must meet the link condition.
      const inheriting = (product.countryLinks?.length ? product.countryLinks : product.countryIds.map((countryId) => countryLinkFor(product, countryId)))
        .filter((link): link is CountryProductLink => Boolean(link) && link!.status !== "retired" && link!.status !== "suspended" && (link!.flags[flag] ?? true) === true);
      const blockers: CatalogActivationBlocker[] = [];
      for (const link of inheriting) {
        const ready = flag === "product_quote_enabled"
          ? await this.deps.guard.linkHasPublishedForm(link.countryId, productId)
          : await this.deps.guard.linkHasPublishedConsent(link.countryId, productId);
        if (!ready) blockers.push(this.linkBlocker(flag, link.countryId, productId));
      }
      if (blockers.length) {
        this.refuseCondition(actor, target, reason, key, flag === "product_quote_enabled" ? "quote_form_required" : "consent_text_required", { blockers });
        throw catalogUnprocessable(
          flag === "product_quote_enabled" ? CatalogErrorCodes.quoteFormRequired : CatalogErrorCodes.consentTextRequired,
          flag === "product_quote_enabled" ? "Product quote activation requires a published quote form in every inheriting country" : "Product public activation requires a published lead_transmission consent text in every inheriting country",
          blockers
        );
      }
    }
    const updated = await this.deps.products.writeFlag(productId, flag, value);
    await this.recordHistory(actor, flag, "product", productId, value, reason);
    this.auditSuccess(actor, { ...target, scope: { ...target.scope, countryIds: [...product.countryIds] } }, reason, key, previous, value);
    await this.deps.onCatalogChanged?.();
    return updated;
  }

  async toggleLinkFlag(actor: ActorContext, countryId: string, productId: string, input: CatalogFlagToggleDto): Promise<CountryProductLink> {
    const { key, value, reason } = catalogFlagToggleSchema.parse(input);
    const target: ToggleTarget = { action: CatalogFlagAuditActions.link, targetType: "CountryProduct", targetId: `${productId}@${countryId}`, scope: { countryId, productId } };
    this.assertToggleable(actor, key, PRODUCT_CATALOG_TOGGLEABLE_FLAGS, target, reason, value);
    const flag = key as ProductCatalogToggleableFlag;
    const product = await this.deps.products.require(productId);
    const manualReviewRemoval = flag === "product_manual_review_required" && !value && SENSITIVE_PRODUCTS.has(product.sensitivity);
    if (manualReviewRemoval) {
      this.access.require(actor, this.access.isCompliance(actor), this.refusal(target, "manual_review_removal_requires_compliance", reason, { key, value }));
    } else {
      this.access.require(actor, this.access.can(actor, "products:update", { countryId }), this.refusal(target, "rbac_denied", reason, { key, value }));
    }
    const link = countryLinkFor(product, countryId);
    if (!link || link.status === "retired") {
      this.refuseCondition(actor, target, reason, key, "link_not_active");
      throw catalogConflict("Country product link is missing or retired", "CONFLICT");
    }
    const previous = (link.flags[flag] ?? product.flags[flag]) === true;
    if (link.flags[flag] === value) return link;
    if (value && flag === "product_quote_enabled" && !await this.deps.guard.linkHasPublishedForm(countryId, productId)) {
      this.refuseCondition(actor, target, reason, key, "quote_form_required");
      throw catalogUnprocessable(CatalogErrorCodes.quoteFormRequired, "Product quote activation requires a published quote form for this country and product", [this.linkBlocker(flag, countryId, productId)]);
    }
    if (value && flag === "product_public_enabled" && !await this.deps.guard.linkHasPublishedConsent(countryId, productId)) {
      this.refuseCondition(actor, target, reason, key, "consent_text_required");
      throw catalogUnprocessable(CatalogErrorCodes.consentTextRequired, "Product public activation requires a published lead_transmission consent text for this country and product", [this.linkBlocker(flag, countryId, productId)]);
    }
    const updated = await this.deps.products.writeLinkFlag(productId, countryId, flag, value);
    await this.recordHistory(actor, flag, "product", `${productId}@${countryId}`, value, reason);
    this.auditSuccess(actor, target, reason, key, previous, value);
    await this.deps.onCatalogChanged?.();
    return updated;
  }

  private assertToggleable(actor: ActorContext, key: string, allowlist: readonly string[], target: ToggleTarget, reason: string, value: boolean): void {
    if (allowlist.includes(key)) return;
    // R3: an explicit allowlist; AI, sensitive data and regulated flags follow the compliance path.
    this.access.refuse(actor, this.refusal(target, "flag_not_toggleable", reason, { key, value }));
    throw catalogForbidden(SENSITIVE_FLAG_MESSAGE, CatalogErrorCodes.flagNotToggleable);
  }

  private async assertNoBlockers(actor: ActorContext, target: ToggleTarget, reason: string, key: string, blockers: CatalogActivationBlocker[]): Promise<void> {
    if (!blockers.length) return;
    this.refuseCondition(actor, target, reason, key, "activation_blocked", { blockers });
    throw catalogUnprocessable(CatalogErrorCodes.activationBlocked, "Activation blocked: the activation checklist has failing blocking controls", blockers);
  }

  private async recordHistory(actor: ActorContext, key: string, scopeType: "country" | "product", scopeId: string, value: boolean, reason: string): Promise<void> {
    await this.deps.featureFlags.setFlag({ key, scopeType, scopeId, value, reason }, actor);
  }

  private linkBlocker(flag: string, countryId: string, productId: string): CatalogActivationBlocker {
    return flag === "product_quote_enabled"
      ? { section: `quote:${countryId}:${productId}`, control: "published_quote_form", label: "Formulaire publie", evidence: "manquant" }
      : { section: `quote:${countryId}:${productId}`, control: "published_consent_text", label: "Consentement lead_transmission publie", evidence: "manquant" };
  }

  private refusal(target: ToggleTarget, refusal: string, reason: string, context: Record<string, unknown>) {
    return { action: target.action, targetType: target.targetType, targetId: target.targetId, scope: target.scope, refusal, requestReason: reason, context };
  }

  private refuseCondition(actor: ActorContext, target: ToggleTarget, reason: string, key: string, refusal: string, context: Record<string, unknown> = {}): void {
    this.access.refuse(actor, this.refusal(target, refusal, reason, { key, value: true, ...context }));
  }

  private auditSuccess(actor: ActorContext, target: ToggleTarget, reason: string, key: string, previous: boolean, next: boolean, context: Record<string, unknown> = {}): void {
    this.deps.audit.write({
      actor,
      action: target.action,
      targetType: target.targetType,
      targetId: target.targetId,
      scope: target.scope,
      result: "success",
      reason,
      context: { key, before: { [key]: previous }, after: { [key]: next }, ...context }
    });
  }
}
