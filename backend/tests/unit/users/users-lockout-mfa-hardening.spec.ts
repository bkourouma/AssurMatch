import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { PasswordHashingService } from "../../../src/modules/auth/password-hashing.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository, PrismaUsersRepository } from "../../../src/modules/users/users.repository";
import { actorOf } from "./admin-users-fixture";

const admin = actorOf("a", ["super_admin"]);

function setup() {
  const audit = new AuditLogWriter();
  const repository = new MemoryUsersRepository();
  const users = new UsersService(audit, repository);
  const auth = new AuthModule(users, audit);
  return { audit, repository, users, auth };
}

describe("invited account is never counted nor locked (point 2)", () => {
  it("login failures on an invited account keep the neutral 401 and leave it invited", async () => {
    const { users, auth, audit } = setup();
    const created = await users.create({ email: "inv@example.com", displayName: "Inv", roles: ["support_admin"] }, admin);
    for (let i = 0; i < 8; i += 1) {
      await expect(auth.service.login({ email: "inv@example.com", password: "Whatever-Pass-123!" })).rejects.toMatchObject({ response: { code: "INVALID_CREDENTIALS" } });
    }
    const after = await users.require(created.id);
    expect(after.status).toBe("invited");
    expect(after.failedLoginCount).toBe(0);
    expect(audit.search({ action: AuthAuditActions.userLockedAfterFailedLogins, targetId: created.id })).toHaveLength(0);
  }, 30_000);

  it("incrementFailedLogin is a no-op without password or when invited", async () => {
    const { users } = setup();
    const created = await users.create({ email: "inv2@example.com", displayName: "Inv", roles: ["support_admin"] }, admin);
    expect((await users.incrementFailedLogin(created.id)).failedLoginCount).toBe(0);
    const record = await users.require(created.id);
    record.status = "active";
    await users.update(record);
    expect((await users.incrementFailedLogin(created.id)).failedLoginCount).toBe(0);
    record.passwordHash = await new PasswordHashingService().hash("Some-Password-123!");
    await users.update(record);
    expect((await users.incrementFailedLogin(created.id)).failedLoginCount).toBe(1);
  }, 30_000);

  it("unlock restores invited without password, active with one", async () => {
    const { users } = setup();
    const a = await users.create({ email: "u1@example.com", displayName: "A", roles: ["support_admin"] }, admin);
    const record = await users.require(a.id);
    record.status = "locked";
    await users.update(record);
    expect((await users.unlock(a.id)).status).toBe("invited");
    const withPassword = await users.require(a.id);
    withPassword.passwordHash = "hash";
    withPassword.status = "locked";
    await users.update(withPassword);
    expect((await users.unlock(a.id)).status).toBe("active");
  });
});

describe("TOTP counter ownership (point 4a)", () => {
  it("a stale generic write does not roll the counter back in the memory repository", async () => {
    const { users } = setup();
    const created = await users.create({ email: "c@example.com", displayName: "C", roles: ["support_admin"] }, admin);
    const stale = await users.require(created.id);
    await users.claimTotpCounter(created.id, 100);
    await users.update(stale);
    expect((await users.require(created.id)).mfaLastTotpCounter).toBe(100);
    expect(await users.claimTotpCounter(created.id, 100)).toBe(false);
  });
});

describe("backup code consumption is atomic (point 4b)", () => {
  it("exactly one of two simultaneous consumptions succeeds (memory repository)", async () => {
    const { users, repository } = setup();
    const created = await users.create({ email: "b@example.com", displayName: "B", roles: ["support_admin"] }, admin);
    const record = await users.require(created.id);
    record.mfaBackupCodesHashes = ["h1", "h2"];
    await users.update(record);
    const results = await Promise.all([repository.consumeBackupCode(created.id, "h1"), repository.consumeBackupCode(created.id, "h1")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await users.require(created.id)).mfaBackupCodesHashes).toEqual(["", "h2"]);
    expect(await repository.consumeBackupCode(created.id, "")).toBe(false);
  });

  it("two simultaneous verifyMfa with the same backup code: one session, one refusal", async () => {
    const { users, auth } = setup();
    const created = await users.create({ email: "b2@example.com", displayName: "B2", roles: ["support_admin"] }, admin);
    const enrollment = await auth.service.enrollMfa(await users.require(created.id));
    const code = enrollment.backupCodes[0] ?? "";
    const snapshot = await users.require(created.id);
    const outcomes = await Promise.allSettled([
      auth.service.verifyMfa(snapshot, "c", code, "backup"),
      auth.service.verifyMfa(snapshot, "c", code, "backup")
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
  }, 60_000);

  it("Prisma: compare-and-swap on the whole array, retries when it lost", async () => {
    const seen: Array<Record<string, unknown>> = [];
    let state = ["h1", "h2"];
    let calls = 0;
    const prisma = { requireRuntimeClient: () => ({ user: {
      findUnique: async () => ({ mfaBackupCodesHashes: [...state] }),
      updateMany: async (input: Record<string, unknown>) => {
        seen.push(input);
        calls += 1;
        if (calls === 1) { state = ["", "h2"]; return { count: 0 }; }
        state = (input.data as { mfaBackupCodesHashes: string[] }).mfaBackupCodesHashes;
        return { count: 1 };
      }
    } }) };
    const repository = new PrismaUsersRepository(prisma as never);
    // The first attempt loses to a concurrent writer that already blanked h1: the retry no longer finds it.
    expect(await repository.consumeBackupCode("u1", "h1")).toBe(false);
    expect(seen[0]).toEqual({ where: { id: "u1", mfaBackupCodesHashes: { equals: ["h1", "h2"] } }, data: { mfaBackupCodesHashes: ["", "h2"] } });
    expect(await repository.consumeBackupCode("u1", "h2")).toBe(true);
  });
});

describe("TOTP replay does not feed the lockout (point 4c)", () => {
  it("repeated replays never lock the account", async () => {
    const { users, auth, audit } = setup();
    const created = await users.create({ email: "r@example.com", displayName: "R", roles: ["support_admin"] }, admin);
    const enrollment = await auth.service.enrollMfa(await users.require(created.id));
    const code = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30 });
    await auth.service.verifyMfa(await users.require(created.id), "c", code, "totp");
    for (let i = 0; i < 8; i += 1) {
      await expect(auth.service.verifyMfa(await users.require(created.id), "c", code, "totp")).rejects.toThrow("Invalid MFA code");
    }
    const after = await users.require(created.id);
    expect(after.failedLoginCount).toBe(0);
    expect(after.status).not.toBe("locked");
    expect(audit.search({ action: AuthAuditActions.userMfaFailed, targetId: created.id })).toHaveLength(8);
  }, 60_000);
});
