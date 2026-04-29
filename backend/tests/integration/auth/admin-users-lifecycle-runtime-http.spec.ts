import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminUsersController } from "../../../src/modules/users/admin-users.controller";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

const complianceActor: ActorContext = { roles: ["compliance_admin"], mfaVerified: true };
const supportActor: ActorContext = { roles: ["support_admin"], mfaVerified: true };

describe("admin users lifecycle", () => {
  it("suspends, unsuspends, locks, unlocks, resets MFA and audits each action", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);
    const user = await users.create({ email: "lifecycle@example.com", displayName: "Lifecycle User", roles: ["support_admin"] }, superAdminActor);
    await users.update({
      ...await users.require(user.id),
      mfaStatus: "verified",
      mfaSecretEncrypted: "encrypted-secret",
      mfaSecretIssuedAt: new Date(),
      mfaBackupCodesHashes: ["hash"]
    });

    expect((await controller.suspend(complianceActor, user.id, { reason: "Compliance requested suspension" })).status).toBe("suspended");
    expect((await controller.unsuspend(complianceActor, user.id, { reason: "Compliance approved reinstatement" })).status).toBe("active");
    expect((await controller.lock(complianceActor, user.id, { reason: "Manual security lock" })).status).toBe("locked");
    await users.incrementFailedLogin(user.id);
    const unlocked = await controller.unlock(complianceActor, user.id, { reason: "Manual security unlock" });
    expect(unlocked.status).toBe("active");
    expect(unlocked.failedLoginCount).toBe(0);
    const mfaReset = await controller.resetMfa(complianceActor, user.id, { reason: "Lost authenticator reset" });

    expect(mfaReset.mfaStatus).toBe("required");
    expect(mfaReset.mfaSecretEncrypted).toBeUndefined();
    expect(mfaReset.mfaBackupCodesHashes).toEqual([]);
    expect(audit.search({ action: AuthAuditActions.userSuspended, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userUnsuspended, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userLocked, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userUnlocked, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userMfaReset, targetId: user.id })).toHaveLength(1);
  });

  it("enforces role restrictions and reason validation", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);
    const user = await users.create({ email: "restricted-lifecycle@example.com", displayName: "Restricted Lifecycle", roles: ["support_admin"] }, superAdminActor);

    await expect(controller.suspend(supportActor, user.id, { reason: "Support should be denied" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.lock(complianceActor, user.id, { reason: "short" })).rejects.toThrow(/reason/i);
    await expect(controller.delete(complianceActor, user.id, { reason: "Compliance cannot delete users" })).rejects.toThrow(/RBAC denied/);
  });

  it("soft deletes users with tombstone emails and audit", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);
    const user = await users.create({ email: "delete-me@example.com", displayName: "Delete Me", roles: ["support_admin"] }, superAdminActor);

    const deleted = await controller.delete(superAdminActor, user.id, { reason: "Requested account removal" });

    expect(deleted.status).toBe("deleted");
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.email).toBe(`${user.id}@deleted.assurmatch.local`);
    expect(await users.findByEmail("delete-me@example.com")).toBeUndefined();
    expect(audit.search({ action: AuthAuditActions.userDeleted, targetId: user.id })).toHaveLength(1);
  });
});
