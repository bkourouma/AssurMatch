import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("public quote anti-spam", () => {
  it("blocks honeypot payload before routing, notification or AI work", async () => {
    const seed = seedComparatorQuote();
    const payload = validQuotePayload(seed) as QuoteRequestCreateDto;
    payload.answers = { ...payload.answers, website: "spam.example" };

    await expect(seed.app.quoteRequests.publicController.submit(payload, superAdminActor)).rejects.toThrow("Spam submission blocked");
    expect(seed.app.leads.assignments.list()).toHaveLength(0);
    expect(seed.app.notifications.service.list()).toHaveLength(0);
    expect(seed.app.quoteAiSummary.list()).toHaveLength(0);
  });
});
