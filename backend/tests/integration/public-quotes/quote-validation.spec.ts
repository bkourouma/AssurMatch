import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("quote validation", () => {
  it("rejects invalid contact data before prospect, lead or notification creation", async () => {
    const seed = await seedComparatorQuote();
    const payload = {
      ...validQuotePayload(seed),
      contact: { displayName: "Visitor", email: "bad-email", phone: "bad-phone" }
    };

    await expect(seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor)).rejects.toThrow("Quote request validation failed");
    expect(await seed.app.prospects.service.list()).toHaveLength(0);
    expect(await seed.app.leads.assignments.list()).toHaveLength(0);
    expect(await seed.app.notifications.service.list()).toHaveLength(0);
  });
});
