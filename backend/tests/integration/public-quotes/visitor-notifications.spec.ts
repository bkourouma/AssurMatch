import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("visitor quote notifications", () => {
  it("queues visitor confirmation for routed and non-routable outcomes", async () => {
    const routed = await seedComparatorQuote();
    await routed.app.quoteRequests.publicController.submit(validQuotePayload(routed) as QuoteRequestCreateDto, superAdminActor);
    // Spec 054 R4: "received" then one "transmitted" per assignment (was a single spec 044 "confirmation").
    const routedTypes = (await routed.app.notifications.service.list()).map((notification) => notification.type);
    expect(routedTypes).toContain("visitor_quote_received");
    expect(routedTypes).toContain("visitor_quote_transmitted");

    const nonRoutable = await seedComparatorQuote();
    await nonRoutable.app.partners.service.update(nonRoutable.partnerTenantId, { capacityStatus: "blocked", reason: "closed" }, superAdminActor);
    await nonRoutable.app.quoteRequests.publicController.submit(validQuotePayload(nonRoutable) as QuoteRequestCreateDto, superAdminActor);
    expect((await nonRoutable.app.notifications.service.list()).some((notification) => notification.type === "visitor_quote_non_routable")).toBe(true);

    const manualReview = await seedComparatorQuote();
    await manualReview.app.products.service.update(manualReview.productId, {
      flags: { ...(await manualReview.app.products.service.require(manualReview.productId)).flags, product_manual_review_required: true },
      reason: "manual review smoke"
    }, superAdminActor);
    await manualReview.app.quoteRequests.publicController.submit(validQuotePayload(manualReview) as QuoteRequestCreateDto, superAdminActor);
    // Spec 054 FR-010: a request in manual review is "in review", never announced as transmitted.
    const manualTypes = (await manualReview.app.notifications.service.list()).map((notification) => notification.type);
    expect(manualTypes).toContain("visitor_quote_in_review");
    expect(manualTypes).not.toContain("visitor_quote_transmitted");

    const duplicate = await seedComparatorQuote();
    await duplicate.app.quoteRequests.publicController.submit(validQuotePayload(duplicate) as QuoteRequestCreateDto, superAdminActor);
    const duplicatePayload = validQuotePayload(duplicate);
    duplicatePayload.ipAddress = "203.0.113.12";
    duplicatePayload.sessionId = "session-duplicate";
    const confirmation = await duplicate.app.quoteRequests.publicController.submit(duplicatePayload as QuoteRequestCreateDto, superAdminActor);
    expect(confirmation.status).toBe("duplicate");
    expect((await duplicate.app.notifications.service.list()).filter((notification) => notification.type === "broker_lead_assigned")).toHaveLength(1);
  });
});
