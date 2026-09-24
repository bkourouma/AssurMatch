import { describe, expect, it } from "vitest";
import {
  adminPartnerApplicationSchema,
  partnerApplicationCreateSchema,
  partnerApplicationResponseSchema,
  partnerApplicationStatusSchema
} from "../../../../packages/shared/contracts/partner-application.contracts";
import {
  consentWithdrawalResponseSchema,
  contactAudienceSchema,
  contactMessageCreateSchema,
  contactMessageResponseSchema,
  publicCountryAvailabilitySchema,
  publicCountryDirectoryItemSchema,
  publicInsurerSummarySchema,
  publicPartnerDetailSchema,
  publicPartnerSummarySchema,
  publicPlanPriceSchema,
  publicPlansResponseSchema,
  publicStatsSchema,
  publicSubmissionGuardFieldsSchema,
  waitlistSubscribeResponseSchema,
  waitlistSubscribeSchema,
  type PublicSubmissionGuardFields,
  type WaitlistSubscribeDto
} from "../../../../packages/shared/contracts/public-site.contracts";

function isoDateInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const validApplication = {
  legalName: "Cabinet Ivoire Assurances",
  countryCode: "CI",
  licenseNumber: "CI-2026-0041",
  licenseExpiresAt: isoDateInDays(400),
  productKeys: ["auto"],
  monthlyCapacity: 50,
  contactName: "Awa Kone",
  contactEmail: "Awa.Kone@Example.com",
  contactPhone: "+2250102030405",
  desiredPlan: "pro",
  consent: true as const
};

describe("public site contracts", () => {
  it("fixes the audience and availability vocabularies", () => {
    expect(contactAudienceSchema.options).toEqual(["visitor", "broker", "insurer", "press"]);
    expect(publicCountryAvailabilitySchema.options).toEqual(["open", "pilot", "waitlist"]);
    expect(contactAudienceSchema.safeParse("partner").success).toBe(false);
  });

  it("types the honeypot as an optional string that must stay empty", () => {
    const guard: PublicSubmissionGuardFields = publicSubmissionGuardFieldsSchema.parse({ website: "" });
    expect(guard.website).toBe("");
    expect(publicSubmissionGuardFieldsSchema.parse({}).website).toBeUndefined();
    expect(publicSubmissionGuardFieldsSchema.safeParse({ website: "spam.example" }).success).toBe(false);
    expect(publicSubmissionGuardFieldsSchema.safeParse({ sessionId: "s".repeat(129) }).success).toBe(false);
  });

  it("accepts a consented waitlist subscription and normalizes the contact", () => {
    const input: WaitlistSubscribeDto = {
      countryCode: "ci",
      email: "Visitor@Example.COM",
      productKey: "auto",
      consent: true,
      sessionId: "session-1"
    };
    const parsed = waitlistSubscribeSchema.parse(input);
    expect(parsed.countryCode).toBe("CI");
    expect(parsed.email).toBe("visitor@example.com");

    expect(waitlistSubscribeSchema.safeParse({ countryCode: "CI", email: "visitor@example.com", consent: false }).success).toBe(false);
    expect(waitlistSubscribeSchema.safeParse({ countryCode: "CI", email: "not-an-email", consent: true }).success).toBe(false);
    expect(waitlistSubscribeSchema.safeParse({ countryCode: "CI", email: "visitor@example.com", consent: true, website: "bot" }).success).toBe(false);

    expect(waitlistSubscribeResponseSchema.parse({ status: "accepted", countryCode: "CI", message: "Inscription enregistree" }).status).toBe("accepted");
    expect(waitlistSubscribeResponseSchema.safeParse({ status: "received", countryCode: "CI", message: "x" }).success).toBe(false);
  });

  it("bounds the contact message fields and keeps consent explicit", () => {
    const parsed = contactMessageCreateSchema.parse({
      audience: "press",
      name: "  Fatou Diallo  ",
      email: "press@example.com",
      phone: "+2250102030405",
      countryCode: "ci",
      subject: "Demande d entretien",
      message: "Bonjour, je prepare un article sur la comparaison d assurance.",
      consent: true
    });
    expect(parsed.name).toBe("Fatou Diallo");
    expect(parsed.countryCode).toBe("CI");

    const base = { audience: "visitor", name: "Ali", email: "a@example.com", subject: "Sujet", message: "Message assez long pour passer", consent: true };
    expect(contactMessageCreateSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...base, subject: "ab" }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...base, message: "court" }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...base, message: "x".repeat(4001) }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...base, phone: "0102030405" }).success).toBe(false);
    expect(contactMessageCreateSchema.safeParse({ ...base, consent: true, website: "bot" }).success).toBe(false);

    expect(contactMessageResponseSchema.parse({ status: "received", publicReference: "CT-1", message: "Merci" }).publicReference).toBe("CT-1");
  });

  it("describes the country directory, the indicative stats and the public catalogues", () => {
    const country = publicCountryDirectoryItemSchema.parse({
      isoCode: "ci",
      name: "Cote d Ivoire",
      currency: "XOF",
      languages: ["fr"],
      availability: "open",
      comparisonEnabled: true,
      quoteEnabled: true
    });
    expect(country.isoCode).toBe("CI");

    const stats = { openCountries: 2, activeBrokers: 8, validatedOffers: 30, computedAt: new Date().toISOString(), indicative: true };
    expect(publicStatsSchema.parse(stats).indicative).toBe(true);
    expect(publicStatsSchema.safeParse({ ...stats, indicative: false }).success).toBe(false);
    expect(publicStatsSchema.safeParse({ ...stats, openCountries: -1 }).success).toBe(false);
    expect(publicStatsSchema.safeParse({ ...stats, openCountries: 1.5 }).success).toBe(false);
    expect(publicStatsSchema.safeParse({ ...stats, computedAt: "2026-09-19" }).success).toBe(false);

    const summary = {
      id: crypto.randomUUID(),
      displayName: "Cabinet Ivoire Assurances",
      city: null,
      licenseNumber: "CI-2026-0041",
      issuingAuthority: "DNA",
      licenseExpiresAt: isoDateInDays(400),
      productKeys: ["auto"]
    };
    expect(publicPartnerSummarySchema.parse(summary).city).toBeNull();
    expect(publicPartnerSummarySchema.safeParse({ ...summary, licenseExpiresAt: "31/12/2027" }).success).toBe(false);
    expect(publicPartnerDetailSchema.parse({ ...summary, products: [{ key: "auto", name: "Auto" }], disclaimer: "Courtier agree" }).products).toHaveLength(1);

    expect(publicInsurerSummarySchema.safeParse({ insurerName: "NSIA", offerCount: -1, productKeys: [] }).success).toBe(false);
    expect(publicInsurerSummarySchema.parse({ insurerName: "NSIA", offerCount: 4, productKeys: ["auto"] }).offerCount).toBe(4);
  });

  it("restricts public plan prices to the three billing plans", () => {
    const plan = { plan: "starter", monthlySubscription: 0, perLeadPrice: 2500, setupFee: 0, currency: "XOF" };
    expect(publicPlanPriceSchema.parse(plan).plan).toBe("starter");
    expect(publicPlanPriceSchema.safeParse({ ...plan, plan: "premium" }).success).toBe(false);
    expect(publicPlanPriceSchema.safeParse({ ...plan, perLeadPrice: -1 }).success).toBe(false);
    expect(publicPlansResponseSchema.parse({ items: [plan], notice: "Tarifs indicatifs" }).items).toHaveLength(1);
  });

  it("pins the consent withdrawal response to a cancelled status", () => {
    expect(consentWithdrawalResponseSchema.parse({ status: "cancelled", publicReference: "QR-1", alreadyWithdrawn: true, message: "Deja retire" }).alreadyWithdrawn).toBe(true);
    expect(consentWithdrawalResponseSchema.safeParse({ status: "withdrawn", publicReference: "QR-1", alreadyWithdrawn: false, message: "x" }).success).toBe(false);
  });
});

describe("partner application contracts", () => {
  it("fixes the review vocabulary", () => {
    expect(partnerApplicationStatusSchema.options).toEqual(["received", "under_review", "accepted", "rejected"]);
  });

  it("accepts a complete application and normalizes the contact e-mail", () => {
    const parsed = partnerApplicationCreateSchema.parse({ ...validApplication, sessionId: "session-1", website: "" });
    expect(parsed.contactEmail).toBe("awa.kone@example.com");
    expect(parsed.countryCode).toBe("CI");
    expect(parsed.desiredPlan).toBe("pro");
  });

  it("refuses an expired or same-day licence and keeps the future refine strict", () => {
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, licenseExpiresAt: isoDateInDays(-1) }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, licenseExpiresAt: isoDateInDays(0) }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, licenseExpiresAt: "2027-13-01" }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, licenseExpiresAt: isoDateInDays(2) }).success).toBe(true);
  });

  it("bounds capacity, products, consent, plan and the honeypot", () => {
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, productKeys: [] }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, productKeys: Array.from({ length: 11 }, (_unused, index) => `p${index}`) }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, monthlyCapacity: 0 }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, monthlyCapacity: 10_001 }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, monthlyCapacity: 12.5 }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, licenseNumber: "CI" }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, contactPhone: "0102030405" }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, desiredPlan: "premium" }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, consent: false }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, website: "bot" }).success).toBe(false);
    expect(partnerApplicationCreateSchema.safeParse({ ...validApplication, legalName: "A" }).success).toBe(false);
  });

  it("returns a reference plus next steps and never exposes the raw e-mail in the admin view", () => {
    expect(partnerApplicationResponseSchema.parse({ status: "received", publicReference: "PA-1", message: "Merci", nextSteps: ["Verification des licences"] }).nextSteps).toHaveLength(1);

    const admin = adminPartnerApplicationSchema.parse({
      id: crypto.randomUUID(),
      publicReference: "PA-1",
      countryId: crypto.randomUUID(),
      legalName: "Cabinet Ivoire Assurances",
      licenseNumber: "CI-2026-0041",
      licenseExpiresAt: new Date().toISOString(),
      productIds: [crypto.randomUUID()],
      monthlyCapacity: 50,
      contactName: "Awa Kone",
      contactPhone: "+2250102030405",
      desiredPlan: "pro",
      status: "under_review",
      createdAt: new Date().toISOString()
    });
    expect(Object.keys(admin)).not.toContain("contactEmail");
    expect(Object.keys(admin)).not.toContain("contactEmailNormalized");
    expect(admin.status).toBe("under_review");
  });
});
