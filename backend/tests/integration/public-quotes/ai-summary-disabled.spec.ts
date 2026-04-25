import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("AI quote summary disabled", () => {
  it("produces zero model calls when flags or module state are disabled", async () => {
    const seed = seedComparatorQuote();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    expect(seed.app.quoteAiSummary.list()).toHaveLength(0);
    expect(seed.app.audit.writer.all().map((entry) => entry.action)).toContain("ai_summary.skipped");
  });
});
