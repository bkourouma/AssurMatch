import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("quote form and consent", () => {
  it("exposes published form with consent reference and records consent before routing", async () => {
    const seed = await seedComparatorQuote();

    const form = await seed.app.quoteForms.publicController.get(seed.countryId, seed.productId);
    expect(form.consent.purpose).toBe("lead_transmission");

    const confirmation = await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);
    expect(confirmation.routed).toBe(true);
    expect(await seed.app.consent.service.searchRecords(superAdminActor)).toHaveLength(1);
    expect(await seed.app.leads.assignments.list()).toHaveLength(1);
  });

  it("refuses missing explicit consent without creating prospect or lead", async () => {
    const seed = await seedComparatorQuote();
    const payload = {
      ...validQuotePayload(seed),
      consent: { consentTextId: seed.consentTextId, version: "v1", contentHash: "hash-lead-transmission-v1", accepted: false }
    };

    await expect(seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor)).rejects.toThrow("Quote request validation failed");
    expect(await seed.app.prospects.service.list()).toHaveLength(0);
    expect(await seed.app.leads.assignments.list()).toHaveLength(0);
  });
});
