import { describe, expect, it } from "vitest";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { MemoryProspectsRepository } from "../../../src/modules/prospects/prospects.repository";

// Spec 066 F1: a prospect profile is only shared by submissions that carry the very same contact.
describe("prospect profile reuse", () => {
  const identity = new ProspectIdentityService();
  const contact = (email: string, phone: string, displayName?: string) => identity.normalize({ email, phone, countryCode: "CI", ...(displayName ? { displayName } : {}) });

  it("never merges two people who share a phone number", async () => {
    const repository = new MemoryProspectsRepository();
    const first = await repository.createOrLinkWithOutcome("c", "p", contact("awa@example.com", "+2250102030405", "Awa"), "consent-1");
    const second = await repository.createOrLinkWithOutcome("c", "p", contact("koffi@example.com", "+2250102030405", "Koffi"), "consent-2");
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.prospect.id).not.toBe(first.prospect.id);
    expect(second.prospect.emailNormalized).toBe("koffi@example.com");
    // The first profile keeps its own contact and consents, untouched.
    expect(first.prospect.emailNormalized).toBe("awa@example.com");
    expect(first.prospect.consentRecordIds).toEqual(["consent-1"]);
  });

  it("does not substitute the phone or the name of an earlier submission sharing the e-mail", async () => {
    const repository = new MemoryProspectsRepository();
    const first = await repository.createOrLinkWithOutcome("c", "p", contact("awa@example.com", "+2250102030405", "Awa"), "consent-1");
    const otherPhone = await repository.createOrLinkWithOutcome("c", "p", contact("awa@example.com", "+2250708091011", "Awa"), "consent-2");
    const otherName = await repository.createOrLinkWithOutcome("c", "p", contact("awa@example.com", "+2250102030405", "Aya"), "consent-3");
    expect(otherPhone.created).toBe(true);
    expect(otherPhone.prospect.phoneNormalized).toBe("+2250708091011");
    expect(otherName.created).toBe(true);
    expect(otherName.prospect.displayName).toBe("Aya");
    expect(new Set([first.prospect.id, otherPhone.prospect.id, otherName.prospect.id]).size).toBe(3);
  });

  it("keeps linking a submission to the existing profile when the e-mail, phone and name are identical", async () => {
    const repository = new MemoryProspectsRepository();
    const first = await repository.createOrLinkWithOutcome("c", "p", contact("Awa@Example.com", "+2250102030405", "Awa"), "consent-1");
    const again = await repository.createOrLinkWithOutcome("c", "p", contact("awa@example.com ", "+225 01 02 03 04 05", " awa "), "consent-2");
    expect(again.created).toBe(false);
    expect(again.prospect.id).toBe(first.prospect.id);
    expect(again.prospect.consentRecordIds).toEqual(["consent-1", "consent-2"]);
    // Another product or country is another profile.
    expect((await repository.createOrLinkWithOutcome("c", "other", contact("awa@example.com", "+2250102030405", "Awa"), "consent-3")).created).toBe(true);
  });
});
