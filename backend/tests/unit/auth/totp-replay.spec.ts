import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import type { UserAccount, UsersService } from "../../../src/modules/users/users.module";
import { UsersService as RealUsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

/** In-memory single-use ledger standing in for `UsersService.claimTotpCounter`. */
function fakeUsers(base: UsersService) {
  const last = new Map<string, number>();
  const claim = async (userId: string, counter: number) => {
    if (counter <= (last.get(userId) ?? -1)) return false;
    last.set(userId, counter);
    return true;
  };
  return Object.assign(base, { claimTotpCounter: claim }) as UsersService;
}

describe("TOTP replay", () => {
  it("accepts a code once and refuses the same code afterwards like a wrong code", async () => {
    const audit = new AuditLogWriter();
    const users = fakeUsers(new RealUsersService(audit));
    const auth = new AuthModule(users, audit);
    const created = await users.create({ email: "totp-replay@example.com", displayName: "Totp User", roles: ["support_admin"] }, superAdminActor);
    const enrollment = await auth.service.enrollMfa(await users.require(created.id));
    const code = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30 });

    const first = await auth.service.verifyMfa(await users.require(created.id), "c", code, "totp");
    expect(first.mfaRequired).toBe(false);

    const user: UserAccount = await users.require(created.id);
    await expect(auth.service.verifyMfa(user, "c", code, "totp")).rejects.toThrow("Invalid MFA code");
    const refusals = audit.search({ action: AuthAuditActions.userMfaFailed, targetId: created.id });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe("totp_replay");
    // A legitimate replay (same code on two devices) is refused and audited but never counts toward the lockout.
    expect((await users.require(created.id)).failedLoginCount).toBe(0);
  }, 30_000);

  it("claims the counter only when the code itself is valid", async () => {
    const audit = new AuditLogWriter();
    const base = new RealUsersService(audit);
    const claims: number[] = [];
    const users = Object.assign(base, { claimTotpCounter: async (_id: string, counter: number) => { claims.push(counter); return true; } }) as UsersService;
    const auth = new AuthModule(users, audit);
    const created = await users.create({ email: "totp-wrong@example.com", displayName: "Totp Wrong", roles: ["support_admin"] }, superAdminActor);
    await auth.service.enrollMfa(await users.require(created.id));
    await expect(auth.service.verifyMfa(await users.require(created.id), "c", "000000", "totp")).rejects.toThrow("Invalid MFA code");
    expect(claims).toEqual([]);
  }, 30_000);

  it("with the real users service: a replay fails, the next step still works", async () => {
    const audit = new AuditLogWriter();
    const users = new RealUsersService(audit);
    const auth = new AuthModule(users, audit);
    const created = await users.create({ email: "totp-real@example.com", displayName: "Totp Real", roles: ["support_admin"] }, superAdminActor);
    const enrollment = await auth.service.enrollMfa(await users.require(created.id));
    const now = Math.floor(Date.now() / 1000);
    const at = (epoch: number) => generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30, epoch });
    const current = await at(now);

    await auth.service.verifyMfa(await users.require(created.id), "c", current, "totp");
    await expect(auth.service.verifyMfa(await users.require(created.id), "c", current, "totp")).rejects.toThrow("Invalid MFA code");
    // An older step than the accepted one is refused too; the following step is a fresh code.
    await expect(auth.service.verifyMfa(await users.require(created.id), "c", await at(now - 30), "totp")).rejects.toThrow("Invalid MFA code");
    await expect(auth.service.verifyMfa(await users.require(created.id), "c", await at(now + 30), "totp")).resolves.toMatchObject({ mfaRequired: false });
  }, 30_000);
});
