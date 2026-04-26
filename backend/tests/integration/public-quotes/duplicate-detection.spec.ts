import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("quote duplicate detection", () => {
  it("returns duplicate confirmation without a second active assignment", async () => {
    const seed = await seedComparatorQuote();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);
    const duplicatePayload = validQuotePayload(seed);
    duplicatePayload.ipAddress = "203.0.113.11";
    duplicatePayload.sessionId = "session-duplicate";

    const duplicate = await seed.app.quoteRequests.publicController.submit(duplicatePayload as QuoteRequestCreateDto, superAdminActor);

    expect(duplicate.status).toBe("duplicate");
    expect(await seed.app.leads.assignments.list()).toHaveLength(1);
  });
});
