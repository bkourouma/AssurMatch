import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("lead routing blockers", () => {
  it("excludes inactive brokers and keeps the request non-routable", async () => {
    const seed = await seedComparatorQuote();
    await seed.app.partners.service.update(seed.partnerTenantId, { status: "retired", reason: "routing blocker test" }, superAdminActor);
    const unauthorized = await seed.app.partners.service.create({ legalName: "Unauthorized", primaryEmail: "u@broker.example", primaryWhatsApp: "+2250102030406", status: "active" }, superAdminActor);
    await seed.app.partnerLicenses.service.create({ partnerTenantId: unauthorized.id, licenseNumber: "LIC-U", issuingAuthority: "Regulator", countryId: seed.countryId, productIds: [seed.productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
    const overQuota = await seed.app.partners.service.create({ legalName: "Over Quota", primaryEmail: "q@broker.example", primaryWhatsApp: "+2250102030407", status: "active", quotaMonthlyLeads: 1 }, superAdminActor);
    await seed.app.partners.service.authorizeCountry(overQuota.id, seed.countryId, superAdminActor);
    await seed.app.partners.service.authorizeProduct(overQuota.id, seed.productId, superAdminActor);
    await seed.app.partnerLicenses.service.create({ partnerTenantId: overQuota.id, licenseNumber: "LIC-Q", issuingAuthority: "Regulator", countryId: seed.countryId, productIds: [seed.productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
    await seed.app.leads.assignments.create({ quoteRequestId: crypto.randomUUID(), partnerTenantId: overQuota.id, assignmentReason: "existing active lead" }, superAdminActor);
    const expired = await seed.app.partners.service.create({ legalName: "Expired", primaryEmail: "e@broker.example", primaryWhatsApp: "+2250102030408", status: "active" }, superAdminActor);
    await seed.app.partners.service.authorizeCountry(expired.id, seed.countryId, superAdminActor);
    await seed.app.partners.service.authorizeProduct(expired.id, seed.productId, superAdminActor);
    await seed.app.partnerLicenses.service.create({ partnerTenantId: expired.id, licenseNumber: "LIC-E", issuingAuthority: "Regulator", countryId: seed.countryId, productIds: [seed.productId], status: "expired", effectiveDate: "2020-01-01", expirationDate: "2021-01-01" }, superAdminActor);

    const confirmation = await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    expect(confirmation.routed).toBe(false);
    expect(await seed.app.leads.assignments.list()).toHaveLength(1);
    const reasons = (await seed.app.leads.decisions.list())[0]?.excludedCandidates.flatMap((candidate) => candidate.reasons) ?? [];
    expect(reasons).toContain("partner_not_active");
    expect(reasons).toContain("partner_country_not_authorized");
    expect(reasons).toContain("partner_product_not_authorized");
    expect(reasons).toContain("partner_quota_exhausted");
    expect(reasons).toContain("license_not_valid_for_scope");
  });
});
