import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_WEIGHTS } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { ScoringAuditActions, ScoringRulesService } from "../../../src/modules/offers/scoring-rules.service";
import { seedMiniCatalog, superAdminActor } from "../../integration/helpers/enterprise-seed";

const priceHeavy = { guaranteeLevel: 10, price: 60, deductible: 10, processingSpeed: 5, paymentFlexibility: 5, informationQuality: 5, userPreferences: 5 };

describe("ScoringRulesService", () => {
  it("resolves defaults, then country-wide, then product-specific rules", async () => {
    const seed = await seedMiniCatalog();
    const service = new ScoringRulesService({ audit: seed.audit, countries: seed.countries, products: seed.products });
    expect(await service.resolveWeights(seed.country.id, seed.product.id)).toEqual(DEFAULT_SCORING_WEIGHTS);
    await service.create(superAdminActor, { countryId: seed.country.id, weights: priceHeavy, reason: "Price sensitive market" });
    expect((await service.resolveWeights(seed.country.id, seed.product.id)).price).toBe(60);
    const specific = await service.create(superAdminActor, { countryId: seed.country.id, productId: seed.product.id, weights: { ...priceHeavy, price: 55, guaranteeLevel: 15 }, reason: "Auto override" });
    expect((await service.resolveWeights(seed.country.id, seed.product.id)).price).toBe(55);
    await service.update(superAdminActor, specific.id, { status: "disabled", reason: "Back to country rule" });
    expect((await service.resolveWeights(seed.country.id, seed.product.id)).price).toBe(60);
    expect(seed.audit.search({ action: ScoringAuditActions.ruleUpdated })).toHaveLength(1);
  });

  it("refuses invalid weights, duplicates, brokers and out-of-scope admins", async () => {
    const seed = await seedMiniCatalog();
    const service = new ScoringRulesService({ audit: seed.audit, countries: seed.countries, products: seed.products });
    await expect(service.create(superAdminActor, { weights: { ...priceHeavy, price: 50 }, reason: "bad" })).rejects.toThrow(/weights_must_total_100/);
    await service.create(superAdminActor, { weights: priceHeavy, reason: "global" });
    await expect(service.create(superAdminActor, { weights: priceHeavy, reason: "dup" })).rejects.toThrow(/duplicate_active_rule/);
    const broker: ActorContext = { actorId: "b", roles: ["broker_owner_pro"], partnerTenantId: "t", mfaVerified: true };
    await expect(service.list(broker)).rejects.toThrow(/forbidden_role/);
    const adminPaysSenegal: ActorContext = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    await expect(service.create(adminPaysSenegal, { countryId: seed.country.id, weights: priceHeavy, reason: "scope" })).rejects.toThrow(/out_of_scope_country/);
    await expect(service.create(adminPaysSenegal, { weights: priceHeavy, reason: "global from scoped admin" })).rejects.toThrow(/out_of_scope_country/);
    const contentAdmin: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
    expect((await service.list(contentAdmin)).total).toBe(1);
  });
});
