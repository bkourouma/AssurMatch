import { describe, expect, it } from "vitest";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";

describe("ProspectIdentityService", () => {
  it("normalizes email and phone while producing non-reversible fingerprints", () => {
    const service = new ProspectIdentityService();
    const contact = service.normalize({
      displayName: " Visitor ",
      email: " Visitor@Example.COM ",
      phone: "0102030405",
      countryCode: "CI"
    });

    expect(contact.displayName).toBe("Visitor");
    expect(contact.emailNormalized).toBe("visitor@example.com");
    expect(contact.phoneNormalized).toBe("+2250102030405");
    expect(contact.emailFingerprint).not.toContain("visitor@example.com");
    expect(contact.phoneFingerprint).toHaveLength(64);
  });

  it("rejects invalid contact values before prospect creation", () => {
    expect(() => new ProspectIdentityService().normalize({ email: "visitor", phone: "bad" })).toThrow();
  });
});
