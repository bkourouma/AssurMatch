import { describe, expect, it } from "vitest";
import { adminUserScopeAndReasonError, partnerUserDisplayNameError, USER_INPUT_MESSAGES } from "../../app/lib/user-input-checks";

const uuid = "4282491f-291e-44a6-9dce-28c511c3db32";

describe("admin user form field checks", () => {
  it("names a non-UUID scope instead of blaming the reason", () => {
    expect(adminUserScopeAndReasonError({ countryIds: ["CI"], productIds: ["auto"], reason: "Motif valide long" })).toBe(USER_INPUT_MESSAGES.scopeNotUuid);
    expect(adminUserScopeAndReasonError({ countryIds: [uuid], productIds: ["auto"], reason: "Motif valide long" })).toBe(USER_INPUT_MESSAGES.scopeNotUuid);
    expect(USER_INPUT_MESSAGES.scopeNotUuid).not.toMatch(/motif/i);
  });

  it("accepts UUID scopes and empty scopes, and still checks the reason length", () => {
    expect(adminUserScopeAndReasonError({ countryIds: [uuid], productIds: [uuid], reason: "Motif valide long" })).toBeUndefined();
    expect(adminUserScopeAndReasonError({ countryIds: [], productIds: [], reason: "Motif valide long" })).toBeUndefined();
    expect(adminUserScopeAndReasonError({ countryIds: [], productIds: [], reason: "1234567" })).toBe(USER_INPUT_MESSAGES.reasonTooShort);
  });

  it("names a too short display name for an invited partner user", () => {
    expect(partnerUserDisplayNameError("A")).toBe(USER_INPUT_MESSAGES.displayNameTooShort);
    expect(partnerUserDisplayNameError(" A ")).toBe(USER_INPUT_MESSAGES.displayNameTooShort);
    expect(partnerUserDisplayNameError("Al")).toBeUndefined();
    expect(USER_INPUT_MESSAGES.displayNameTooShort).not.toMatch(/motif/i);
  });
});
