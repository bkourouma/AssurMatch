import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("visitor quote notifications", () => {
  it("queues visitor confirmation for routed and non-routable outcomes", async () => {
    const routed = seedComparatorQuote();
    await routed.app.quoteRequests.publicController.submit(validQuotePayload(routed) as QuoteRequestCreateDto, superAdminActor);
    expect(routed.app.notifications.service.list().some((notification) => notification.type === "visitor_quote_confirmation")).toBe(true);

    const nonRoutable = seedComparatorQuote();
    nonRoutable.app.partners.service.update(nonRoutable.partnerTenantId, { capacityStatus: "blocked", reason: "closed" }, superAdminActor);
    await nonRoutable.app.quoteRequests.publicController.submit(validQuotePayload(nonRoutable) as QuoteRequestCreateDto, superAdminActor);
    expect(nonRoutable.app.notifications.service.list().some((notification) => notification.type === "visitor_quote_non_routable")).toBe(true);

    const manualReview = seedComparatorQuote();
    manualReview.app.products.service.update(manualReview.productId, {
      flags: { ...manualReview.app.products.service.require(manualReview.productId).flags, product_manual_review_required: true },
      reason: "manual review smoke"
    }, superAdminActor);
    await manualReview.app.quoteRequests.publicController.submit(validQuotePayload(manualReview) as QuoteRequestCreateDto, superAdminActor);
    expect(manualReview.app.notifications.service.list().some((notification) => notification.type === "visitor_quote_confirmation")).toBe(true);

    const duplicate = seedComparatorQuote();
    await duplicate.app.quoteRequests.publicController.submit(validQuotePayload(duplicate) as QuoteRequestCreateDto, superAdminActor);
    const duplicatePayload = validQuotePayload(duplicate);
    duplicatePayload.ipAddress = "203.0.113.12";
    duplicatePayload.sessionId = "session-duplicate";
    const confirmation = await duplicate.app.quoteRequests.publicController.submit(duplicatePayload as QuoteRequestCreateDto, superAdminActor);
    expect(confirmation.status).toBe("duplicate");
    expect(duplicate.app.notifications.service.list().filter((notification) => notification.type === "broker_lead_assigned")).toHaveLength(1);
  });
});
