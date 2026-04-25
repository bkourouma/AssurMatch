import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("quote submission SLO", () => {
  it("returns confirmation under 5 seconds excluding async delivery", async () => {
    const seed = seedComparatorQuote();
    const start = performance.now();

    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    expect(performance.now() - start).toBeLessThan(5000);
  });
});
