import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("public quote rate limit", () => {
  it("blocks over-limit submissions before broker notification", async () => {
    const seed = seedComparatorQuote();
    for (let index = 0; index < 5; index += 1) {
      const payload = validQuotePayload(seed);
      payload.contact.email = `visitor-${index}@example.com`;
      payload.sessionId = `session-${index}`;
      await seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor);
    }

    const overLimit = validQuotePayload(seed);
    overLimit.contact.email = "visitor-6@example.com";
    overLimit.sessionId = "session-6";
    await expect(seed.app.quoteRequests.publicController.submit(overLimit as QuoteRequestCreateDto, superAdminActor)).rejects.toThrow("Rate limit exceeded");
  });
});
