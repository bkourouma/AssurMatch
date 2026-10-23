import { describe, expect, it } from "vitest";
import { runPiiBackfill, PiiBackfillUsageError, type PiiBackfillClient } from "../../../src/modules/common/security/pii-backfill";
import { isEncryptedJson, isPiiEnvelope, legacyPiiFingerprint, piiEnvelopeKeyId, PiiVault } from "../../../src/modules/common/security/pii-vault";
import { PrismaProspectsRepository } from "../../../src/modules/prospects/prospects.repository";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { FakeTable, fakePrisma, randomKey, secretsOf, testRing, vaultOf, type TestRing } from "./pii-test-kit";

const UPDATED = new Date("2025-01-15T08:00:00Z");

function legacyProspect(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const email = `visitor${index}@example.test`;
  const phone = `+22501020304${String(index).padStart(2, "0")}`;
  return {
    id: `ps-${String(index).padStart(3, "0")}`, countryId: "c-1", productId: "p-1", displayName: `Visitor ${index}`, anonymizedAt: null,
    emailNormalized: email, phoneNormalized: phone, emailFingerprint: legacyPiiFingerprint(email), phoneFingerprint: legacyPiiFingerprint(phone),
    emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null, consentRecordIds: ["consent"], retentionUntil: new Date("2035-01-01"),
    createdAt: UPDATED, updatedAt: UPDATED, ...overrides
  };
}

function legacyQuote(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `q-${String(index).padStart(3, "0")}`, prospectId: `ps-${String(index).padStart(3, "0")}`, anonymizedAt: null, payload: { city: `City${index}`, vehicle_use: "prive" }, piiKeyId: null, updatedAt: UPDATED, ...overrides };
}

function dataset(count = 7) {
  const prospects = Array.from({ length: count }, (_, index) => legacyProspect(index + 1));
  const quotes = Array.from({ length: count }, (_, index) => legacyQuote(index + 1));
  // An anonymized row is never touched.
  prospects.push(legacyProspect(99, { anonymizedAt: UPDATED, emailNormalized: null, phoneNormalized: null, emailFingerprint: null, phoneFingerprint: null }));
  quotes.push(legacyQuote(99, { anonymizedAt: UPDATED, payload: { anonymized: true } }));
  const tables = { prospect: new FakeTable(prospects), quoteRequest: new FakeTable(quotes) };
  return { tables, client: tables as unknown as PiiBackfillClient, original: JSON.parse(JSON.stringify([prospects, quotes])) as unknown };
}

function snapshot(tables: { prospect: FakeTable; quoteRequest: FakeTable }): string {
  return JSON.stringify([tables.prospect.rows, tables.quoteRequest.rows]);
}

describe("PII backfill (spec 075 FR-A4/A5)", () => {
  it("dry-run counts the rows to encrypt and writes nothing", async () => {
    const { tables, client } = dataset();
    const before = snapshot(tables);
    const report = await runPiiBackfill(client, vaultOf(testRing()), { apply: false, direction: "encrypt", batchSize: 3 });
    expect(report.tables.map((table) => [table.table, table.scanned, table.pending, table.updated])).toEqual([["prospect", 7, 7, 0], ["quoteRequest", 7, 7, 0]]);
    expect(tables.prospect.writes).toHaveLength(0);
    expect(tables.quoteRequest.writes).toHaveLength(0);
    expect(snapshot(tables)).toBe(before);
  });

  it("encrypts every live row in batches, keeps updatedAt, and a second pass changes nothing", async () => {
    const ring = testRing();
    const vault = vaultOf(ring);
    const { tables, client } = dataset();
    const progress: string[] = [];
    const first = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", batchSize: 3, onBatch: ({ table, lastId }) => progress.push(`${table}:${lastId}`) });
    expect(first.tables.map((table) => [table.updated, table.conflicts, table.failed])).toEqual([[7, 0, 0], [7, 0, 0]]);
    expect(progress.filter((entry) => entry.startsWith("prospect:"))).toEqual(["prospect:ps-003", "prospect:ps-006", "prospect:ps-007"]);

    for (const row of tables.prospect.rows.filter((candidate) => !candidate.anonymizedAt)) {
      expect(isPiiEnvelope(row.emailNormalized)).toBe(true);
      expect(isPiiEnvelope(row.phoneNormalized)).toBe(true);
      expect(row).toMatchObject({ piiKeyId: "k1", emailFingerprint: null, phoneFingerprint: null, updatedAt: UPDATED });
      expect(row.emailBlindIndex).toBe(vault.blindIndex("email", vault.decryptField("prospect.emailNormalized", row.emailNormalized as string)));
    }
    for (const row of tables.quoteRequest.rows.filter((candidate) => !candidate.anonymizedAt)) {
      expect(isEncryptedJson(row.payload)).toBe(true);
      expect(row.piiKeyId).toBe("k1");
    }
    expect(tables.prospect.rows.find((row) => row.id === "ps-099")).toMatchObject({ piiKeyId: null, emailNormalized: null });
    expect(tables.quoteRequest.rows.find((row) => row.id === "q-099")).toMatchObject({ piiKeyId: null, payload: { anonymized: true } });
    const stored = snapshot(tables);
    expect(stored).not.toContain("visitor1@example.test");
    expect(stored).not.toContain("City1");

    const writes = tables.prospect.writes.length + tables.quoteRequest.writes.length;
    const second = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", batchSize: 3 });
    expect(second.tables.map((table) => [table.scanned, table.pending, table.updated])).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(tables.prospect.writes.length + tables.quoteRequest.writes.length).toBe(writes);
    // A reindex pass on an up-to-date table finds nothing either.
    const reindex = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", reindex: true, tables: ["prospect"] });
    expect(reindex.tables[0]).toMatchObject({ scanned: 7, pending: 0, updated: 0 });
  });

  it("encrypted rows stay findable through the repository after the backfill (blind index)", async () => {
    const vault = vaultOf(testRing());
    const { tables, client } = dataset(2);
    await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" });
    const { prisma } = fakePrisma(tables as unknown as Record<string, FakeTable>);
    const repository = new PrismaProspectsRepository(prisma, vault);
    const contact = new ProspectIdentityService().normalize({ email: "visitor1@example.test", phone: "+2250102030401", countryCode: "CI", displayName: "Visitor 1" });
    const linked = await repository.createOrLinkWithOutcome("c-1", "p-1", contact, "consent-new");
    expect(linked).toMatchObject({ created: false, prospect: { id: "ps-001", emailNormalized: "visitor1@example.test" } });
  });

  it("rotates: rows of the old key are re-encrypted under the new one, the old key still reads them", async () => {
    const oldRing = testRing(["k1"]);
    const { tables, client } = dataset(4);
    await runPiiBackfill(client, vaultOf(oldRing), { apply: true, direction: "encrypt" });
    const rotated: TestRing = { keys: [...oldRing.keys, { id: "k2", key: randomKey() }], active: "k2", blind: oldRing.blind };
    const vault = vaultOf(rotated);

    const dry = await runPiiBackfill(client, vault, { apply: false, direction: "encrypt" });
    expect(dry.tables.map((table) => table.pending)).toEqual([4, 4]);
    const report = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" });
    expect(report.activeKeyId).toBe("k2");
    expect(report.tables.map((table) => table.updated)).toEqual([4, 4]);
    for (const row of tables.prospect.rows.filter((candidate) => !candidate.anonymizedAt)) {
      expect(row.piiKeyId).toBe("k2");
      expect(piiEnvelopeKeyId(row.emailNormalized)).toBe("k2");
    }
    expect(tables.quoteRequest.rows.filter((row) => !row.anonymizedAt).every((row) => piiEnvelopeKeyId(row.payload) === "k2")).toBe(true);
    expect((await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" })).tables.map((table) => table.pending)).toEqual([0, 0]);
    // The new key alone (old key retired) now reads everything.
    const retired = vaultOf({ keys: rotated.keys.filter((key) => key.id === "k2"), active: "k2", blind: rotated.blind });
    expect(retired.decryptJson("quoteRequest.payload", tables.quoteRequest.rows[0]!.payload)).toEqual({ city: "City1", vehicle_use: "prive" });
  });

  it("--decrypt restores the clear values and legacy fingerprints", async () => {
    const vault = vaultOf(testRing());
    const { tables, client, original } = dataset(5);
    await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", batchSize: 2 });
    const dry = await runPiiBackfill(client, vault, { apply: false, direction: "decrypt" });
    expect(dry.tables.map((table) => table.pending)).toEqual([5, 5]);
    const report = await runPiiBackfill(client, vault, { apply: true, direction: "decrypt", batchSize: 2 });
    expect(report.tables.map((table) => table.updated)).toEqual([5, 5]);
    const [prospects, quotes] = original as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];
    for (const expected of prospects) {
      const row = tables.prospect.rows.find((candidate) => candidate.id === expected.id)!;
      expect(row).toMatchObject({ emailNormalized: expected.emailNormalized, phoneNormalized: expected.phoneNormalized, emailFingerprint: expected.emailFingerprint, phoneFingerprint: expected.phoneFingerprint, piiKeyId: null });
    }
    for (const expected of quotes) expect(tables.quoteRequest.rows.find((row) => row.id === expected.id)).toMatchObject({ payload: expected.payload, piiKeyId: null });
    expect((await runPiiBackfill(client, vault, { apply: true, direction: "decrypt" })).tables.map((table) => table.pending)).toEqual([0, 0]);
  });

  it("reports unreadable rows by id and code, skips them, and never prints a value or a key", async () => {
    const ring = testRing();
    const vault = vaultOf(ring);
    const { tables, client } = dataset(3);
    await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" });
    const victim = tables.prospect.rows[1]!;
    const envelope = victim.emailNormalized as string;
    victim.emailNormalized = envelope.replace(":k1:", ":gone:");
    victim.piiKeyId = "gone";
    const report = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" });
    expect(report.tables[0]).toMatchObject({ failed: 1, updated: 0, failures: [{ id: "ps-002", code: "pii_unknown_key" }] });
    const printed = JSON.stringify(report);
    for (const forbidden of ["visitor2@example.test", envelope, ...secretsOf(ring)]) expect(printed).not.toContain(forbidden);
  });

  it("skips a row modified meanwhile (optimistic check) and resumes after a cursor", async () => {
    const vault = vaultOf(testRing());
    const { tables, client } = dataset(4);
    const racing: PiiBackfillClient = {
      ...client,
      prospect: {
        findMany: (input) => tables.prospect.findMany(input as never),
        updateMany: async (input) => {
          const where = (input as { where: { id: string } }).where;
          if (where.id === "ps-002") tables.prospect.rows[1]!.updatedAt = new Date();
          return tables.prospect.updateMany(input as never);
        }
      }
    };
    const report = await runPiiBackfill(racing, vault, { apply: true, direction: "encrypt", tables: ["prospect"] });
    expect(report.tables[0]).toMatchObject({ updated: 3, conflicts: 1 });
    expect(tables.prospect.rows[1]!.piiKeyId).toBeNull();
    const resumed = await runPiiBackfill(client, vault, { apply: false, direction: "encrypt", tables: ["prospect"], after: "ps-002" });
    expect(resumed.tables[0]).toMatchObject({ scanned: 0, pending: 0 });
    const rerun = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", tables: ["prospect"] });
    expect(rerun.tables[0]).toMatchObject({ scanned: 1, updated: 1 });
  });

  it("refuses to encrypt without keys and validates its options", async () => {
    const { client } = dataset(1);
    await expect(runPiiBackfill(client, PiiVault.disabled(), { apply: true, direction: "encrypt" })).rejects.toBeInstanceOf(PiiBackfillUsageError);
    await expect(runPiiBackfill(client, vaultOf(testRing()), { apply: false, direction: "encrypt", batchSize: 0 })).rejects.toThrow(/batch size/);
    await expect(runPiiBackfill(client, vaultOf(testRing()), { apply: false, direction: "decrypt", reindex: true })).rejects.toThrow(/reindex/);
  });
});
