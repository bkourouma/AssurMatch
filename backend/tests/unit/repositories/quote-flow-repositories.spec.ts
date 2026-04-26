import { describe, expect, it } from "vitest";
import type { ConsentRecord, ConsentText } from "../../../src/modules/consent/consent.module";
import { MemoryConsentRecordsRepository } from "../../../src/modules/consent/consent-records.repository";
import type { NormalizedProspectContact } from "../../../src/modules/prospects/prospect-identity.service";
import { MemoryProspectsRepository } from "../../../src/modules/prospects/prospects.repository";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";
import { MemoryQuoteRequestsRepository } from "../../../src/modules/quote-requests/quote-requests.repository";

describe("quote flow memory repositories", () => {
  it("creates consent evidence, links prospects and stores quote requests", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const consent = new MemoryConsentRecordsRepository();
    const prospects = new MemoryProspectsRepository();
    const quotes = new MemoryQuoteRequestsRepository();
    const productId = "product-auto";
    const text: ConsentText = {
      id: "consent-text-1",
      purpose: "lead_transmission",
      countryId: "country-ci",
      productId,
      channel: "public_web",
      recipientCategory: "courtier_partenaire_eligible",
      language: "fr",
      version: "v1",
      status: "published",
      contentHash: "hash",
      publishedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const record: ConsentRecord = {
      id: "consent-record-1",
      consentTextId: text.id,
      subjectReference: "fingerprint-email",
      purpose: "lead_transmission",
      countryId: text.countryId,
      productId,
      channel: "public_web",
      intendedRecipient: "courtier_partenaire_eligible",
      status: "granted",
      grantedAt: now.toISOString(),
      retentionUntil: new Date("2036-01-01T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now
    };
    const contact: NormalizedProspectContact = {
      displayName: "Visitor",
      emailNormalized: "visitor@example.com",
      phoneNormalized: "+2250102030405",
      emailFingerprint: "fingerprint-email",
      phoneFingerprint: "fingerprint-phone"
    };
    const quote: QuoteRequestRecord = {
      id: "quote-1",
      publicReference: "QR-2026-0001",
      verificationTokenHash: "token-hash",
      countryId: text.countryId,
      countryCode: "CI",
      productId,
      productKey: "auto",
      quoteFormDefinitionId: "form-1",
      prospectId: "prospect-1",
      consentRecordId: record.id,
      source: "public_web",
      payload: { vehicle_use: "prive" },
      status: "created",
      duplicateStatus: "unique",
      routingStatus: "not_started",
      retentionUntil: new Date("2036-01-01T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now
    };

    consent.createText(text);
    consent.createRecord(record);
    const prospect = prospects.createOrLink(text.countryId, productId, contact, record.id);
    quotes.create({ ...quote, prospectId: prospect.id });

    expect(consent.hasValidConsent(record.id, "lead_transmission", text.countryId, text.productId)).toBe(true);
    expect(prospects.require(prospect.id).consentRecordIds).toEqual([record.id]);
    expect(quotes.findByPublicReference(quote.publicReference)?.consentRecordId).toBe(record.id);
  });
});
