import { describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import { RoutingRulesService } from "../../../src/modules/routing/routing-rules.service";
import { seedMiniCatalog, superAdminActor } from "../../integration/helpers/enterprise-seed";

async function setup() {
  const seed = await seedMiniCatalog();
  const partner = await seed.partners.create({ legalName: "Broker A", primaryEmail: "a@broker.example", primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
  const service = new RoutingRulesService({ audit: seed.audit, countries: seed.countries, products: seed.products, partners: seed.partners });
  return { ...seed, partner, service };
}

describe("RoutingRulesService", () => {
  it("creates, versions and historises a rule with audit", async () => {
    const { service, country, product, partner, audit } = await setup();
    const created = await service.create(superAdminActor, { countryId: country.id, productId: product.id, mode: "round_robin", reason: "pilot distribution" });
    expect(created).toMatchObject({ status: "active", version: 1, mode: "round_robin" });
    const updated = await service.update(superAdminActor, created.id, { mode: "priority", priorities: [{ partnerTenantId: partner.id, priority: 1 }], reason: "prefer partner A" });
    expect(updated.version).toBe(2);
    const history = await service.history(superAdminActor, created.id);
    expect(history.items.map((entry) => entry.changeType)).toEqual(["updated", "created"]);
    expect(history.items[0]?.previousValue).toMatchObject({ mode: "round_robin" });
    expect(audit.search({ action: RoutingAuditActions.ruleCreated })).toHaveLength(1);
    expect(audit.search({ action: RoutingAuditActions.ruleUpdated })).toHaveLength(1);
    expect(await service.resolveForQuote(country.id, product.id)).toMatchObject({ id: created.id, mode: "priority" });
  });

  it("falls back from product-specific to country-wide rules", async () => {
    const { service, country, product } = await setup();
    const wide = await service.create(superAdminActor, { countryId: country.id, mode: "capacity", reason: "country default" });
    expect((await service.resolveForQuote(country.id, product.id))?.id).toBe(wide.id);
    const specific = await service.create(superAdminActor, { countryId: country.id, productId: product.id, mode: "round_robin", reason: "auto override" });
    expect((await service.resolveForQuote(country.id, product.id))?.id).toBe(specific.id);
    expect((await service.resolveForQuote(country.id, "00000000-0000-4000-8000-000000000999"))?.id).toBe(wide.id);
  });

  it("refuses duplicate active rules, invalid mode inputs and out-of-scope admins", async () => {
    const { service, country, product, partner, audit } = await setup();
    await service.create(superAdminActor, { countryId: country.id, productId: product.id, mode: "first_eligible", reason: "first" });
    await expect(service.create(superAdminActor, { countryId: country.id, productId: product.id, mode: "round_robin", reason: "dup" })).rejects.toThrow(/duplicate_active_rule/);
    await expect(service.create(superAdminActor, { countryId: country.id, mode: "priority", reason: "no priorities" })).rejects.toThrow(/priorities_required/);
    await expect(service.create(superAdminActor, { countryId: country.id, mode: "exclusive", reason: "no partner" })).rejects.toThrow(/exclusive_partner_required/);
    await expect(service.create(superAdminActor, { countryId: country.id, mode: "exclusive", exclusivePartnerTenantId: "00000000-0000-4000-8000-000000000404", reason: "ghost" })).rejects.toThrow(/unknown_partner/);
    const adminPaysSenegal: ActorContext = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    await expect(service.create(adminPaysSenegal, { countryId: country.id, mode: "exclusive", exclusivePartnerTenantId: partner.id, reason: "scope" })).rejects.toThrow(/out_of_scope_country/);
    const broker: ActorContext = { actorId: "b", roles: ["broker_owner_pro"], partnerTenantId: partner.id, mfaVerified: true };
    await expect(service.list(broker)).rejects.toThrow(/forbidden_role/);
    expect(audit.search({ action: RoutingAuditActions.ruleRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["duplicate_active_rule", "out_of_scope_country", "forbidden_role"]));
  });

  it("scopes listing for Admin Pays by country id or ISO code", async () => {
    const { service, country } = await setup();
    await service.create(superAdminActor, { countryId: country.id, mode: "round_robin", reason: "ci" });
    const byId: ActorContext = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: [country.id] };
    const byIso: ActorContext = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"] };
    const elsewhere: ActorContext = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["SN"] };
    expect((await service.list(byId)).total).toBe(1);
    expect((await service.list(byIso)).total).toBe(1);
    expect((await service.list(elsewhere)).total).toBe(0);
  });
});
