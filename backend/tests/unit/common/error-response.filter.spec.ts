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
