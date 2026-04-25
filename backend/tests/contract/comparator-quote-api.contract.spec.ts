import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const contract = readFileSync("specs/002-comparateur-demande-devis/contracts/comparator-quote-api.openapi.yaml", "utf8");

describe("spec 002 comparator quote OpenAPI contract", () => {
  it("declares the public country, product, offer and quote endpoints", () => {
    [
      "/countries",
      "/countries/{countryCode}",
      "/countries/{countryCode}/products",
      "/countries/{countryCode}/products/{productKey}",
      "/countries/{countryCode}/products/{productKey}/offers",
      "/offers/{offerId}",
      "/countries/{countryCode}/products/{productKey}/quote-form",
      "/quote-requests",
      "/quote-requests/{publicReference}"
    ].forEach((path) => expect(contract).toContain(path));
  });

  it("declares admin offer, quote form, quote operation and broker lead endpoints", () => {
    [
      "/admin/offers",
      "/admin/offers/{offerId}",
      "/admin/offers/{offerId}/validate",
      "/admin/quote-form-definitions",
      "/admin/quote-requests",
      "/admin/quote-requests/{quoteRequestId}/review-status",
      "/admin/prospects",
      "/admin/lead-assignments",
      "/broker/leads",
      "/broker/leads/{leadAssignmentId}",
      "/broker/leads/{leadAssignmentId}/status"
    ].forEach((path) => expect(contract).toContain(path));
  });

  it("keeps public quote creation anonymous and consent based", () => {
    expect(contract).toContain("security: []");
    expect(contract).toContain("QuoteRequestCreate");
    expect(contract).toContain("accepted");
    expect(contract).toContain("lead_transmission");
    expect(contract).toContain("All public offers are indicative");
  });
});
