import { afterEach, describe, expect, it } from "vitest";
import type { AdminProductCategoryView, AdminProductView, ProductVersionView, PublicProductRequirements } from "../../../packages/shared/contracts/catalog.contracts";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";
import { auditEntries, call, complianceAdmin, countryAdmin, superAdmin, supportAdmin } from "./catalog/catalog-http-helpers";

// Lot 4 (spec 070): PROD-001 categories, PROD-005 documents, PROD-007 legal notice, PROD-008/009 versions.
type ErrorBody = { code: string; message: string };

describe("lot 4: product categories, versions and public requirements over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function createCategory(h: RuntimeHttpHarness, key = "auto-moto"): Promise<AdminProductCategoryView> {
    const created = await call<AdminProductCategoryView>(h, superAdmin, "POST", "/admin/product-categories", { key, name: "Auto et moto", nameEn: "Motor", sortOrder: 1, reason: "creation categorie lot 4" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return created.body;
  }

  async function activateCategory(h: RuntimeHttpHarness, category: AdminProductCategoryView): Promise<AdminProductCategoryView> {
    const updated = await call<AdminProductCategoryView>(h, superAdmin, "PATCH", `/admin/product-categories/${category.id}`, { status: "active", expectedUpdatedAt: category.updatedAt, reason: "activation categorie lot 4" });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    return updated.body;
  }

  it("manages categories: create as draft, duplicate refused, read and write rights, activation", async () => {
    harness = await createRuntimeHttpHarness();
    const category = await createCategory(harness);
    expect(category).toMatchObject({ key: "auto-moto", name: "Auto et moto", nameEn: "Motor", status: "draft", productCount: 0 });
    expect(auditEntries(harness, "product_category.created", "success")).toHaveLength(1);

    const duplicate = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/product-categories", { key: "auto-moto", name: "Autre", reason: "doublon de cle" });
    expect(duplicate.status).toBe(409);

    const invalid = await call(harness, superAdmin, "POST", "/admin/product-categories", { key: "Not Kebab", name: "X", reason: "cle invalide" });
    expect(invalid.status).toBe(400);

    // Writes need an unscoped admin; reads follow products:read (compliance included).
    const scoped = await call<ErrorBody>(harness, countryAdmin("55555555-5555-4555-8555-555555555555"), "POST", "/admin/product-categories", { key: "sante", name: "Sante", reason: "hors perimetre" });
    expect(scoped.status).toBe(403);
    expect(auditEntries(harness, "product_category.create_refused", "refused").length).toBeGreaterThan(0);
    const supportWrite = await call(harness, supportAdmin, "PATCH", `/admin/product-categories/${category.id}`, { name: "Renomme", reason: "ecriture support" });
    expect(supportWrite.status).toBe(403);

    const listed = await call<AdminProductCategoryView[]>(harness, complianceAdmin, "GET", "/admin/product-categories");
    expect(listed.status).toBe(200);
    expect(listed.body.map((item) => item.key)).toContain("auto-moto");
    const detail = await call<AdminProductCategoryView>(harness, complianceAdmin, "GET", `/admin/product-categories/${category.id}`);
    expect(detail.status).toBe(200);
    expect((await call(harness, superAdmin, "GET", "/admin/product-categories/not-a-uuid")).status).toBe(400);
    expect((await call(harness, superAdmin, "GET", "/admin/product-categories/66666666-6666-4666-8666-666666666666")).status).toBe(404);

    const active = await activateCategory(harness, category);
    expect(active.status).toBe("active");
    expect((await call(harness, { ...superAdmin, mfaVerified: false }, "GET", "/admin/product-categories")).status).toBeGreaterThanOrEqual(401);
    expect((await harness.request("/admin/product-categories")).status).toBe(401);
  });

  it("creates a product with a category, a FR/EN legal notice and required documents, and refuses an inactive category", async () => {
    harness = await createRuntimeHttpHarness();
    const category = await createCategory(harness);
    const draftCategory = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/products", { key: "moto", name: "Assurance moto", categoryId: category.id, reason: "categorie brouillon" });
    expect(draftCategory.status).toBe(422);
    expect(draftCategory.body.code).toBe("PRODUCT_CATEGORY_INVALID");
    expect(draftCategory.body.message).toContain("category must be active");

    await activateCategory(harness, category);
    const created = await call<AdminProductView>(harness, superAdmin, "POST", "/admin/products", {
      key: "moto",
      name: "Assurance moto",
      categoryId: category.id,
      requiresDocuments: true,
      requiredDocumentKinds: ["identity", "vehicle_registration"],
      legalNotice: { fr: { disclaimer: "Offre indicative, a confirmer par le courtier partenaire." }, en: { disclaimer: "Indicative offer, to be confirmed by the partner broker." } },
      reason: "creation produit lot 4"
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ categoryId: category.id, requiredDocumentKinds: ["identity", "vehicle_registration"] });
    expect(created.body.legalNotice.en?.disclaimer).toContain("Indicative offer");

    const forbidden = await call<ErrorBody>(harness, superAdmin, "POST", "/admin/products", { key: "moto-2", name: "Moto 2", legalNotice: { fr: { disclaimer: "Souscrire maintenant, rendement garanti" } }, reason: "texte interdit" });
    expect(forbidden.status).toBe(422);
    expect(forbidden.body.code).toBe("FORBIDDEN_WORDING");

    const listed = await call<AdminProductCategoryView[]>(harness, superAdmin, "GET", "/admin/product-categories");
    expect(listed.body.find((item) => item.id === category.id)?.productCount).toBe(1);
    // A category used by a product cannot be retired.
    const retire = await call<ErrorBody>(harness, superAdmin, "PATCH", `/admin/product-categories/${category.id}`, { status: "retired", reason: "tentative retrait" });
    expect(retire.status).toBe(409);
    expect(retire.body.code).toBe("CATALOG_CATEGORY_IN_USE");
  });

  it("records content versions: v1 at creation, v2 with a field diff after the EN disclaimer changes", async () => {
    harness = await createRuntimeHttpHarness();
    const created = await call<AdminProductView>(harness, superAdmin, "POST", "/admin/products", {
      key: "habitation",
      name: "Assurance habitation",
      legalNotice: { fr: { disclaimer: "Offre indicative FR." }, en: { disclaimer: "Indicative offer EN." } },
      reason: "creation produit"
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const first = await call<ProductVersionView[]>(harness, complianceAdmin, "GET", `/admin/products/${created.body.id}/versions`);
    expect(first.status).toBe(200);
    expect(first.body.map((version) => version.versionNumber)).toEqual([1]);
    expect(first.body[0]?.changes).toEqual([]);

    const patched = await call<AdminProductView>(harness, superAdmin, "PATCH", `/admin/products/${created.body.id}`, {
      legalNotice: { fr: { disclaimer: "Offre indicative FR." }, en: { disclaimer: "Indicative offer, to be confirmed by the broker." } },
      expectedUpdatedAt: created.body.updatedAt,
      reason: "precision du disclaimer EN"
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    const versions = await call<ProductVersionView[]>(harness, superAdmin, "GET", `/admin/products/${created.body.id}/versions`);
    expect(versions.body.map((version) => version.versionNumber)).toEqual([2, 1]);
    const latest = versions.body[0]!;
    expect(latest.reason).toBe("precision du disclaimer EN");
    expect(latest.changes).toEqual([{ field: "legalNotice.en.disclaimer", before: "Indicative offer EN.", after: "Indicative offer, to be confirmed by the broker." }]);
    expect(latest.authorId).toBe(superAdmin.actorId);

    const unknown = await call(harness, superAdmin, "GET", "/admin/products/77777777-7777-4777-8777-777777777777/versions");
    expect(unknown.status).toBe(404);
    const broker = { actorId: "broker-lot4", roles: ["broker_owner_pro" as const], partnerTenantId: "00000000-0000-4000-8000-000000000801", partnerPlan: "pro" as const, mfaVerified: true };
    expect((await call(harness, broker, "GET", `/admin/products/${created.body.id}/versions`)).status).toBe(403);
  });

  it("serves the public requirements of a public product only", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const category = await activateCategory(harness, await createCategory(harness));

    const updated = await call<AdminProductView>(harness, superAdmin, "PATCH", `/admin/products/${seed.product.id}`, {
      categoryId: category.id,
      requiresDocuments: true,
      requiredDocumentKinds: ["identity", "driving_license"],
      legalNotice: { fr: { legalText: "Texte legal FR.", disclaimer: "Offre indicative FR." }, en: { disclaimer: "Indicative offer EN." } },
      reason: "exigences produit"
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);

    const response = await harness.request("/countries/CI/products/auto/requirements");
    expect(response.status).toBe(200);
    const requirements = (await response.json()) as PublicProductRequirements;
    expect(requirements).toEqual({
      productKey: "auto",
      requiredDocumentKinds: ["identity", "driving_license"],
      legalNotice: { fr: { legalText: "Texte legal FR.", disclaimer: "Offre indicative FR." }, en: { disclaimer: "Indicative offer EN." } },
      category: { key: "auto-moto", name: "Auto et moto", nameEn: "Motor" }
    });

    // A product linked to the country but not public (draft) is a 404, like its public page; so is an unknown key or country.
    const draft = await harness.runtime.products.service.create({ key: "sante", name: "Assurance sante" }, superAdmin);
    await harness.runtime.products.service.associateCountry(draft.id, seed.country.id, superAdmin);
    expect((await harness.request("/countries/CI/products/sante/requirements")).status).toBe(404);
    expect((await harness.request("/countries/CI/products/inconnu/requirements")).status).toBe(404);
    expect((await harness.request("/countries/XX/products/auto/requirements")).status).toBe(404);
    expect((await harness.request("/countries/CI/products/sante")).status).toBe(404);
    expect(auditEntries(harness, "public_journey.flag_blocked", "refused").length).toBeGreaterThan(0);
  });
});
