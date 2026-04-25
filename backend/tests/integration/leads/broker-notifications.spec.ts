import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("broker lead notifications", () => {
  it("queues broker notification only after assignment persistence", async () => {
    const seed = seedComparatorQuote();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    const assignment = seed.app.leads.assignments.list()[0];
    const notification = seed.app.notifications.service.list().find((candidate) => candidate.type === "broker_lead_assigned");

    expect(assignment?.brokerNotificationId).toBe(notification?.id);
    expect(notification?.recipientScope).toBe(`partner:${seed.partnerTenantId}`);
  });
});
