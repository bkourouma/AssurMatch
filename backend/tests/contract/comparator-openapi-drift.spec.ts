import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const contract = readFileSync("specs/002-comparateur-demande-devis/contracts/comparator-quote-api.openapi.yaml", "utf8");

describe("comparator API contract drift", () => {
  it("matches implemented controller surfaces for spec 002", () => {
    const controllers = [
      "backend/src/modules/countries/public-countries.controller.ts",
      "backend/src/modules/products/public-products.controller.ts",
      "backend/src/modules/offers/public-offers.controller.ts",
      "backend/src/modules/offers/admin-offers.controller.ts",
      "backend/src/modules/quote-forms/public-quote-forms.controller.ts",
      "backend/src/modules/quote-forms/admin-quote-form-definitions.controller.ts",
      "backend/src/modules/quote-requests/public-quote-requests.controller.ts",
      "backend/src/modules/quote-requests/public-quote-status.controller.ts",
      "backend/src/modules/leads/broker-leads.controller.ts",
      "backend/src/modules/leads/admin-lead-assignments.controller.ts"
    ].map((path) => readFileSync(path, "utf8"));

    expect(controllers.join("\n")).toContain("assertNoHeavyPublicSynchronousWork");
    expect(contract).toContain("PublicQuoteForm");
    expect(contract).toContain("BrokerLeadStatusUpdate");
  });
});
