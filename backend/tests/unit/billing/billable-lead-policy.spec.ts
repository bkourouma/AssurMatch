import { describe, expect, it } from "vitest";
import { BillableLeadPolicy, type BillableLeadContext } from "../../../src/modules/billing/billable-lead-policy";
import type { Country } from "../../../src/modules/countries/countries.module";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import type { Product } from "../../../src/modules/products/products.module";

const now = new Date("2026-09-01T10:00:00.000Z");

function country(overrides: Partial<Country> = {}): Country {
  return {
    id: "country-1",
    isoCode: "CI",
    status: "public",
    flags: { country_public_enabled: true, country_quote_enabled: true },
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as Country;
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    key: "auto",
    status: "public",
    flags: { product_public_enabled: true, product_quote_enabled: true },
    countryIds: ["country-1"],
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as Product;
}

function lead(overrides: Partial<LeadAssignmentRecord> = {}): LeadAssignmentRecord {
  return {
    id: "lead-1",
    quoteRequestId: "quote-1",
    partnerTenantId: "tenant-1",
    status: "accepted",
    assignedAt: now,
    assignmentReason: "routing",
    countryCode: "CI",
    productKey: "auto",
    contact: { email: "ama@example.test", phone: "+2250102030405" },
    answers: { vehicle_use: "prive" },
    consentRecordId: "consent-1",
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as LeadAssignmentRecord;
}

function context(overrides: Partial<BillableLeadContext> = {}): BillableLeadContext {
  return {
    countries: new Map([["CI", country()]]),
    products: new Map([["auto", product()]]),
    creditedDisputeLeadIds: new Set<string>(),
    ...overrides
  };
}

describe("BillableLeadPolicy", () => {
  it("counts a complete, consented, routed lead on an active country and product", () => {
    const evaluation = new BillableLeadPolicy().evaluate(lead(), context());
    expect(evaluation).toMatchObject({ billable: true, failedCriteria: [], disputeCredited: false });
  });

  it("names every failed PRD criterion instead of silently dropping the lead", () => {
    const policy = new BillableLeadPolicy();
    expect(policy.evaluate(lead({ contact: { email: "not-an-email", phone: "12" } }), context()).failedCriteria).toEqual(["contact_reachable"]);
    expect(policy.evaluate(lead(), context({ countries: new Map([["CI", country({ flags: { country_public_enabled: true, country_quote_enabled: false } } as Partial<Country>)]]) })).failedCriteria).toEqual(["country_active"]);
    expect(policy.evaluate(lead(), context({ products: new Map([["auto", product({ status: "draft" } as Partial<Product>)]]) })).failedCriteria).toEqual(["product_active"]);
    const withoutConsent = lead();
    delete withoutConsent.consentRecordId;
    expect(policy.evaluate(withoutConsent, context()).failedCriteria).toEqual(["consent_collected"]);
    expect(policy.evaluate(lead({ crmStatus: "doublon" }), context()).failedCriteria).toEqual(["not_duplicate"]);
    expect(policy.evaluate(lead({ status: "rejected" }), context()).failedCriteria).toEqual(["broker_assigned"]);
    expect(policy.evaluate(lead({ answers: {} }), context()).failedCriteria).toEqual(["minimum_information_complete"]);
    expect(policy.evaluate(lead({ contact: {}, answers: {} }), context()).billable).toBe(false);
  });

  it("keeps a phone-only lead billable and marks accepted disputes as credited", () => {
    const policy = new BillableLeadPolicy();
    expect(policy.evaluate(lead({ contact: { phone: "+2250102030405" } }), context()).billable).toBe(true);
    expect(policy.evaluate(lead(), context({ creditedDisputeLeadIds: new Set(["lead-1"]) })).disputeCredited).toBe(true);
  });
});
