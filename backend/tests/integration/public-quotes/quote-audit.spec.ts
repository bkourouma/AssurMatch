import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("quote audit coverage", () => {
  it("audits consent, prospect, quote and routing-sensitive decisions", async () => {
    const seed = await seedComparatorQuote();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    const actions = seed.app.audit.writer.all().map((entry) => entry.action);
    expect(actions).toContain("consent.lead_transmission_granted");
    expect(actions).toContain("prospect.created");
    expect(actions).toContain("quote_request.created");
    expect(actions).toContain("routing.assigned");
  });
});
