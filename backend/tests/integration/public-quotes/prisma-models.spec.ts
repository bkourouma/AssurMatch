import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync("backend/prisma/schema.prisma", "utf8");

describe("spec 002 Prisma model shape", () => {
  it("declares offer, form, prospect, quote, lead, routing and AI summary models", async () => {
    [
      "model Offer ",
      "model OfferHistory ",
      "model QuoteFormDefinition ",
      "model Prospect ",
      "model QuoteRequest ",
      "model LeadAssignment ",
      "model RoutingDecision ",
      "model QuoteAISummary "
    ].forEach((model) => expect(schema).toContain(model));
  });

  it("keeps public visibility and routing constraints explicit", async () => {
    expect(schema).toContain("@@unique([countryId, productId, publicKey])");
    expect(schema).toContain("@@unique([quoteRequestId])");
    expect(schema).toContain("publicReference       String             @unique");
    expect(schema).toContain("@@index([partnerTenantId, status, assignedAt])");
  });
});
