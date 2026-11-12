import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES, authErrorMessage } from "../../app/lib/auth-error-messages";
import { conversationOutcome } from "../../app/lib/conversation-vocabulary";
import { offerWriteErrorMessage } from "../../app/lib/offer-messages";

describe("INVALID_TOKEN (400, or 403 for a non-invited account)", () => {
  it.each([400, 403])("reads as the neutral link message (%i)", (status) => {
    for (const context of ["activate", "password_reset", "generic"] as const) {
      expect(authErrorMessage({ status, code: "INVALID_TOKEN", context })).toBe(AUTH_MESSAGES.tokenInvalid);
    }
  });
});

describe("DUPLICATE_MESSAGE (409) and FORBIDDEN_WORDING (422)", () => {
  it("maps the duplicate message to its readable notice", () => {
    expect(conversationOutcome({ status: 409, code: "DUPLICATE_MESSAGE" }, "sent")).toBe("duplicate");
    expect(conversationOutcome({ status: 422, code: "FORBIDDEN_WORDING" }, "sent")).toBe("forbidden_wording");
  });

  it("names the refused wording of an offer", () => {
    expect(offerWriteErrorMessage({ status: 422, code: "FORBIDDEN_WORDING", wording: ["garanti"] })).toBe("Formulation interdite : « garanti ». Reformulez le champ concerné.");
    expect(offerWriteErrorMessage({ status: 422, code: "FORBIDDEN_WORDING", message: "Forbidden regulated wording: garanti, prix ferme" })).toContain("« prix ferme »");
  });
});
