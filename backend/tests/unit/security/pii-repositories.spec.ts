import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { isEncryptedJson, isPiiEnvelope, legacyPiiFingerprint, PiiVault } from "../../../src/modules/common/security/pii-vault";
import { ErasureLookupService } from "../../../src/modules/data-retention/erasure-lookup.service";
import { PrismaRetentionSubjectsRepository } from "../../../src/modules/data-retention/retention-subjects.repository";
import { PrismaLeadAssignmentsRepository } from "../../../src/modules/leads/lead-assignments.repository";
import { setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { PrismaProspectsRepository } from "../../../src/modules/prospects/prospects.repository";
import { ProspectsService } from "../../../src/modules/prospects/prospects.service";
import { PrismaQuoteRequestsRepository } from "../../../src/modules/quote-requests/quote-requests.repository";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";
import { FakeTable, fakePrisma, secretsOf, testRing, vaultOf } from "./pii-test-kit";

const EMAIL = "mariam.traore@visitor.test";
const PHONE = "+2250707080910";
const actor = { actorId: "visitor", actorType: "visitor" } as never;

function contact(email = EMAIL, phone = PHONE, displayName = "Mariam Traore") {
  return new ProspectIdentityService().normalize({ email, phone, countryCode: "CI", displayName });
}

function quote(id: string, prospectId: string, payload: Record<string, unknown>): QuoteRequestRecord {
  const now = new Date("2026-10-01T10:00:00Z");
  return {
    id,
    publicReference: `QR-${id}`,
    verificationTokenHash: "hash",
    countryId: "c-1",
    countryCode: "CI",
    productId: "p-1",
    productKey: "auto",
    quoteFormDefinitionId: "form-1",
    prospectId,
    consentRecordId: "consent-1",
    source: "public_web",
    payload,
    status: "created",
    duplicateStatus: "unique",
    routingStatus: "not_started",
    retentionUntil: new Date("2036-01-01T00:00:00Z"),
    createdAt: now,
    updatedAt: now
  } as QuoteRequestRecord;
}

describe("prospect repository with PII encryption (spec 075 FR-A1/A2, spec 066 F1)", () => {
  it("stores envelopes, blind indexes and the key id, never the clear contact nor a legacy fingerprint", async () => {
    const ring = testRing();
    const vault = vaultOf(ring);
    const { prisma, tables } = fakePrisma({ prospect: new FakeTable() });
    const repository = new PrismaProspectsRepository(prisma, vault);
    const { prospect, created } = await repository.createOrLinkWithOutcome("c-1", "p-1", contact(), "consent-1");

    expect(created).toBe(true);
    // Domain record: clear, legacy fingerprints recomputed, no storage column.
    expect(prospect).toMatchObject({ emailNormalized: EMAIL, phoneNormalized: PHONE, emailFingerprint: legacyPiiFingerprint(EMAIL), phoneFingerprint: legacyPiiFingerprint(PHONE) });
    expect(prospect).not.toHaveProperty("emailBlindIndex");
    expect(prospect).not.toHaveProperty("piiKeyId");

    const row = tables.prospect!.rows[0]!;
    expect(isPiiEnvelope(row.emailNormalized)).toBe(true);
    expect(isPiiEnvelope(row.phoneNormalized)).toBe(true);
    expect(row).toMatchObject({ emailFingerprint: null, phoneFingerprint: null, piiKeyId: "k1", emailBlindIndex: vault.blindIndex("email", EMAIL), phoneBlindIndex: vault.blindIndex("phone", PHONE) });
    const stored = JSON.stringify(tables.prospect!.rows);
    expect(stored).not.toContain(EMAIL);
    expect(stored).not.toContain(PHONE);
    expect(stored).not.toContain(legacyPiiFingerprint(EMAIL));
  });

  it("finds an encrypted prospect by blind index and keeps the F1 rule (same e-mail AND phone AND name)", async () => {
    const vault = vaultOf(testRing());
    const { prisma, tables } = fakePrisma({ prospect: new FakeTable() });
    const repository = new PrismaProspectsRepository(prisma, vault);
    const first = await repository.createOrLinkWithOutcome("c-1", "p-1", contact(), "consent-1");
    const again = await repository.createOrLinkWithOutcome("c-1", "p-1", contact(" Mariam.Traore@Visitor.test ", "+225 07 07 08 09 10", " mariam  traore "), "consent-2");
    expect(again.created).toBe(false);
    expect(again.prospect.id).toBe(first.prospect.id);
    expect(again.prospect.consentRecordIds).toEqual(["consent-1", "consent-2"]);
    expect(again.prospect.emailNormalized).toBe(EMAIL);

    // F1: a shared phone, another e-mail or another name never reuses the profile.
    expect((await repository.createOrLinkWithOutcome("c-1", "p-1", contact("koffi@visitor.test", PHONE, "Mariam Traore"), "consent-3")).created).toBe(true);
    expect((await repository.createOrLinkWithOutcome("c-1", "p-1", contact(EMAIL, PHONE, "Awa Traore"), "consent-4")).created).toBe(true);
    expect((await repository.createOrLinkWithOutcome("c-1", "other", contact(), "consent-5")).created).toBe(true);
    expect(tables.prospect!.rows).toHaveLength(4);
  });

  it("still finds a legacy clear row by its old fingerprint and reads it in clear (transition)", async () => {
    const legacyContact = contact();
    const legacyRow = {
      id: "legacy-1", countryId: "c-1", productId: "p-1", anonymizedAt: null,
      emailNormalized: EMAIL, phoneNormalized: PHONE, emailFingerprint: legacyContact.emailFingerprint, phoneFingerprint: legacyContact.phoneFingerprint,
      emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null, displayName: "Mariam Traore", consentRecordIds: ["consent-0"],
      retentionUntil: new Date("2036-01-01"), createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01")
    };
    const { prisma, tables } = fakePrisma({ prospect: new FakeTable([legacyRow]) });
    const repository = new PrismaProspectsRepository(prisma, vaultOf(testRing()));
    const linked = await repository.createOrLinkWithOutcome("c-1", "p-1", legacyContact, "consent-1");
    expect(linked).toMatchObject({ created: false, prospect: { id: "legacy-1", emailNormalized: EMAIL, phoneNormalized: PHONE } });
    expect(tables.prospect!.rows).toHaveLength(1);
    expect((await repository.require("legacy-1")).emailFingerprint).toBe(legacyContact.emailFingerprint);
  });

  it("writes exactly the pre-lot-8 columns when no key is configured", async () => {
    const { prisma, tables } = fakePrisma({ prospect: new FakeTable() });
    const repository = new PrismaProspectsRepository(prisma, PiiVault.disabled());
    const value = contact();
    await repository.createOrLinkWithOutcome("c-1", "p-1", value, "consent-1");
    const row = tables.prospect!.rows[0]!;
    expect(row).toMatchObject({ emailNormalized: EMAIL, phoneNormalized: PHONE, emailFingerprint: value.emailFingerprint, phoneFingerprint: value.phoneFingerprint });
    // Not even null: a stale Prisma client without the lot 8 columns keeps working.
    for (const column of ["emailBlindIndex", "phoneBlindIndex", "piiKeyId"]) expect(Object.keys(row)).not.toContain(column);
  });
});

describe("quote request payload encryption (spec 075 FR-A1)", () => {
  it("encrypts the payload on create and update, and reads it back in clear", async () => {
    const vault = vaultOf(testRing());
    const { prisma, tables } = fakePrisma({ quoteRequest: new FakeTable() });
    const repository = new PrismaQuoteRequestsRepository(prisma, vault);
    const payload = { contact: { email: EMAIL, phone: PHONE }, city: "Bouake", vehicle_use: "prive" };
    const created = await repository.create(quote("q-1", "ps-1", payload));
    expect(created.payload).toEqual(payload);
    expect(created).not.toHaveProperty("piiKeyId");

    const row = tables.quoteRequest!.rows[0]!;
    expect(isEncryptedJson(row.payload)).toBe(true);
    expect(row.piiKeyId).toBe("k1");
    expect(JSON.stringify(row)).not.toContain(EMAIL);
    expect(JSON.stringify(row)).not.toContain("Bouake");

    const updated = await repository.update("q-1", { payload: { ...payload, city: "Yamoussoukro" } });
    expect(updated.payload).toMatchObject({ city: "Yamoussoukro" });
    expect(JSON.stringify(tables.quoteRequest!.rows[0])).not.toContain("Yamoussoukro");
    // An update without payload leaves the envelope alone.
    await repository.update("q-1", { status: "routed" } as Partial<QuoteRequestRecord>);
    expect((await repository.findByPublicReference("QR-q-1"))?.payload).toMatchObject({ city: "Yamoussoukro" });
  });

  it("reads a legacy clear payload as is", async () => {
    const legacy = { ...quote("q-legacy", "ps-1", { vehicle_use: "pro" }), piiKeyId: null } as unknown as Record<string, unknown>;
    const { prisma } = fakePrisma({ quoteRequest: new FakeTable([legacy]) });
    const repository = new PrismaQuoteRequestsRepository(prisma, vaultOf(testRing()));
    expect((await repository.findById("q-legacy"))?.payload).toEqual({ vehicle_use: "pro" });
  });
});

describe("lead enrichment reads encrypted contacts and answers (spec 075)", () => {
  it("decrypts the prospect contact and the quote payload for the broker view", async () => {
    const vault = vaultOf(testRing());
    const payload = vault.encryptJson("quoteRequest.payload", { city: "Abidjan", vehicle_use: "prive" });
    const client = {
      leadAssignment: new FakeTable([{ id: "a-1", quoteRequestId: "q-1", partnerTenantId: "t-1", status: "assigned", assignedAt: new Date("2026-10-08T12:00:00Z") }]),
      quoteRequest: new FakeTable([{ id: "q-1", publicReference: "QR-1", countryId: "c-1", productId: "pr-1", prospectId: "ps-1", consentRecordId: "cr-1", payload, piiKeyId: "k1" }]),
      country: new FakeTable([{ id: "c-1", isoCode: "CI" }]),
      product: new FakeTable([{ id: "pr-1", key: "auto" }]),
      prospect: new FakeTable([{ id: "ps-1", displayName: "Mariam", emailNormalized: vault.encryptField("prospect.emailNormalized", EMAIL), phoneNormalized: vault.encryptField("prospect.phoneNormalized", PHONE), preferredContactChannel: null }]),
      brokerCrmLeadState: new FakeTable()
    };
    const { prisma } = fakePrisma(client);
    const [assignment] = await new PrismaLeadAssignmentsRepository(prisma, vault).list();
    expect(assignment?.answers).toEqual({ city: "Abidjan", vehicle_use: "prive" });
    expect(assignment?.contact).toMatchObject({ displayName: "Mariam", email: EMAIL, phone: PHONE });
  });
});

describe("erasure lookup and anonymization with encrypted prospects (spec 075 FR-A2, spec 046 D3)", () => {
  function retentionFixture() {
    const ring = testRing();
    const vault = vaultOf(ring);
    const encrypted = {
      id: "ps-enc", countryId: "c-1", productId: "p-1", anonymizedAt: null,
      emailNormalized: vault.encryptField("prospect.emailNormalized", EMAIL), phoneNormalized: vault.encryptField("prospect.phoneNormalized", PHONE),
      emailFingerprint: null, phoneFingerprint: null, emailBlindIndex: vault.blindIndex("email", EMAIL), phoneBlindIndex: vault.blindIndex("phone", PHONE), piiKeyId: "k1"
    };
    const legacy = {
      id: "ps-legacy", countryId: "c-1", productId: "p-2", anonymizedAt: null,
      emailNormalized: EMAIL, phoneNormalized: "+2250102030405", emailFingerprint: legacyPiiFingerprint(EMAIL), phoneFingerprint: legacyPiiFingerprint("+2250102030405"),
      emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null
    };
    const stranger = { ...legacy, id: "ps-other", emailNormalized: "other@visitor.test", emailFingerprint: legacyPiiFingerprint("other@visitor.test") };
    const { prisma, tables } = fakePrisma({
      prospect: new FakeTable([encrypted, legacy, stranger]),
      quoteRequest: new FakeTable([
        { id: "q-enc", publicReference: "QR-ENC", prospectId: "ps-enc", anonymizedAt: null, payload: vault.encryptJson("quoteRequest.payload", { city: "Abidjan" }), piiKeyId: "k1" },
        { id: "q-legacy", publicReference: "QR-LEG", prospectId: "ps-legacy", anonymizedAt: null, payload: { city: "Man" }, piiKeyId: null }
      ]),
      contactMessage: new FakeTable([{ id: "m-1", publicReference: "CM-1", emailFingerprint: legacyPiiFingerprint(EMAIL), anonymizedAt: null }])
    });
    const repository = new PrismaRetentionSubjectsRepository(prisma, vault);
    return { ring, vault, tables, repository, lookup: new ErasureLookupService(repository, new ProspectIdentityService(vault)) };
  }

  it("resolves an e-mail to the encrypted (blind index) and the legacy (fingerprint) rows, and only those", async () => {
    const { lookup } = retentionFixture();
    const targets = await lookup.resolve({ email: " Mariam.Traore@Visitor.test " });
    expect([...(targets.quote_requests ?? [])].sort()).toEqual(["q-enc", "q-legacy"]);
    expect(targets.contact_messages).toEqual(["m-1"]);
  });

  it("resolves a public reference of an encrypted prospect to every row of the same e-mail", async () => {
    const { lookup } = retentionFixture();
    const targets = await lookup.resolve({ publicReference: "QR-ENC" });
    expect([...(targets.quote_requests ?? [])].sort()).toEqual(["q-enc", "q-legacy"]);
    expect(targets.contact_messages).toEqual(["m-1"]);
  });

  it("clears blind indexes and key ids when anonymizing", async () => {
    const { repository, tables } = retentionFixture();
    const stamp = { batchId: "batch-1", now: new Date("2026-10-20T00:00:00Z") };
    expect(await repository.anonymizeProspect("ps-enc", stamp)).toBe(true);
    expect(await repository.anonymizeQuoteRequestRow("q-enc", stamp)).toBe(true);
    expect(tables.prospect!.rows.find((row) => row.id === "ps-enc")).toMatchObject({ emailNormalized: null, phoneNormalized: null, emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null, emailFingerprint: null });
    expect(tables.quoteRequest!.rows.find((row) => row.id === "q-enc")).toMatchObject({ payload: { anonymized: true }, piiKeyId: null });
  });
});

describe("no PII, key or envelope in logs and audit (spec 075 FR-A7)", () => {
  it("keeps the logger sink and the audit free of contact values, keys and envelopes during a write/read journey", async () => {
    const ring = testRing();
    const vault = vaultOf(ring);
    const logs: LogEntry[] = [];
    setLogSink((entry) => logs.push(entry));
    const audit = new AuditLogWriter();
    try {
      const { prisma, tables } = fakePrisma({ prospect: new FakeTable(), quoteRequest: new FakeTable() });
      const prospects = new ProspectsService(audit, new PrismaProspectsRepository(prisma, vault));
      const quotes = new PrismaQuoteRequestsRepository(prisma, vault);
      const prospect = await prospects.createOrLink("c-1", "p-1", contact(), "consent-1", actor);
      await prospects.createOrLink("c-1", "p-1", contact(), "consent-2", actor);
      await quotes.create(quote("q-1", prospect.id, { contact: { email: EMAIL, phone: PHONE }, city: "Abidjan" }));
      await quotes.findById("q-1");
      await prospects.require(prospect.id);

      // A tampered row fails explicitly; the error and the log name the column only.
      const stored = tables.prospect!.rows[0]!;
      const envelope = stored.emailNormalized as string;
      stored.emailNormalized = `${envelope.slice(0, -4)}AAAA`;
      const failure = await prospects.require(prospect.id).then(() => new Error("decryption unexpectedly succeeded"), (error: unknown) => error as Error);
      expect(failure.name).toBe("PiiCryptoError");
      expect(failure.message).toMatch(/prospect\.emailNormalized/);

      const leaked = JSON.stringify({ logs, audit: audit.all(), failure: `${failure.message} ${failure.stack ?? ""}` });
      expect(audit.all().map((entry) => entry.action)).toContain("prospect.created");
      for (const forbidden of [EMAIL, PHONE, "Abidjan", envelope, "enc:v1:", ...secretsOf(ring)]) expect(leaked).not.toContain(forbidden);
      // And the database double never holds the clear values.
      const database = JSON.stringify([tables.prospect!.rows, tables.quoteRequest!.rows]);
      expect(database).not.toContain(EMAIL);
      expect(database).not.toContain(PHONE);
    } finally {
      setLogSink(undefined);
    }
  });
});
