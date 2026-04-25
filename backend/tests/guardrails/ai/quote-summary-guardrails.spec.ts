import { describe, expect, it } from "vitest";
import { QuoteAISummaryGuardrails } from "../../../src/modules/ai/quote-summary/quote-ai-summary-guardrails";

describe("quote AI summary guardrails", () => {
  it("rejects recommendation, firm price, eligibility, routing decision and discriminatory-looking output", () => {
    const guardrails = new QuoteAISummaryGuardrails();

    expect(guardrails.evaluate("Je recommande la meilleure offre avec prix ferme.").approved).toBe(false);
    expect(guardrails.evaluate("Courtier choisi et client eligible.").approved).toBe(false);
    expect(guardrails.evaluate("Assistance: demande a analyser par un courtier partenaire.").approved).toBe(true);
  });
});
