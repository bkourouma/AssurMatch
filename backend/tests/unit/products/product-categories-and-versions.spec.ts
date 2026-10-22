import { describe, expect, it } from "vitest";
import type { CatalogActivationBlocker } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { CatalogActivationGuard } from "../../../src/modules/catalog/catalog-activation-guard";
import { CatalogAdminService } from "../../../src/modules/catalog/catalog-admin.service";
import { CatalogFlagService } from "../../../src/modules/catalog/catalog-flag.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { RegulatoryRegimesService } from "../../../src/modules/regulatory-regimes/regulatory-regimes.module";
import { AdminProductCategoriesController } from "../../../src/modules/products/admin-product-categories.controller";
import { MemoryProductCategoriesRepository } from "../../../src/modules/products/product-categories.repository";
import { ProductCategoriesService } from "../../../src/modules/products/product-categories.service";
import { MemoryProductVersionsRepository } from "../../../src/modules/products/product-versions.repository";
import { ProductsService } from "../../../src/modules/products/products.module";
import { MemoryProductsRepository } from "../../../src/modules/products/products.repository";

const superAdmin: ActorContext = { actorId: "11111111-1111-4111-8111-111111111111", roles: ["super_admin"], mfaVerified: true };
const scopedAdmin: ActorContext = { actorId: "33333333-3333-4333-8333-333333333333", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["country-ci"] };
const openFlags = { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true } as never;

function build(options: { productBlockers?: CatalogActivationBlocker[] } = {}) {
  const audit = new AuditLogWriter();
  const productsRepository = new MemoryProductsRepository();
  const categoriesRepository = new MemoryProductCategoriesRepository();
  const versions = new MemoryProductVersionsRepository();
  const products = new ProductsService(audit, productsRepository, {
    categories: categoriesRepository,
    versions,
    resolveAuthorLabel: async (id) => (id === superAdmin.actorId ? "Admin Plateforme" : undefined)
  });
  const categories = new ProductCategoriesService(audit, productsRepository, categoriesRepository);
  const controller = new AdminProductCategoriesController(categories, audit);
  const countries = new CountriesService(audit);
  const featureFlags = new FeatureFlagsService(audit);
  const guard = new CatalogActivationGuard({
    checklist: { countryActivationBlockers: async () => [], productActivationBlockers: async () => options.productBlockers ?? [] },
    quoteForms: { list: async () => [] },
    consentTexts: { listTexts: async () => [] }
  });
  const flags = new CatalogFlagService({ audit, countries, products, featureFlags, guard });
  const admin = new CatalogAdminService({ audit, countries, products, regimes: new RegulatoryRegimesService(audit), flags, guard });
  return { audit, products, categories, controller, countries, admin, flags };
}

async function activeCategory(env: ReturnType<typeof build>, key = "auto-moto") {
  const created = await env.categories.create({ key, name: "Auto et moto", reason: "creation categorie" }, superAdmin);
  return env.categories.update(created.id, { status: "active", reason: "activation categorie" }, superAdmin);
}

describe("product categories (spec 070 PROD-001)", () => {
  it("creates a draft category, audits it and lists it with its product count", async () => {
    const env = build();
    const created = await env.categories.create({ key: "sante", name: "Santé", nameEn: "Health", description: "Produits santé", sortOrder: 2, reason: "creation categorie" }, superAdmin);
    expect(created).toMatchObject({ key: "sante", status: "draft", nameEn: "Health", sortOrder: 2, productCount: 0 });
    expect(env.audit.all().some((entry) => entry.action === "product_category.created" && entry.result === "success")).toBe(true);
    expect(await env.categories.list()).toEqual([expect.objectContaining({ key: "sante", productCount: 0 })]);
  });

  it("refuses a duplicate key and a key that is not kebab-case", async () => {
    const env = build();
    await env.categories.create({ key: "sante", name: "Santé", reason: "creation categorie" }, superAdmin);
    await expect(env.categories.create({ key: "sante", name: "Autre", reason: "creation categorie" }, superAdmin)).rejects.toMatchObject({ status: 409 });
    await expect(env.categories.create({ key: "Santé Plus", name: "Autre", reason: "creation categorie" }, superAdmin)).rejects.toThrow();
    expect(env.audit.all().some((entry) => entry.action === "product_category.create_refused" && entry.reason === "duplicate_key")).toBe(true);
  });

  it("refuses a stale update with 409 and keeps the key immutable", async () => {
    const env = build();
    const created = await env.categories.create({ key: "sante", name: "Santé", reason: "creation categorie" }, superAdmin);
    await expect(env.categories.update(created.id, { name: "Santé 2", expectedUpdatedAt: "2020-01-01T00:00:00.000Z", reason: "renommage categorie" }, superAdmin))
      .rejects.toMatchObject({ status: 409 });
    const renamed = await env.categories.update(created.id, { name: "Santé 2", nameEn: null, expectedUpdatedAt: created.updatedAt, reason: "renommage categorie" }, superAdmin);
    expect(renamed).toMatchObject({ key: "sante", name: "Santé 2" });
  });

  it("refuses to retire a category while non-retired products use it, then allows it", async () => {
    const env = build();
    const category = await activeCategory(env);
    const product = await env.products.create({ key: "auto", name: "Auto", categoryId: category.id }, superAdmin);
    expect((await env.categories.get(category.id)).productCount).toBe(1);
    await expect(env.categories.update(category.id, { status: "retired", reason: "retrait categorie" }, superAdmin))
      .rejects.toMatchObject({ status: 409, response: { code: "CATALOG_CATEGORY_IN_USE" } });
    expect(env.audit.all().some((entry) => entry.action === "product_category.retire_refused" && entry.reason === "category_in_use")).toBe(true);
    await env.products.update(product.id, { status: "retired", reason: "retrait produit" }, superAdmin);
    const retired = await env.categories.update(category.id, { status: "retired", reason: "retrait categorie" }, superAdmin);
    expect(retired.status).toBe("retired");
    expect(env.audit.all().some((entry) => entry.action === "product_category.retired" && entry.result === "success")).toBe(true);
  });

  it("only lets an active category be chosen for a product, on create and update", async () => {
    const env = build();
    const draft = await env.categories.create({ key: "brouillon", name: "Brouillon", reason: "creation categorie" }, superAdmin);
    await expect(env.products.create({ key: "a", name: "A", categoryId: draft.id }, superAdmin)).rejects.toMatchObject({ status: 422, response: { code: "PRODUCT_CATEGORY_INVALID" } });
    await expect(env.products.create({ key: "b", name: "B", categoryId: "9b2f3c1e-7d6a-4f58-9a21-0c1d2e3f4a5b" }, superAdmin)).rejects.toMatchObject({ status: 422 });
    const category = await activeCategory(env);
    const product = await env.products.create({ key: "c", name: "C", categoryId: category.id }, superAdmin);
    await expect(env.products.update(product.id, { categoryId: draft.id, reason: "changement categorie" }, superAdmin)).rejects.toMatchObject({ status: 422 });
    expect(env.audit.all().filter((entry) => entry.action.startsWith("product.") && entry.result === "refused").map((entry) => entry.reason))
      .toEqual(["category_not_active", "category_not_found", "category_not_active"]);
  });

  it("audits and refuses access for a country scoped admin and keeps reads open to products:read", async () => {
    const env = build();
    expect(() => env.controller.create(scopedAdmin, { key: "x-y", name: "X", reason: "creation categorie" })).toThrow();
    expect(env.audit.all().some((entry) => entry.action === "product_category.create_refused" && entry.reason === "rbac_denied")).toBe(true);
    await expect(env.controller.list(scopedAdmin)).resolves.toEqual([]);
  });
});

describe("product content, legal notice and history (spec 070 PROD-005/007/008/009)", () => {
  it("persists a bilingual legal notice and the required document kinds, version 1 at creation", async () => {
    const env = build();
    const product = await env.products.create({
      key: "auto", name: "Auto",
      legalNotice: { fr: { legalText: "Texte légal", disclaimer: "Offre indicative" }, en: { disclaimer: "Indicative offer" } },
      requiredDocumentKinds: ["identity", "vehicle_registration"]
    }, superAdmin, "creation produit");
    expect(product.version).toBe(1);
    const stored = await env.products.require(product.id);
    expect(stored.legalNotice.en?.disclaimer).toBe("Indicative offer");
    expect(stored.requiredDocumentKinds).toEqual(["identity", "vehicle_registration"]);
    const history = await env.products.listVersions(product.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ versionNumber: 1, changes: [], reason: "creation produit", authorId: superAdmin.actorId, authorLabel: "Admin Plateforme" });
  });

  it("creates version 2 with the exact diff when the English disclaimer changes, newest first", async () => {
    const env = build();
    const product = await env.products.create({ key: "auto", name: "Auto", legalNotice: { en: { disclaimer: "Indicative offer" } } }, superAdmin, "creation produit");
    const updated = await env.products.update(product.id, { legalNotice: { en: { disclaimer: "Indicative offer, to be confirmed by the broker" } }, reason: "precision avertissement" }, superAdmin);
    expect(updated.version).toBe(2);
    const history = await env.products.listVersions(product.id);
    expect(history.map((entry) => entry.versionNumber)).toEqual([2, 1]);
    expect(history[0]).toMatchObject({
      reason: "precision avertissement",
      changes: [{ field: "legalNotice.en.disclaimer", before: "Indicative offer", after: "Indicative offer, to be confirmed by the broker" }]
    });
    expect(history[0]?.snapshot).toMatchObject({ name: "Auto", legalNotice: { en: { disclaimer: "Indicative offer, to be confirmed by the broker" } } });
  });

  it("creates no version when nothing in the content changes, nor for status or flag changes", async () => {
    const env = build();
    const product = await env.products.create({ key: "auto", name: "Auto", requiredDocumentKinds: ["identity"] }, superAdmin);
    await env.products.update(product.id, { name: "Auto", requiredDocumentKinds: ["identity"], reason: "aucune modification" }, superAdmin);
    await env.products.update(product.id, { status: "internal", flags: { product_quote_enabled: true }, reason: "passage interne" }, superAdmin);
    expect((await env.products.require(product.id)).version).toBe(1);
    expect(await env.products.listVersions(product.id)).toHaveLength(1);
    await env.products.update(product.id, { requiredDocumentKinds: ["identity", "proof_of_address"], reason: "ajout justificatif" }, superAdmin);
    const history = await env.products.listVersions(product.id);
    expect(history[0]).toMatchObject({ versionNumber: 2, changes: [{ field: "requiredDocumentKinds", before: ["identity"], after: ["identity", "proof_of_address"] }] });
  });

  it("refuses forbidden wording in a legal notice, in any language, and audits the refusal", async () => {
    const env = build();
    await expect(env.products.create({ key: "auto", name: "Auto", legalNotice: { fr: { disclaimer: "Meilleur prix garanti" } } }, superAdmin))
      .rejects.toMatchObject({ status: 422, response: { code: "FORBIDDEN_WORDING" } });
    expect(env.audit.all().some((entry) => entry.action === "product.create_refused" && entry.reason === "forbidden_wording")).toBe(true);
  });

  it("exposes requirements of a public product only, with the same refusal as the product page", async () => {
    const env = build();
    const category = await activeCategory(env);
    const country = await env.countries.create({ isoCode: "CI", name: "Cote d'Ivoire", currency: "XOF", languages: ["fr"], timezone: "Africa/Abidjan", regulatoryFamily: "cima", status: "public" }, superAdmin);
    const flags = { product_public_enabled: true, product_quote_enabled: true, product_comparison_enabled: true };
    const publicProduct = await env.products.create({ key: "auto", name: "Auto", categoryId: category.id, status: "public", flags: { ...flags, product_document_upload_enabled: false, product_sensitive_data_enabled: false, product_manual_review_required: false, product_ai_scoring_enabled: false, product_ai_form_assistant_enabled: false }, requiredDocumentKinds: ["identity"], legalNotice: { fr: { disclaimer: "Offre indicative" } } }, superAdmin);
    await env.products.associateCountry(publicProduct.id, country.id, superAdmin);
    await env.products.create({ key: "interne", name: "Interne", requiredDocumentKinds: ["identity"] }, superAdmin);
    const requirements = await env.products.publicRequirements(country.id, "auto", openFlags);
    expect(requirements).toEqual({
      productKey: "auto",
      requiredDocumentKinds: ["identity"],
      legalNotice: { fr: { disclaimer: "Offre indicative" } },
      category: { key: "auto-moto", name: "Auto et moto", nameEn: null }
    });
    await expect(env.products.publicRequirements(country.id, "interne", openFlags)).rejects.toThrow("Product is not publicly available");
    expect(env.audit.all().some((entry) => entry.result === "refused" && entry.targetType === "Product")).toBe(true);
  });
});

describe("product public activation guard (spec 070 PRD 36)", () => {
  const blocker: CatalogActivationBlocker = { section: "product:x", control: "product_has_published_offer", label: "Offre publiee", evidence: "aucune" };

  it("refuses status public and product_public_enabled=true while blockers exist, never the deactivation", async () => {
    const env = build({ productBlockers: [blocker] });
    const country = await env.countries.create({ isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima" }, superAdmin);
    const product = await env.products.create({ key: "auto", name: "Auto" }, superAdmin);
    await env.products.associateCountry(product.id, country.id, superAdmin);
    await expect(env.admin.updateProduct(superAdmin, product.id, { status: "public", reason: "passage public" }))
      .rejects.toMatchObject({ status: 422, response: { code: "ACTIVATION_BLOCKED", blockers: [expect.objectContaining({ control: "product_has_published_offer" })] } });
    await expect(env.admin.toggleProductFlag(superAdmin, product.id, { key: "product_public_enabled", value: true, reason: "ouverture publique" }))
      .rejects.toMatchObject({ status: 422, response: { code: "ACTIVATION_BLOCKED" } });
    expect(env.audit.all().filter((entry) => entry.result === "refused" && entry.reason === "activation_blocked")).toHaveLength(2);
    // Deactivation of an already public product is free.
    await env.products.writeFlag(product.id, "product_public_enabled", true);
    const closed = await env.admin.toggleProductFlag(superAdmin, product.id, { key: "product_public_enabled", value: false, reason: "fermeture immediate" });
    expect(closed.flags.product_public_enabled).toBe(false);
    const suspended = await env.admin.updateProduct(superAdmin, product.id, { status: "suspended", reason: "suspension produit" });
    expect(suspended.status).toBe("suspended");
  });

  it("serves the admin view with the new fields and the version history", async () => {
    const env = build();
    const created = await env.admin.createProduct(superAdmin, { key: "auto", name: "Auto", requiredDocumentKinds: ["identity"], legalNotice: { en: { disclaimer: "Indicative" } }, reason: "creation produit" });
    expect(created).toMatchObject({ version: 1, requiredDocumentKinds: ["identity"], legalNotice: { en: { disclaimer: "Indicative" } } });
    const updated = await env.admin.updateProduct(superAdmin, created.id, { name: "Auto 2", reason: "renommage produit" });
    expect(updated.version).toBe(2);
    expect((await env.admin.listProductVersions(superAdmin, created.id)).map((entry) => entry.versionNumber)).toEqual([2, 1]);
    await expect(env.admin.listProductVersions({ roles: ["broker_agent"], mfaVerified: true }, created.id)).rejects.toMatchObject({ status: 403 });
  });
});
