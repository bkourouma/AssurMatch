import { describe, expect, it } from "vitest";
import { errorNoticeText } from "../../app/lib/auth-error-messages";
import {
  USER_INPUT_MESSAGES,
  adminUserScopeAndReasonError,
  partnerUserDisplayNameError,
  DISPLAY_NAME_TOO_SHORT_MESSAGE,
  REASON_TOO_SHORT_MESSAGE,
  displayNameError,
  isDisplayNameValid,
  reasonError,
  reasonRuleFromBackendMessage
} from "../../app/lib/user-input-checks";
import { offerWriteErrorMessage } from "../../app/lib/offer-messages";
import { adminWriteErrorMessage } from "../../app/lib/catalog-messages";

describe("display name check", () => {
  it("refuses a one-character name, trimmed", () => {
    expect(isDisplayNameValid("A")).toBe(false);
    expect(isDisplayNameValid("  A  ")).toBe(false);
    expect(isDisplayNameValid("")).toBe(false);
    expect(displayNameError("A")).toBe("Le nom doit contenir au moins 2 caractères.");
    expect(displayNameError("A")).toBe(DISPLAY_NAME_TOO_SHORT_MESSAGE);
  });

  it("accepts two characters or more", () => {
    expect(isDisplayNameValid("Al")).toBe(true);
    expect(displayNameError("Awa Traoré")).toBeUndefined();
  });
});

describe("reason check", () => {
  it("requires 8 characters after trim", () => {
    expect(reasonError("court")).toBe("Le motif doit contenir au moins 8 caractères.");
    expect(reasonError("   1234567   ")).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(reasonError("12345678")).toBeUndefined();
  });

  it("names the reason from a backend validation message, never echoing it", () => {
    expect(reasonRuleFromBackendMessage("A reason is required for sensitive changes")).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(reasonRuleFromBackendMessage("Validation failed")).toBeUndefined();
    expect(reasonRuleFromBackendMessage(undefined)).toBeUndefined();
  });

  it("is used by the offer and catalogue 400 messages", () => {
    expect(offerWriteErrorMessage({ status: 400, message: "reason: too short" })).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(adminWriteErrorMessage({ status: 400, message: "reason: too short" })).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(offerWriteErrorMessage({ status: 400, message: "Validation failed" })).not.toMatch(/Validation failed/);
  });

  it("exposes readable notices for the redirect-style user actions", () => {
    expect(errorNoticeText("name_too_short")).toBe(DISPLAY_NAME_TOO_SHORT_MESSAGE);
    expect(errorNoticeText("reason_too_short")).toBe(REASON_TOO_SHORT_MESSAGE);
  });
});

describe("country code fields (ecart 15)", () => {
  it("never show a bare CI placeholder and explain the expected code", async () => {
    const { readFileSync } = await import("node:fs");
    const files = ["billing/page.tsx", "billing/lot5-forms.tsx", "billing/disputes-panel.tsx", "prospects/page.tsx"];
    for (const file of files) {
      const source = readFileSync(new URL(`../../app/${file}`, import.meta.url), "utf8");
      expect(source, file).not.toContain('placeholder="CI"');
      expect(source, file).toContain('placeholder="Ex. : CI"');
      expect(source, file).toContain("Code pays sur 2 lettres, par exemple CI.");
    }
  });
});

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
