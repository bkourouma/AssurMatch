import { describe, expect, it } from "vitest";
import type { CatalogActivationBlocker } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { CatalogActivationGuard } from "../../../src/modules/catalog/catalog-activation-guard";
import { CatalogFlagService } from "../../../src/modules/catalog/catalog-flag.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { effectiveProductFlags, ProductsService } from "../../../src/modules/products/products.module";

const superAdmin: ActorContext = { actorId: "11111111-1111-4111-8111-111111111111", roles: ["super_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "22222222-2222-4222-8222-222222222222", roles: ["compliance_admin"], mfaVerified: true };

async function build(blockers: CatalogActivationBlocker[] = [{ section: "country:x", control: "country_active_licensed_partner", label: "Courtier", evidence: "aucun" }]) {
  const audit = new AuditLogWriter();
  const countries = new CountriesService(audit);
  const products = new ProductsService(audit);
  const featureFlags = new FeatureFlagsService(audit);
  const ignored: string[][] = [];
  const guard = new CatalogActivationGuard({
    checklist: { countryActivationBlockers: async (_countryId: string, ignoredControls: string[] = []) => { ignored.push(ignoredControls); return blockers; } },
    quoteForms: { list: async () => [] },
    consentTexts: { listTexts: async () => [] }
  });
  let changes = 0;
  const service = new CatalogFlagService({ audit, countries, products, featureFlags, guard, onCatalogChanged: () => { changes += 1; } });
  const country = await countries.create({ isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima" }, superAdmin);
  return { audit, countries, products, featureFlags, service, country, ignored, changes: () => changes };
}

describe("CatalogFlagService (spec 050 R1-R4)", () => {
  it("refuses every flag outside the allowlist, AI flags included, and audits the refusal", async () => {
    const { service, country, audit } = await build();
    for (const key of ["country_ai_enabled", "payments_enabled", "product_ai_scoring_enabled"]) {
      await expect(service.toggleCountryFlag(superAdmin, country.id, { key, value: true, reason: "tentative flag sensible" })).rejects.toMatchObject({ status: 403 });
    }
    const refusals = audit.all().filter((entry) => entry.action === "country.flag_changed" && entry.result === "refused");
    expect(refusals).toHaveLength(3);
    expect(refusals.every((entry) => entry.reason === "flag_not_toggleable")).toBe(true);
  });

  it("writes the JSON flag, the FeatureFlag row, its history and an audit entry with before/after", async () => {
    const { service, country, featureFlags, audit, changes } = await build();
    const updated = await service.toggleCountryFlag(superAdmin, country.id, { key: "country_comparison_enabled", value: true, reason: "ouverture comparaison" });
    expect(updated.flags.country_comparison_enabled).toBe(true);
    const flag = featureFlags.list().find((candidate) => candidate.key === "country_comparison_enabled" && candidate.scopeId === country.id);
    expect(flag).toMatchObject({ scopeType: "country", value: true, reason: "ouverture comparaison" });
    expect(featureFlags.historyFor(flag!.id)).toEqual([expect.objectContaining({ previousValue: false, nextValue: true })]);
    const entry = audit.all().find((candidate) => candidate.action === "country.flag_changed" && candidate.result === "success");
    expect(entry?.context).toMatchObject({ before: { country_comparison_enabled: false }, after: { country_comparison_enabled: true } });
    expect(changes()).toBe(1);
  });

  it("refuses public activation with blockers, ignoring the controls about the change itself", async () => {
    const { service, country, ignored } = await build();
    await expect(service.toggleCountryFlag(compliance, country.id, { key: "country_public_enabled", value: true, reason: "ouverture publique" }))
      .rejects.toMatchObject({ status: 422, response: { code: "ACTIVATION_BLOCKED", blockers: [expect.objectContaining({ control: "country_active_licensed_partner" })] } });
    expect(ignored[0]).toEqual(["country_status_public", "country_public_enabled"]);
  });

  it("allows public activation for compliance once the checklist is green, never for a country admin", async () => {
    const { service, country } = await build([]);
    await expect(service.toggleCountryFlag({ roles: ["admin_pays"], mfaVerified: true, countryScopes: [country.id] }, country.id, { key: "country_public_enabled", value: true, reason: "ouverture publique" }))
      .rejects.toMatchObject({ status: 403 });
    const opened = await service.toggleCountryFlag(compliance, country.id, { key: "country_public_enabled", value: true, reason: "ouverture publique" });
    expect(opened.flags.country_public_enabled).toBe(true);
  });

  it("deactivates without any condition, even while the checklist is red", async () => {
    const { service, countries, country } = await build();
    await countries.writeFlag(country.id, "country_public_enabled", true);
    const closed = await service.toggleCountryFlag({ roles: ["admin_pays"], mfaVerified: true, countryScopes: [country.id] }, country.id, { key: "country_public_enabled", value: false, reason: "fermeture immediate" });
    expect(closed.flags.country_public_enabled).toBe(false);
  });

  it("refuses country_quote_enabled without a published form on a linked product", async () => {
    const { service, country } = await build();
    await expect(service.toggleCountryFlag(superAdmin, country.id, { key: "country_quote_enabled", value: true, reason: "ouverture devis pays" }))
      .rejects.toMatchObject({ status: 422, response: { code: "QUOTE_FORM_REQUIRED" } });
  });

  it("refuses to open a global product flag that legacy links would inherit without their conditions", async () => {
    const { service, products, country } = await build();
    const product = await products.create({ key: "auto", name: "Auto" }, superAdmin);
    await products.associateCountry(product.id, country.id, superAdmin);
    await expect(service.toggleProductFlag(superAdmin, product.id, { key: "product_quote_enabled", value: true, reason: "ouverture devis produit" }))
      .rejects.toMatchObject({ status: 422, response: { code: "QUOTE_FORM_REQUIRED" } });
    // A link created from the admin screen closes the flag itself, so nothing inherits it.
    const voyage = await products.create({ key: "voyage", name: "Voyage" }, superAdmin);
    await products.createLink(voyage.id, country.id, "liaison voyage", superAdmin);
    const opened = await service.toggleProductFlag(superAdmin, voyage.id, { key: "product_quote_enabled", value: true, reason: "ouverture devis produit" });
    expect(opened.flags.product_quote_enabled).toBe(true);
  });
});

describe("effectiveProductFlags (spec 050 R2)", () => {
  const product = { flags: { product_public_enabled: true, product_quote_enabled: true, product_comparison_enabled: false, product_document_upload_enabled: true, product_sensitive_data_enabled: false, product_manual_review_required: false, product_ai_scoring_enabled: false, product_ai_form_assistant_enabled: false } };

  it("is the product flag AND the link flag, an absent link key inheriting", () => {
    const flags = effectiveProductFlags(product, { status: "internal", flags: { product_quote_enabled: false } });
    expect(flags.product_public_enabled).toBe(true);
    expect(flags.product_quote_enabled).toBe(false);
    expect(flags.product_comparison_enabled).toBe(false);
  });

  it("keeps manual review required when either level requires it", () => {
    expect(effectiveProductFlags(product, { status: "internal", flags: { product_manual_review_required: true } }).product_manual_review_required).toBe(true);
    expect(effectiveProductFlags({ flags: { ...product.flags, product_manual_review_required: true } }, { status: "internal", flags: { product_manual_review_required: false } }).product_manual_review_required).toBe(true);
  });

  it("closes everything for a missing, suspended or retired link", () => {
    for (const link of [undefined, { status: "suspended" as const, flags: {} }, { status: "retired" as const, flags: {} }]) {
      const flags = effectiveProductFlags(product, link);
      expect(flags.product_public_enabled).toBe(false);
      expect(flags.product_quote_enabled).toBe(false);
    }
  });
});
