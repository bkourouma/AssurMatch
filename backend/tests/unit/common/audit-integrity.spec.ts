import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeAuditIntegrityKeyId, parseAuditIntegrityKeys, signAuditEntry, verifyAuditEntry, type AuditIntegritySubject } from "../../../src/modules/common/security/audit-integrity";

const secretA = Buffer.alloc(32, 1).toString("base64");
const secretB = Buffer.alloc(32, 2).toString("base64");
const keyring = parseAuditIntegrityKeys(`k1:${secretA},k2:${secretB}`);

const entry: AuditIntegritySubject = {
  id: "0b0c3a52-1a54-4b8e-9d51-1d0a5f0f0001",
  actorId: "actor-1",
  action: "user.role_changed",
  targetType: "User",
  targetId: "user-9",
  scope: { b: 2, a: 1 },
  result: "success",
  reason: "audit",
  context: { roles: ["broker"], nested: { z: 1, y: 2 } },
  correlationId: "corr-1",
  occurredAt: new Date("2026-10-21T10:00:00.123Z"),
  retentionUntil: new Date("2036-10-21T10:00:00.000Z")
};

describe("audit integrity (spec 075 FR-B3)", () => {
  it("signs with the active key and verifies, whatever the key order of the stored JSON", () => {
    const fields = signAuditEntry(entry, keyring, "k2");
    expect(fields.integrityKeyId).toBe("k2");
    expect(fields.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    const reread = { ...entry, scope: { a: 1, b: 2 }, context: { nested: { y: 2, z: 1 }, roles: ["broker"] }, occurredAt: new Date(entry.occurredAt).toISOString() };
    expect(verifyAuditEntry(reread, fields, keyring)).toBe("ok");
    expect(signAuditEntry(entry, keyring, "k2")).toEqual(fields);
  });

  it.each([
    ["context", { context: { roles: ["super_admin"] } }],
    ["action", { action: "user.created" }],
    ["occurredAt", { occurredAt: new Date("2026-10-21T10:00:00.124Z") }],
    ["actorId", { actorId: "actor-2" }]
  ])("detects an altered %s", (_label, change) => {
    const fields = signAuditEntry(entry, keyring, "k1");
    expect(verifyAuditEntry({ ...entry, ...change }, fields, keyring)).toBe("invalid");
  });

  it("keeps old rows verifiable after a rotation and flags an unknown key", () => {
    const old = signAuditEntry(entry, keyring, "k1");
    expect(verifyAuditEntry(entry, old, keyring)).toBe("ok");
    expect(verifyAuditEntry(entry, old, parseAuditIntegrityKeys(`k2:${secretB}`))).toBe("invalid");
  });

  it("stores no signature without a configured key and never invents a default", () => {
    const empty = parseAuditIntegrityKeys("");
    expect(signAuditEntry(entry, empty)).toEqual({ integrityHash: null, integrityKeyId: null });
    expect(verifyAuditEntry(entry, { integrityHash: null, integrityKeyId: null }, keyring)).toBe("missing");
    expect(activeAuditIntegrityKeyId(empty, undefined)).toBeUndefined();
    expect(activeAuditIntegrityKeyId(keyring, undefined)).toBeUndefined();
    expect(activeAuditIntegrityKeyId(keyring, "k1")).toBe("k1");
    expect(activeAuditIntegrityKeyId(parseAuditIntegrityKeys(`only:${secretA}`), undefined)).toBe("only");
    expect(activeAuditIntegrityKeyId(keyring, "unknown")).toBeUndefined();
  });

  it("migration 0037 makes AuditLog append-only behind the maintenance gate", () => {
    const sql = readFileSync(join(process.cwd(), "backend/prisma/migrations/0037_security_hardening/migration.sql"), "utf8");
    expect(sql).toContain("assurmatch.audit_maintenance");
    expect(sql).toMatch(/CREATE TRIGGER "AuditLog_append_only_row" BEFORE UPDATE OR DELETE ON "AuditLog"/);
    expect(sql).toMatch(/CREATE TRIGGER "AuditLog_append_only_truncate" BEFORE TRUNCATE ON "AuditLog"/);
    expect(sql).toContain('"integrityHash"');
    expect(sql).toContain('"integrityKeyId"');
  });
});
