import { describe, expect, it } from "vitest";
import { PasswordPolicyService } from "../../../src/modules/auth/password-policy.service";

describe("PasswordPolicyService", () => {
  const service = new PasswordPolicyService();

  it("accepts a strong-enough password", () => {
    expect(() => service.assertAcceptable("A long passphrase 123", { email: "person@example.com", displayName: "Person Example" })).not.toThrow();
  });

  it("rejects short passwords", () => {
    expect(() => service.assertAcceptable("short")).toThrow(/at least 12/);
  });

  it("rejects passwords matching identity data", () => {
    expect(() => service.assertAcceptable("person@example.com", { email: "person@example.com" })).toThrow(/email/);
    expect(() => service.assertAcceptable("Person Example", { displayName: "Person Example" })).toThrow(/display name/);
  });

  it("rejects common passwords", () => {
    expect(() => service.assertAcceptable("password1234")).toThrow(/common/);
  });
});
