import { describe, expect, it } from "vitest";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";

describe("ProspectIdentityService", () => {
  it("normalizes email and phone while producing non-reversible fingerprints", async () => {
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

  it("rejects invalid contact values before prospect creation", async () => {
    expect(() => new ProspectIdentityService().normalize({ email: "visitor", phone: "bad" })).toThrow();
  });

  describe("country phone rule (spec 050 R8)", () => {
    const service = new ProspectIdentityService();
    const ci = { dialCode: "+225", nationalLengths: [10] };
    const sn = { dialCode: "+221", nationalLengths: [9] };
    const normalize = (phone: string, phoneRule: { dialCode: string; nationalLengths: number[] }) =>
      service.normalize({ email: "visitor@example.com", phone, phoneRule }).phoneNormalized;

    it("accepts +225 followed by 10 digits, with spaces, dots or dashes", () => {
      expect(normalize("+2250700000000", ci)).toBe("+2250700000000");
      expect(normalize("+225 07.00-00 00 00", ci)).toBe("+2250700000000");
    });

    it("prefixes a 10 digit national CI number with +225", () => {
      expect(normalize("07 00 00 00 00", ci)).toBe("+2250700000000");
    });

    it("accepts +221 followed by 9 digits and a 9 digit national SN number", () => {
      expect(normalize("+221771234567", sn)).toBe("+221771234567");
      expect(normalize("77 123 45 67", sn)).toBe("+221771234567");
    });

    it("refuses a wrong length, another dial code or letters", () => {
      expect(() => normalize("77 123 456", sn)).toThrow("Phone is invalid for country");
      expect(() => normalize("+2250700000000", sn)).toThrow("Phone is invalid for country");
      expect(() => normalize("0700000000", sn)).toThrow("Phone is invalid for country");
      expect(() => normalize("07000000ab", ci)).toThrow("Phone is invalid for country");
    });

    it("keeps the legacy normalisation when the country has no rule", () => {
      expect(service.normalize({ email: "visitor@example.com", phone: "0102030405", countryCode: "CI" }).phoneNormalized).toBe("+2250102030405");
      expect(service.normalize({ email: "visitor@example.com", phone: "+22177123456", countryCode: "SN", phoneRule: { dialCode: "+221", nationalLengths: [] } }).phoneNormalized).toBe("+22177123456");
    });
  });
});
