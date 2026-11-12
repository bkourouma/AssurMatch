import { describe, expect, it } from "vitest";
import { PrismaUsersRepository, type UserAccount } from "../../../src/modules/users/users.repository";

const now = new Date("2026-11-01T00:00:00Z");

function user(): UserAccount {
  return {
    id: "u1", email: "U1@Example.com", displayName: "U One", roles: ["support_admin"], status: "active", mfaStatus: "enrolled",
    countryScopes: [], productScopes: [], passwordChangeRequired: false, failedLoginCount: 0, mfaBackupCodesHashes: [], createdAt: now, updatedAt: now
  };
}

function build() {
  const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
  const row = { ...user(), userRoles: [{ role: { key: "support_admin" } }] };
  const delegate = {
    findMany: async () => [row],
    findUnique: async () => row,
    findFirst: async () => row,
    create: async (input: Record<string, unknown>) => { calls.push({ op: "create", input }); return row; },
    update: async (input: Record<string, unknown>) => { calls.push({ op: "update", input }); return row; },
    updateMany: async (input: Record<string, unknown>) => { calls.push({ op: "updateMany", input }); return { count: 1 }; }
  };
  const prisma = {
    requireRuntimeClient: () => ({
      user: delegate,
      role: { upsert: async () => ({ id: "r1", key: "support_admin" }) },
      userRole: { create: async () => ({}), deleteMany: async () => ({}) }
    })
  };
  return { repository: new PrismaUsersRepository(prisma as never), calls };
}

describe("PrismaUsersRepository clears erased fields with null", () => {
  it("update() sends null for every field deleted in the domain", async () => {
    const { repository, calls } = build();
    await repository.update(user());
    const data = (calls.find((call) => call.op === "update")?.input.data ?? {}) as Record<string, unknown>;
    for (const key of ["passwordResetTokenHash", "passwordResetTokenExpiresAt", "lockedAt", "lockedReason", "lastFailedLoginAt", "mfaSecretEncrypted", "mfaSecretIssuedAt", "phone", "deletedAt", "passwordHash"]) {
      expect(key in data, key).toBe(true);
      expect(data[key], key).toBeNull();
    }
  });

  it("update() never writes the TOTP counter (only claim/clear do)", async () => {
    const { repository, calls } = build();
    await repository.update({ ...user(), mfaLastTotpCounter: 5 });
    const data = (calls.find((call) => call.op === "update")?.input.data ?? {}) as Record<string, unknown>;
    expect("mfaLastTotpCounter" in data).toBe(false);
    await repository.clearTotpCounter("u1");
    expect(calls.find((call) => call.op === "updateMany")?.input).toEqual({ where: { id: "u1" }, data: { mfaLastTotpCounter: null } });
  });

  it("create() sends null as well, and keeps real values", async () => {
    const { repository, calls } = build();
    await repository.create({ ...user(), lockedReason: "why", mfaLastTotpCounter: 42 });
    const data = (calls.find((call) => call.op === "create")?.input.data ?? {}) as Record<string, unknown>;
    expect(data.lockedAt).toBeNull();
    expect(data.lockedReason).toBe("why");
    expect(data.mfaLastTotpCounter).toBe(42);
  });
});
