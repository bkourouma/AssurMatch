import { describe, expect, it } from "vitest";
import {
  brokerLeadStatusUpdateSchema,
  offerListQuerySchema,
  publicQuoteFormResponseSchema,
  quoteRequestCreateSchema
} from "../../../../packages/shared/contracts/quote.contracts";

describe("quote DTO contracts", () => {
  it("validates offer query order, consent and broker status updates", () => {
    expect(offerListQuerySchema.safeParse({ minPrice: 10, maxPrice: 5 }).success).toBe(false);
    expect(brokerLeadStatusUpdateSchema.parse({ status: "contacted", reason: "courtier a pris contact" }).status).toBe("contacted");
    expect(quoteRequestCreateSchema.safeParse({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: crypto.randomUUID(),
      contact: { email: "visitor@example.com", phone: "+2250102030405" },
      answers: {},
      consent: { accepted: false, consentTextId: crypto.randomUUID(), version: "v1", contentHash: "hash" }
    }).success).toBe(false);
  });

  it("keeps public form schema explicit about consent text reference", () => {
    const form = publicQuoteFormResponseSchema.parse({
      formDefinitionId: crypto.randomUUID(),
      version: "v1",
      fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
      consent: {
        consentTextId: crypto.randomUUID(),
        version: "v1",
        contentHash: "hash",
        purpose: "lead_transmission",
        recipientCategory: "courtier_partenaire_eligible"
      }
    });

    expect(form.consent.purpose).toBe("lead_transmission");
  });
});
