import { describe, expect, it } from "vitest";
import { TEAM_INVITE_UNAVAILABLE_MESSAGE, selfServiceErrorMessage } from "../../app/lib/self-service-messages";

// E-P2-06a: inviting a colleague whose address is already registered must read like any other
// address that cannot be invited, never "already used" (account enumeration).

describe("team invitation refusal wording", () => {
  it("answers the API EMAIL_ALREADY_USED refusal (409 and 422) with the neutral message", () => {
    for (const status of [409, 422]) {
      expect(selfServiceErrorMessage({ status, code: "EMAIL_ALREADY_USED", message: "This e-mail address cannot be invited" })).toBe(TEAM_INVITE_UNAVAILABLE_MESSAGE);
    }
  });

  it("answers a legacy raw duplicate-e-mail text with the same neutral message", () => {
    expect(selfServiceErrorMessage({ status: 409, message: "E-mail already used" })).toBe(TEAM_INVITE_UNAVAILABLE_MESSAGE);
  });

  it("never reveals that an account exists", () => {
    expect(TEAM_INVITE_UNAVAILABLE_MESSAGE).not.toMatch(/déjà|existe|utilisée|compte/i);
  });
});
