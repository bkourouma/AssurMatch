import { describe, expect, it } from "vitest";
import { AISummaryFlagPolicy } from "../../../../src/modules/ai/quote-summary/ai-summary-flag-policy";

const moduleConfig = {
  id: crypto.randomUUID(),
  key: "quote_summary",
  status: "enabled" as const,
  guardrailStatus: "approved" as const,
  auditPolicy: "metadata_only" as const,
  modelCallCount: 0,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("AISummaryFlagPolicy", () => {
  it("requires global, country, product and module guardrail approval", async () => {
    const policy = new AISummaryFlagPolicy();

    expect(policy.canRun({
      globalFlags: { ai_summary_enabled: true },
      countryFlags: { country_ai_enabled: true },
      productFlags: { product_ai_form_assistant_enabled: true },
      moduleConfig
    })).toBe(true);
    expect(policy.canRun({ globalFlags: { ai_summary_enabled: false }, countryFlags: { country_ai_enabled: true }, moduleConfig })).toBe(false);
    expect(policy.canRun({ globalFlags: { ai_summary_enabled: true }, countryFlags: { country_ai_enabled: false }, moduleConfig })).toBe(false);
    expect(policy.canRun({ globalFlags: { ai_summary_enabled: true }, countryFlags: { country_ai_enabled: true }, moduleConfig })).toBe(false);
    expect(policy.canRun({
      globalFlags: { ai_summary_enabled: true },
      countryFlags: { country_ai_enabled: true },
      productFlags: { product_ai_form_assistant_enabled: false },
      moduleConfig
    })).toBe(false);
  });
});
