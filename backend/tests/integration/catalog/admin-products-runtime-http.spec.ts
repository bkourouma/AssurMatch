import { afterEach, describe, expect, it } from "vitest";
import type { AdminCountryProductLinkView, AdminCountryView, AdminProductView } from "../../../../packages/shared/contracts/catalog.contracts";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { auditEntries, call, complianceAdmin, countryAdmin, senegal, superAdmin } from "./catalog-http-helpers";

type ErrorBody = { code: string; message: string; blockers?: Array<{ control: string }> };

async function setup(h: RuntimeHttpHarness) {
  const seed = await seedPublicRuntime(h.runtime);
  const sn = (await call<AdminCountryView>(h, superAdmin, "POST", "/admin/countries", senegal)).body;
  const voyage = await call<AdminProductView>(h, superAdmin, "POST", "/admin/products", { key: "voyage", name: "Assurance voyage", reason: "catalogue voyage SC-01" });
  expect(voyage.status).toBe(201);
  return { seed, sn, voyage: voyage.body };
}

function linkOf(links: AdminCountryProductLinkView[], productId: string): AdminCountryProductLinkView | undefined {
  return links.find((link) => link.productId === productId);
}

describe("admin products and country links over HTTP (spec 050 US2)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates, reads, lists and edits a product with concurrency control", async () => {
    harness = await createRuntimeHttpHarness();
    const { voyage } = await setup(harness);
    expect(voyage.status).toBe("draft");
    expect(voyage.flags.product_public_enabled).toBe(false);
    expect(voyage.flags.product_manual_review_required).toBe(true);

    const detail = await call<AdminProductView>(harness, superAdmin, "GET", `/admin/products/${voyage.id}`);
    expect(detail.body.key).toBe("voyage");
    const listed = await call<AdminProductView[]>(harness, complianceAdmin, "GET", "/admin/products");
    expect(listed.status).toBe(200);
    expect(listed.body.map((product) => product.key)).toEqual(expect.arrayContaining(["auto", "voyage"]));

    const updated = await call<AdminProductView>(harness, superAdmin, "PATCH", `/admin/products/${voyage.id}`, { description: "Couverture voyage", expectedUpdatedAt: voyage.updatedAt, reason: "description du produit" });
    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe("Couverture voyage");
    const stale = await call<ErrorBody>(harness, superAdmin, "PATCH", `/admin/products/${voyage.id}`, { name: "Voyage bis", expectedUpdatedAt: voyage.updatedAt, reason: "ecriture concurrente" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("CATALOG_UPDATE_CONFLICT");

    const duplicate = await call(harness, superAdmin, "POST", "/admin/products", { key: "voyage", name: "Doublon", reason: "doublon de cle produit" });
    expect(duplicate.status).toBe(409);
  });

  it("links a product to a country as internal with closed flags, and refuses a duplicate or out-of-scope link", async () => {
    harness = await createRuntimeHttpHarness();
    const { seed, sn, voyage } = await setup(harness);
    const snAdmin = countryAdmin(sn.id);

    const linked = await call<AdminCountryProductLinkView>(harness, snAdmin, "POST", `/admin/countries/${sn.id}/products`, { productId: voyage.id, reason: "voyage au Senegal" });
    expect(linked.status).toBe(201);
    expect(linked.body.status).toBe("internal");
    expect(linked.body.flags).toMatchObject({ product_public_enabled: false, product_quote_enabled: false, product_comparison_enabled: false, product_manual_review_required: true });
    expect(auditEntries(harness, "country_product.linked", "success").at(-1)?.reason).toBe("voyage au Senegal");

    const duplicate = await call(harness, snAdmin, "POST", `/admin/countries/${sn.id}/products`, { productId: voyage.id, reason: "voyage au Senegal bis" });
    expect(duplicate.status).toBe(409);

    const outOfScope = await call(harness, snAdmin, "POST", `/admin/countries/${seed.country.id}/products`, { productId: voyage.id, reason: "voyage en CI hors perimetre" });
    expect(outOfScope.status).toBe(403);
    expect(auditEntries(harness, "country_product.create_refused", "refused").map((entry) => entry.reason)).toEqual(["link_exists", "rbac_denied"]);

    const links = await call<AdminCountryProductLinkView[]>(harness, snAdmin, "GET", `/admin/countries/${sn.id}/products`);
    expect(links.body.map((link) => link.productKey)).toEqual(["voyage"]);
  });

  it("refuses product_quote_enabled without a published form and product_public_enabled without a published consent", async () => {
    harness = await createRuntimeHttpHarness();
    const { sn, voyage } = await setup(harness);
    await call(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products`, { productId: voyage.id, reason: "voyage au Senegal" });

    const quote = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products/${voyage.id}/flags`, { key: "product_quote_enabled", value: true, reason: "ouverture devis voyage" });
    expect(quote.status).toBe(422);
    expect(quote.body.code).toBe("QUOTE_FORM_REQUIRED");
    const publicFlag = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products/${voyage.id}/flags`, { key: "product_public_enabled", value: true, reason: "ouverture publique voyage" });
    expect(publicFlag.status).toBe(422);
    expect(publicFlag.body.code).toBe("CONSENT_TEXT_REQUIRED");
    expect(auditEntries(harness, "country_product.flag_changed", "refused").map((entry) => entry.reason)).toEqual(["quote_form_required", "consent_text_required"]);

    // A country-wide lead_transmission text (no product) satisfies the consent condition.
    const text = await harness.runtime.consent.service.createText({
      purpose: "lead_transmission", countryId: sn.id, channel: "public_web", recipientCategory: "courtier_partenaire_eligible",
      language: "fr", version: "v1", status: "draft", contentHash: "sn-consent-hash"
    }, superAdmin);
    await harness.runtime.consent.service.publishText(text.id, superAdmin);
    const opened = await call<AdminCountryProductLinkView>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products/${voyage.id}/flags`, { key: "product_public_enabled", value: true, reason: "ouverture publique voyage" });
    expect(opened.status).toBe(200);
    expect(opened.body.flags.product_public_enabled).toBe(true);
    const history = harness.runtime.featureFlags.service.list().find((flag) => flag.scopeType === "product" && flag.scopeId === `${voyage.id}@${sn.id}` && flag.key === "product_public_enabled");
    expect(history?.value).toBe(true);

    // Deactivation is always immediate.
    const closed = await call<AdminCountryProductLinkView>(harness, countryAdmin(sn.id), "POST", `/admin/countries/${sn.id}/products/${voyage.id}/flags`, { key: "product_public_enabled", value: false, reason: "fermeture voyage" });
    expect(closed.status).toBe(200);
  });

  it("keeps SN x Voyage flags independent from CI x Voyage", async () => {
    harness = await createRuntimeHttpHarness();
    const { seed, sn, voyage } = await setup(harness);
    await call(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products`, { productId: voyage.id, reason: "voyage au Senegal" });
    await call(harness, superAdmin, "POST", `/admin/countries/${seed.country.id}/products`, { productId: voyage.id, reason: "voyage en Cote d'Ivoire" });

    const toggled = await call<AdminCountryProductLinkView>(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products/${voyage.id}/flags`, { key: "product_comparison_enabled", value: true, reason: "comparaison voyage SN" });
    expect(toggled.status).toBe(200);
    expect(toggled.body.flags.product_comparison_enabled).toBe(true);

    const snLinks = (await call<AdminCountryProductLinkView[]>(harness, superAdmin, "GET", `/admin/countries/${sn.id}/products`)).body;
    const ciLinks = (await call<AdminCountryProductLinkView[]>(harness, superAdmin, "GET", `/admin/countries/${seed.country.id}/products`)).body;
    expect(linkOf(snLinks, voyage.id)?.flags.product_comparison_enabled).toBe(true);
    expect(linkOf(ciLinks, voyage.id)?.flags.product_comparison_enabled).toBe(false);
  });

  it("applies a link flag to the public journey: closing quote on CI x Auto closes its form only there", async () => {
    harness = await createRuntimeHttpHarness();
    const { seed } = await setup(harness);
    const formPath = `/countries/CI/products/${seed.product.key}/quote-form`;
    expect((await harness.request(formPath)).status).toBe(200);

    const closed = await call<AdminCountryProductLinkView>(harness, countryAdmin(seed.country.id), "POST", `/admin/countries/${seed.country.id}/products/${seed.product.id}/flags`, { key: "product_quote_enabled", value: false, reason: "fermeture devis auto CI" });
    expect(closed.status).toBe(200);
    expect(closed.body.effectiveFlags.product_quote_enabled).toBe(false);
    expect((await harness.request(formPath)).status).not.toBe(200);
    // The product itself keeps its global flag.
    expect((await harness.runtime.products.service.require(seed.product.id)).flags.product_quote_enabled).toBe(true);
  });

  it("reserves manual review removal on a sensitive product to compliance", async () => {
    harness = await createRuntimeHttpHarness();
    await setup(harness);
    const health = (await call<AdminProductView>(harness, superAdmin, "POST", "/admin/products", { key: "sante", name: "Sante", sensitivity: "sensitive", reason: "produit sensible sante" })).body;
    const adminPays = { actorId: "55555555-5555-4555-8555-555555555555", roles: ["admin_pays" as const], mfaVerified: true };

    const refused = await call(harness, adminPays, "POST", `/admin/products/${health.id}/flags`, { key: "product_manual_review_required", value: false, reason: "suppression revue manuelle" });
    expect(refused.status).toBe(403);
    expect(auditEntries(harness, "product.flag_changed", "refused").at(-1)?.reason).toBe("manual_review_removal_requires_compliance");

    const approved = await call<AdminProductView>(harness, complianceAdmin, "POST", `/admin/products/${health.id}/flags`, { key: "product_manual_review_required", value: false, reason: "approbation conformite revue" });
    expect(approved.status).toBe(200);
    expect(approved.body.flags.product_manual_review_required).toBe(false);
  });

  it("refuses global product changes from a country-scoped admin and sensitive product flags", async () => {
    harness = await createRuntimeHttpHarness();
    const { sn, voyage } = await setup(harness);
    const snAdmin = countryAdmin(sn.id);
    expect((await call(harness, snAdmin, "POST", `/admin/products/${voyage.id}/flags`, { key: "product_comparison_enabled", value: true, reason: "flag global voyage" })).status).toBe(403);
    expect((await call(harness, snAdmin, "PATCH", `/admin/products/${voyage.id}`, { status: "suspended", reason: "suspension globale" })).status).toBe(403);
    const ai = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/products/${voyage.id}/flags`, { key: "product_ai_scoring_enabled", value: true, reason: "activation scoring ia" });
    expect(ai.status).toBe(403);
    expect(ai.body.code).toBe("CATALOG_FLAG_NOT_TOGGLEABLE");
    const sensitive = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/products/${voyage.id}/flags`, { key: "product_sensitive_data_enabled", value: true, reason: "donnees sensibles voyage" });
    expect(sensitive.status).toBe(403);
  });

  it("suspends a product globally: unavailable in every country, audit names each country", async () => {
    harness = await createRuntimeHttpHarness();
    const { seed, sn } = await setup(harness);
    await call(harness, superAdmin, "POST", `/admin/countries/${sn.id}/products`, { productId: seed.product.id, reason: "auto au Senegal" });
    expect((await harness.request(`/countries/CI/products/${seed.product.key}`)).status).toBe(200);

    const suspended = await call<AdminProductView>(harness, superAdmin, "PATCH", `/admin/products/${seed.product.id}`, { status: "suspended", reason: "suspension globale auto" });
    expect(suspended.status).toBe(200);
    expect((await harness.request(`/countries/CI/products/${seed.product.key}`)).status).toBe(404);
    expect(await (await harness.request("/countries/CI/products")).json()).toEqual([]);
    const entry = auditEntries(harness, "product.updated", "success").at(-1);
    expect(entry?.scope.countryIds).toEqual(expect.arrayContaining([seed.country.id, sn.id]));
  });

  it("retires a link logically and closes the product in that country only", async () => {
    harness = await createRuntimeHttpHarness();
    const { seed } = await setup(harness);
    const retired = await call<AdminCountryProductLinkView>(harness, countryAdmin(seed.country.id), "POST", `/admin/countries/${seed.country.id}/products/${seed.product.id}/retire`, { reason: "retrait auto CI" });
    expect(retired.status).toBe(200);
    expect(retired.body.status).toBe("retired");
    expect(retired.body.flags.product_quote_enabled).toBe(false);
    expect((await harness.request(`/countries/CI/products/${seed.product.key}`)).status).toBe(404);
    expect(auditEntries(harness, "country_product.retired", "success")).toHaveLength(1);
    const flag = await call(harness, superAdmin, "POST", `/admin/countries/${seed.country.id}/products/${seed.product.id}/flags`, { key: "product_comparison_enabled", value: true, reason: "flag sur liaison retiree" });
    expect(flag.status).toBe(409);
  });
});
