import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("comparator full audit coverage", () => {
  it("covers offer exposure/refusal, consent, quote, prospect, routing, notification and AI decisions", async () => {
    const seed = await seedComparatorQuote();
    await seed.app.offers.publicController.list(seed.countryId, seed.productId);
    await expect(seed.app.offers.publicController.detail(seed.expiredOfferId)).rejects.toThrow();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    const actions = seed.app.audit.writer.all().map((entry) => entry.action);
    [
      "offer.public_listed",
      "offer.public_refused",
      "consent.lead_transmission_granted",
      "quote_request.created",
      "prospect.created",
      "routing.assigned",
      "notification.visitor_queued",
      "notification.broker_queued",
      "ai_summary.skipped"
    ].forEach((action) => expect(actions).toContain(action));
  });
});
