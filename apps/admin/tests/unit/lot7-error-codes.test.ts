import { describe, expect, it } from "vitest";
import { AdminApiError, ERROR_MESSAGES, authErrorMessage, errorNoticeKey, errorNoticeText, friendlyErrorMessage } from "../../app/lib/auth-error-messages";
import { isSensitiveFlagKey } from "../../app/lib/catalog-messages";
import { forbiddenWordingOf, insurerWriteErrorMessage, offerWriteErrorMessage } from "../../app/lib/offer-messages";

describe("user admin refusals (lot 5)", () => {
  it("words SELF_ACTION_FORBIDDEN and LAST_SUPER_ADMIN (409)", () => {
    expect(authErrorMessage({ status: 409, code: "SELF_ACTION_FORBIDDEN" })).toBe("Vous ne pouvez pas effectuer cette action sur votre propre compte.");
    expect(authErrorMessage({ status: 409, code: "LAST_SUPER_ADMIN" })).toBe("Action impossible : elle laisserait la plateforme sans Super Admin actif.");
    expect(friendlyErrorMessage(new AdminApiError(409, "LAST_SUPER_ADMIN"))).toBe(ERROR_MESSAGES.lastSuperAdmin);
  });

  it("round-trips both codes through the ?error= notice keys", () => {
    for (const code of ["SELF_ACTION_FORBIDDEN", "LAST_SUPER_ADMIN"]) {
      const key = errorNoticeKey(new AdminApiError(409, code));
      expect(key).not.toBe("conflict");
      expect(key).not.toBe("error");
      expect(errorNoticeText(key)).toBe(friendlyErrorMessage(new AdminApiError(409, code)));
    }
  });
});

describe("INVALID_TOKEN (400, or 403 for a non-invited account)", () => {
  it.each([400, 403])("reads as the neutral link message in every context (%i)", (status) => {
    for (const context of ["activate", "reset", "generic"] as const) {
      expect(authErrorMessage({ status, code: "INVALID_TOKEN" }, context)).toBe(ERROR_MESSAGES.tokenInvalid);
    }
  });
});

describe("FORBIDDEN_WORDING on offers and insurers (422)", () => {
  const result = { status: 422, code: "FORBIDDEN_WORDING", message: "Forbidden regulated wording: garanti, prix ferme", details: { wording: ["garanti", "prix ferme"] } };

  it("names every refused expression from details.wording", () => {
    expect(offerWriteErrorMessage(result)).toBe('Formulation interdite : "garanti", "prix ferme". Reformulez ce libellé.');
    expect(insurerWriteErrorMessage(result, "create")).toBe(offerWriteErrorMessage(result));
  });

  it("falls back to the message text, then to a generic wording sentence", () => {
    expect(forbiddenWordingOf({ message: "Forbidden regulated wording: garanti, prix ferme" })).toEqual(["garanti", "prix ferme"]);
    expect(offerWriteErrorMessage({ status: 422, code: "FORBIDDEN_WORDING" })).toContain("Formulation interdite");
  });
});

describe("feature flag sensitivity mirrors the backend policy", () => {
  it("makes ai_summary_enabled read-only (compliance policy path only)", () => {
    expect(isSensitiveFlagKey("ai_summary_enabled")).toBe(true);
    expect(isSensitiveFlagKey("ai_partner_opt_out")).toBe(false);
    for (const key of ["crm_connector_enabled", "country_ai_enabled", "product_ai_scoring_enabled", "product_ai_form_assistant_enabled"]) {
      expect(isSensitiveFlagKey(key), key).toBe(true);
    }
  });
});
