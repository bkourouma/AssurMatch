import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toSafeErrorResponse } from "../../../src/modules/common/filters/error-response.filter";

const correlationId = "8a413d58-323c-43b7-86a1-2bfafb54ffab";

describe("toSafeErrorResponse", () => {
  it("labels an unmatched route NOT_FOUND, even when its path reads like a blocker", () => {
    expect(toSafeErrorResponse(new NotFoundException("Cannot GET /"), correlationId).code).toBe("NOT_FOUND");
    expect(toSafeErrorResponse(new NotFoundException("Cannot GET /rates"), correlationId).code).toBe("NOT_FOUND");
    expect(toSafeErrorResponse(new NotFoundException("Cannot POST /feature-flags"), correlationId).code).toBe("NOT_FOUND");
  });

  it("labels an unknown resource NOT_FOUND", () => {
    expect(toSafeErrorResponse(new Error("Quote status not available"), correlationId).code).toBe("NOT_FOUND");
    expect(toSafeErrorResponse(new Error("Offer not found"), correlationId).code).toBe("NOT_FOUND");
  });

  it("labels an unexpected failure INTERNAL_ERROR", () => {
    expect(toSafeErrorResponse(new Error("Something broke"), correlationId).code).toBe("INTERNAL_ERROR");
    expect(toSafeErrorResponse("not an error", correlationId).code).toBe("INTERNAL_ERROR");
  });

  it("keeps the blocker codes and VALIDATION_FAILED for bad input", () => {
    expect(toSafeErrorResponse(new Error("Country is not publicly available"), correlationId).code).toBe("COUNTRY_DISABLED");
    expect(toSafeErrorResponse(new Error("Consent is required"), correlationId).code).toBe("CONSENT_REQUIRED");
    expect(toSafeErrorResponse(new Error("Invalid submission"), correlationId).code).toBe("VALIDATION_FAILED");
    expect(toSafeErrorResponse(new BadRequestException("Bad payload"), correlationId).code).toBe("VALIDATION_FAILED");
  });

  it("still hides sensitive messages", () => {
    const response = toSafeErrorResponse(new Error("database connection lost"), correlationId);
    expect(response).toEqual({
      code: "INTERNAL_ERROR",
      message: "The request could not be processed safely",
      correlationId
    });
  });

  it("keeps an explicit known code and the activation blockers (spec 050 R11)", () => {
    const blockers = [{ section: "country:1", control: "country_regime", label: "Regime", evidence: "manquant" }];
    const response = toSafeErrorResponse(new UnprocessableEntityException({ code: "ACTIVATION_BLOCKED", message: "Country activation blocked", blockers }), correlationId);
    expect(response.code).toBe("ACTIVATION_BLOCKED");
    expect(response.blockers).toEqual(blockers);
    expect(toSafeErrorResponse(new ConflictException({ code: "CATALOG_UPDATE_CONFLICT", message: "Catalog update conflict" }), correlationId).code).toBe("CATALOG_UPDATE_CONFLICT");
    expect(toSafeErrorResponse(new ConflictException({ code: "NOT_A_CODE", message: "Product conflict" }), correlationId).code).toBe("PRODUCT_DISABLED");
  });
});

describe("toSafeErrorResponse details (spec 062)", () => {
  const failure = (details: unknown) => new UnprocessableEntityException({ code: "FORBIDDEN_WORDING", message: "Refused", details });

  it("relays only the wording list and the read-only reason", () => {
    expect(toSafeErrorResponse(failure({ wording: ["remboursement garanti", "buy now"] }), correlationId).details).toEqual({ wording: ["remboursement garanti", "buy now"] });
    expect(toSafeErrorResponse(new ConflictException({ code: "CONVERSATION_READ_ONLY", message: "Read-only", details: { reason: "lead_closed" } }), correlationId).details).toEqual({ reason: "lead_closed" });
  });

  it("drops every other key and every value of another shape", () => {
    const response = toSafeErrorResponse(failure({ wording: ["ok"], reason: "lead_closed", internalId: "42", stack: "at secret.ts:1", token: "abc", nested: { wording: ["x"] } }), correlationId);
    expect(response.details).toEqual({ wording: ["ok"], reason: "lead_closed" });
    expect(JSON.stringify(response)).not.toMatch(/internalId|secret|token|nested/);
    // Wrong shapes: not an array, a non-string entry, an overlong entry, too many entries, an object reason.
    for (const details of [{ wording: "garanti" }, { wording: [1, 2] }, { wording: ["x".repeat(81)] }, { wording: Array.from({ length: 21 }, () => "a") }, { wording: { 0: "a" } }, { reason: { code: 1 } }, { reason: "x".repeat(81) }, { other: ["a"] }, [], "text", null]) {
      expect(toSafeErrorResponse(failure(details), correlationId), JSON.stringify(details)).not.toHaveProperty("details");
    }
    // A valid key survives next to an invalid one.
    expect(toSafeErrorResponse(failure({ wording: [1], reason: "consent_withdrawn" }), correlationId).details).toEqual({ reason: "consent_withdrawn" });
  });
});
