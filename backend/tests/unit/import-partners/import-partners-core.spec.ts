import { describe, expect, it } from "vitest";
import {
  MemoryPartnerImportStore,
  computeSha256,
  parsePartnerImportPayload,
  runPartnerImport
} from "../../../../scripts/import-partners-core";

const fakePayload = {
  version: 1,
  metadata: { batchId: "fake-batch-001", fakeData: true, source: "unit-test" },
  partners: [{
    legalName: "Fake Courtage CI Example",
    tradeName: "Fake Courtage",
    registrationNumber: "FAKE-CI-001",
    plan: "pro",
    status: "pending_compliance",
    primaryEmail: "ops@fake-courtage.example",
    primaryWhatsApp: "+2250000000000",
    quotaMonthlyLeads: 25,
    capacityStatus: "available"
  }],
  partnerUsers: [{
    partnerRegistrationNumber: "FAKE-CI-001",
    email: "owner@fake-courtage.example",
    displayName: "Fake Owner",
    role: "broker_owner_pro"
  }],
  licenses: [{
    partnerRegistrationNumber: "FAKE-CI-001",
    licenseNumber: "FAKE-LIC-001",
    issuingAuthority: "Fake Regulator",
    countryIsoCode: "CI",
    productKeys: ["auto"],
    status: "valid",
    effectiveDate: "2026-01-01",
    expirationDate: "2027-01-01"
  }],
  coverage: [{
    partnerRegistrationNumber: "FAKE-CI-001",
    countryIsoCode: "CI",
    productKeys: ["auto"],
    status: "active"
  }],
  offers: [{
    countryIsoCode: "CI",
    productKey: "auto",
    partnerRegistrationNumber: "FAKE-CI-001",
    publicKey: "fake-auto-basic",
    name: "Fake Auto Basic",
    shortDescription: "Fake indicative auto offer",
    guaranteeSummary: "Fake civil liability summary",
    indicativePriceMin: 10000,
    indicativePriceMax: 25000,
    currency: "XOF",
    pricingUnit: "year",
    status: "draft",
    validationStatus: "pending",
    validFrom: "2026-01-01",
    validUntil: "2027-01-01",
    isSponsored: false,
    displayPriority: 0,
    publicDisclaimers: ["Fake indicative offer to be confirmed by an authorized partner."]
  }],
  routingRules: [{ key: "fake-routing-rule", reason: "Not modeled yet" }]
};

function payloadText(input: unknown = fakePayload): string {
  return JSON.stringify(input);
}

describe("secure partner import core", () => {
  it("verifies checksum before importing", async () => {
    await expect(runPartnerImport({
      rawInput: payloadText(),
      expectedChecksum: "0".repeat(64),
      apply: false
    })).rejects.toThrow(/checksum mismatch/i);
  });

  it("rejects non-fake or real-looking values", () => {
    expect(() => parsePartnerImportPayload(payloadText({
      ...fakePayload,
      metadata: { batchId: "bad", fakeData: false, source: "unit-test" }
    }))).toThrow();
    const badEmailPayload = structuredClone(fakePayload);
    badEmailPayload.partners[0]!.primaryEmail = "person@gmail.com";
    expect(() => parsePartnerImportPayload(payloadText(badEmailPayload))).toThrow();
  });

  it("rejects unknown partner fields before they can hide secret-like values", () => {
    const payload = mutablePayload();
    records(payload, "partners")[0]!.unexpectedToken = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    expect(() => parsePartnerImportPayload(payloadText(payload))).toThrow(/secret-like/i);
  });

  it("rejects unknown offer fields", () => {
    const payload = mutablePayload();
    records(payload, "offers")[0]!.unexpectedOfferField = "fake-extra-value";
    expect(() => parsePartnerImportPayload(payloadText(payload))).toThrow();
  });

  it("rejects unknown license fields", () => {
    const payload = mutablePayload();
    records(payload, "licenses")[0]!.unexpectedLicenseField = "fake-extra-value";
    expect(() => parsePartnerImportPayload(payloadText(payload))).toThrow();
  });

  it("rejects unknown partner user fields", () => {
    const payload = mutablePayload();
    records(payload, "partnerUsers")[0]!.unexpectedUserField = "fake-extra-value";
    expect(() => parsePartnerImportPayload(payloadText(payload))).toThrow();
  });

  it("rejects known fields containing secret-like values", () => {
    const payload = mutablePayload();
    records(payload, "partners")[0]!.legalName = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    expect(() => parsePartnerImportPayload(payloadText(payload))).toThrow(/secret-like/i);
  });

  it("continues to accept valid fake payloads", () => {
    expect(parsePartnerImportPayload(payloadText()).metadata.fakeData).toBe(true);
  });

  it("dry-runs by default without audit writes", async () => {
    const rawInput = payloadText();
    const store = new MemoryPartnerImportStore();
    const report = await runPartnerImport({
      rawInput,
      expectedChecksum: computeSha256(rawInput),
      apply: false,
      store
    });

    expect(report.dryRun).toBe(true);
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.skipped).toBe(6);
    expect(store.audits).toHaveLength(0);
  });

  it("applies fake data idempotently and creates audit records", async () => {
    const rawInput = payloadText();
    const store = new MemoryPartnerImportStore();
    const checksum = computeSha256(rawInput);

    const first = await runPartnerImport({ rawInput, expectedChecksum: checksum, apply: true, store, actorId: "unit-operator" });
    const second = await runPartnerImport({ rawInput, expectedChecksum: checksum, apply: true, store, actorId: "unit-operator" });

    expect(first.created).toBe(5);
    expect(first.updated).toBe(0);
    expect(first.skipped).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(5);
    expect(second.skipped).toBe(1);
    expect(store.audits.map((audit) => audit.action)).toEqual([
      "partner_import.attempted",
      "partner_import.completed",
      "partner_import.attempted",
      "partner_import.completed"
    ]);
  });
});

function mutablePayload(): Record<string, unknown> {
  return structuredClone(fakePayload) as unknown as Record<string, unknown>;
}

function records(payload: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return payload[key] as Array<Record<string, unknown>>;
}
