import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { runPiiBackfill, type PiiBackfillClient, type PiiBackfillDelegate } from "../../src/modules/common/security/pii-backfill";
import { PiiKeyRing } from "../../src/modules/common/security/pii-key-ring";
import { PiiVault, legacyPiiFingerprint } from "../../src/modules/common/security/pii-vault";
import type { RuntimeSmokeRun } from "./runtime-postgres-smoke-data";
import type { RuntimeSmokePrismaClient } from "./runtime-postgres-smoke-prisma";

/** The Prisma client of the smoke harness also exposes the raw query API (typed narrowly elsewhere). */
interface RawClient {
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $transaction<T>(fn: (tx: RawClient) => Promise<T>): Promise<T>;
  prospect: PiiBackfillDelegate;
  quoteRequest: PiiBackfillDelegate;
}

type Row = Record<string, unknown>;

/**
 * Spec 075 (lot 8) on the real smoke database: the "AuditLog" append-only trigger of migration 0037 and the
 * PII encrypt/decrypt backfill round trip. Rows are namespaced by the run id; the backfill only sees them.
 */
export async function smokeSecurityHardening(prismaClient: RuntimeSmokePrismaClient, run: RuntimeSmokeRun): Promise<void> {
  const db = prismaClient as unknown as RawClient;
  await smokeAuditAppendOnly(db, run);
  await smokePiiBackfillRoundTrip(db, run);
}

async function expectRefused(promise: Promise<unknown>, label: string): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => /append-only/i.test(JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? error)),
    `${label} should be refused by the append-only trigger`
  );
}

async function smokeAuditAppendOnly(db: RawClient, run: RuntimeSmokeRun): Promise<void> {
  const id = `${run.id}-audit`;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "AuditLog"(id, action, "targetType", "targetId", scope, result, context, "retentionUntil") VALUES ($1, 'runtime.smoke', 'Smoke', $1, '{}'::jsonb, 'success', '{}'::jsonb, now() + interval '1 day')`,
      id
    );
    const inserted = await db.$queryRawUnsafe<Row[]>(`SELECT id FROM "AuditLog" WHERE id = $1`, id);
    assert.equal(inserted.length, 1, "INSERT into AuditLog must be accepted");

    await expectRefused(db.$executeRawUnsafe(`UPDATE "AuditLog" SET reason = 'tampered' WHERE id = $1`, id), "UPDATE");
    await expectRefused(db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, id), "DELETE");
    await expectRefused(db.$executeRawUnsafe(`TRUNCATE TABLE "AuditLog"`), "TRUNCATE");
    const still = await db.$queryRawUnsafe<Row[]>(`SELECT reason FROM "AuditLog" WHERE id = $1`, id);
    assert.equal(still.length, 1, "the audit row must survive refused statements");
    assert.equal(still[0]?.reason ?? null, null, "the audit row must be unchanged");

    // Maintenance gate: only a transaction that opens it with SET LOCAL may modify rows; it closes with the transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL assurmatch.audit_maintenance = 'on'`);
      await tx.$executeRawUnsafe(`UPDATE "AuditLog" SET reason = 'maintenance' WHERE id = $1`, id);
    });
    const updated = await db.$queryRawUnsafe<Row[]>(`SELECT reason FROM "AuditLog" WHERE id = $1`, id);
    assert.equal(updated[0]?.reason, "maintenance", "the maintenance gate must allow an UPDATE");
    await expectRefused(db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, id), "DELETE after the gate closed");
  } finally {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL assurmatch.audit_maintenance = 'on'`);
      await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, id);
    });
  }
}

function scoped(delegate: PiiBackfillDelegate, prefix: string): PiiBackfillDelegate {
  return {
    findMany: (input) => delegate.findMany({ ...(input as Row), where: { AND: [(input as Row).where, { id: { startsWith: prefix } }] } }),
    updateMany: (input) => delegate.updateMany(input)
  };
}

async function smokePiiBackfillRoundTrip(db: RawClient, run: RuntimeSmokeRun): Promise<void> {
  const prefix = `${run.id}-pii-`;
  const vault = new PiiVault(new PiiKeyRing([{ id: "smoke1", key: randomBytes(32) }], "smoke1", randomBytes(32)));
  const client: PiiBackfillClient = { prospect: scoped(db.prospect, prefix), quoteRequest: scoped(db.quoteRequest, prefix) };
  const ids = ["a", "b"].map((suffix) => `${prefix}${suffix}`);
  const t0 = new Date("2026-01-01T10:00:00.123Z");
  const contacts = ids.map((id, index) => ({ id, email: `${run.id}-${index}@example.test`, phone: `+22501000000${index}` }));
  try {
    for (const c of contacts) {
      await db.$executeRawUnsafe(
        `INSERT INTO "Prospect"(id, "countryId", "productId", "emailNormalized", "phoneNormalized", "emailFingerprint", "phoneFingerprint", "displayName", "consentRecordIds", "retentionUntil", "createdAt", "updatedAt") VALUES ($1, 'smoke-c', 'smoke-p', $2, $3, $4, $5, 'Smoke', ARRAY['x'], now(), $6, $6)`,
        c.id, c.email, c.phone, legacyPiiFingerprint(c.email), legacyPiiFingerprint(c.phone), t0
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "QuoteRequest"(id, "publicReference", "verificationTokenHash", "countryId", "productId", "quoteFormDefinitionId", "prospectId", "consentRecordId", source, payload, "retentionUntil", "updatedAt") VALUES ($1, $2, 'h', 'smoke-c', 'smoke-p', 'f', $3, 'cr', 'web', $4::jsonb, now(), $5)`,
        `${c.id}-q`, `${c.id}-ref`, c.id, JSON.stringify({ contact: { email: c.email, phone: c.phone }, answers: { n: 1 } }), t0
      );
    }

    const dry = await runPiiBackfill(client, vault, { apply: false, direction: "encrypt" });
    assert.ok(dry.tables.every((t) => t.updated === 0), "a dry run must write nothing");
    const clearAfterDry = await db.$queryRawUnsafe<Row[]>(`SELECT "emailNormalized" FROM "Prospect" WHERE id = ANY($1)`, ids);
    assert.ok(clearAfterDry.every((r) => String(r.emailNormalized).endsWith("@example.test")), "dry run must leave clear values");

    const applied = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt", batchSize: 1 });
    assert.ok(applied.tables.every((t) => t.failed === 0 && t.conflicts === 0), `encrypt must succeed: ${JSON.stringify(applied.tables)}`);
    const encrypted = await db.$queryRawUnsafe<Row[]>(`SELECT * FROM "Prospect" WHERE id = ANY($1) ORDER BY id`, ids);
    assert.equal(encrypted.length, 2);
    for (const row of encrypted) {
      assert.match(String(row.emailNormalized), /^enc:v1:smoke1:/, "e-mail must be stored encrypted");
      assert.match(String(row.phoneNormalized), /^enc:v1:smoke1:/, "phone must be stored encrypted");
      assert.equal(row.piiKeyId, "smoke1");
      assert.ok(row.emailBlindIndex && row.phoneBlindIndex, "blind indexes must be set");
      assert.equal(row.emailFingerprint, null);
      assert.equal(row.phoneFingerprint, null);
      assert.equal(new Date(row.updatedAt as string | Date).getTime(), t0.getTime(), "updatedAt must be preserved");
    }
    const encryptedQuotes = await db.$queryRawUnsafe<Row[]>(`SELECT payload, "piiKeyId" FROM "QuoteRequest" WHERE "prospectId" = ANY($1)`, ids);
    assert.ok(encryptedQuotes.every((q) => q.piiKeyId === "smoke1" && !JSON.stringify(q.payload).includes("@example.test")), "quote payload must be encrypted");

    const second = await runPiiBackfill(client, vault, { apply: true, direction: "encrypt" });
    assert.ok(second.tables.every((t) => t.pending === 0 && t.updated === 0), "the backfill must be idempotent");

    const decrypted = await runPiiBackfill(client, vault, { apply: true, direction: "decrypt" });
    assert.ok(decrypted.tables.every((t) => t.failed === 0 && t.conflicts === 0), `decrypt must succeed: ${JSON.stringify(decrypted.tables)}`);
    const restored = await db.$queryRawUnsafe<Row[]>(`SELECT * FROM "Prospect" WHERE id = ANY($1) ORDER BY id`, ids);
    restored.forEach((row, index) => {
      const contact = contacts[index]!;
      assert.equal(row.emailNormalized, contact.email, "e-mail must be restored in clear");
      assert.equal(row.phoneNormalized, contact.phone);
      assert.equal(row.piiKeyId, null);
      assert.equal(row.emailFingerprint, legacyPiiFingerprint(contact.email), "legacy fingerprint must be restored");
    });
    const restoredQuotes = await db.$queryRawUnsafe<Row[]>(`SELECT payload, "piiKeyId" FROM "QuoteRequest" WHERE "prospectId" = $1`, ids[0]);
    assert.equal(restoredQuotes[0]?.piiKeyId, null);
    assert.equal((restoredQuotes[0]?.payload as { contact?: { email?: string } }).contact?.email, contacts[0]!.email, "quote payload must be restored");
  } finally {
    await db.$executeRawUnsafe(`DELETE FROM "QuoteRequest" WHERE "prospectId" = ANY($1)`, ids);
    await db.$executeRawUnsafe(`DELETE FROM "Prospect" WHERE id = ANY($1)`, ids);
  }
}
