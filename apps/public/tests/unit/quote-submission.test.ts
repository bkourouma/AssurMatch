import { describe, expect, it } from "vitest";
import frMessages from "../../messages/fr.json";
import enMessages from "../../messages/en.json";
import { isNegativeNumber, resolveQuoteSubmitOutcome, validateNeedAnswers } from "../../app/lib/quote-submission";

describe("resolveQuoteSubmitOutcome", () => {
  it("accepts a created request with reference and tracking token", () => {
    expect(resolveQuoteSubmitOutcome({ publicReference: "AM-1", verificationToken: "tok" })).toEqual({
      kind: "created",
      publicReference: "AM-1",
      verificationToken: "tok"
    });
  });

  it("treats duplicate_ignored and duplicate bodies as already received", () => {
    expect(resolveQuoteSubmitOutcome({ status: "duplicate_ignored" })).toEqual({ kind: "already_received" });
    expect(resolveQuoteSubmitOutcome({ status: "duplicate", publicReference: "AM-1", verificationToken: "tok" })).toEqual({ kind: "already_received" });
  });

  it("treats a 200 with the original reference but no token as already received", () => {
    expect(resolveQuoteSubmitOutcome({ publicReference: "AM-1" })).toEqual({ kind: "already_received" });
    expect(resolveQuoteSubmitOutcome({ publicReference: "AM-1", verificationToken: "  " })).toEqual({ kind: "already_received" });
    expect(resolveQuoteSubmitOutcome(null)).toEqual({ kind: "already_received" });
  });
});

describe("validateNeedAnswers", () => {
  const fields = [
    { key: "budget", type: "number", required: true },
    { key: "age", type: "number", required: false },
    { key: "city", type: "text", required: true }
  ];
  const messages = { required: "REQ", negative: "NEG" };
  const read = (values: Record<string, string>) => (name: string) => values[name] ?? "";

  it("rejects a negative number, required or optional", () => {
    expect(validateNeedAnswers(fields, read({ answer_budget: "-5", answer_age: "-1", answer_city: "Abidjan" }), messages)).toEqual({
      budget: "NEG",
      age: "NEG"
    });
  });

  it("keeps the required message for empty required fields and accepts zero", () => {
    expect(validateNeedAnswers(fields, read({ answer_budget: "", answer_city: " " }), messages)).toEqual({ budget: "REQ", city: "REQ" });
    expect(validateNeedAnswers(fields, read({ answer_budget: "0", answer_city: "x" }), messages)).toEqual({});
  });

  it("isNegativeNumber ignores blanks and non-numbers", () => {
    expect(isNegativeNumber("")).toBe(false);
    expect(isNegativeNumber("abc")).toBe(false);
    expect(isNegativeNumber("-0.5")).toBe(true);
  });
});

describe("visitor-facing messages", () => {
  it("never expose a technical code and exist in both locales", () => {
    for (const messages of [frMessages, enMessages]) {
      expect(messages.Api.quoteAlreadyReceived).toBeTruthy();
      expect(messages.Api.quoteAlreadyReceived.toLowerCase()).not.toContain("duplicate");
      expect(messages.Forms.negativeNumber).toBeTruthy();
    }
  });
});
