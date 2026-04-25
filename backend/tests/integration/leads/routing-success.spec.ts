import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("lead routing success", () => {
  it("creates one lead assignment for the eligible active authorized licensed broker", async () => {
    const seed = seedComparatorQuote();

    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    const assignments = seed.app.leads.assignments.list();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.partnerTenantId).toBe(seed.partnerTenantId);
    expect(seed.app.notifications.service.list().some((notification) => notification.type === "broker_lead_assigned")).toBe(true);
  });
});
