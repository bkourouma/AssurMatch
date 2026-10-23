import { describe, expect, it } from "vitest";
import { exitCodeFor, verifyAuditIntegrity, type AuditRowReader } from "../../../../scripts/ops/verify-audit-integrity";
import { parseAuditIntegrityKeys, signAuditEntry } from "../../../src/modules/common/security/audit-integrity";

const keyring = parseAuditIntegrityKeys(`k1:${Buffer.alloc(32, 7).toString("base64")}`);

function row(id: string, overrides: Record<string, unknown> = {}, sign = true): Record<string, unknown> {
  const base = {
    id,
    actorId: null,
    action: "user.login.succeeded",
    targetType: "User",
    targetId: "u",
    scope: {},
    result: "success",
    reason: null,
    context: { kind: "totp" },
    correlationId: null,
    occurredAt: new Date("2026-10-21T10:00:00.000Z"),
    retentionUntil: new Date("2036-10-21T10:00:00.000Z")
  };
  const fields = sign ? signAuditEntry({ ...base, result: "success" }, keyring, "k1") : { integrityHash: null, integrityKeyId: null };
  return { ...base, ...fields, ...overrides };
}

function fakeClient(rows: Array<Record<string, unknown>>): AuditRowReader & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    auditLog: {
      findMany: async ({ where, take }) => {
        state.calls += 1;
        const after = (where.id as { gt?: string } | undefined)?.gt;
        return rows.filter((r) => after === undefined || String(r.id) > after).slice(0, take);
      }
    }
  };
}

describe("verify-audit-integrity script", () => {
  it("reports ok, missing and invalid rows in batches, ids only", async () => {
    const rows = [row("a1"), row("a2", { context: { kind: "backup" } }), row("a3", {}, false), row("a4")];
    const client = fakeClient(rows);
    const report = await verifyAuditIntegrity({ client, keyring, batchSize: 2 });
    expect(report).toMatchObject({ verified: 4, ok: 2, missingSignature: 1, invalidSignature: 1, invalidIds: ["a2"], missingIds: ["a3"] });
    expect(client.calls).toBeGreaterThan(1);
    expect(JSON.stringify(report)).not.toContain("backup");
    expect(exitCodeFor(report)).toBe(2);
  });

  it("exits 0 when every signed row is valid and honours --limit", async () => {
    const client = fakeClient([row("b1"), row("b2"), row("b3", {}, false)]);
    const report = await verifyAuditIntegrity({ client, keyring, limit: 2 });
    expect(report).toMatchObject({ verified: 2, ok: 2, invalidSignature: 0 });
    expect(exitCodeFor(report)).toBe(0);
  });
});
