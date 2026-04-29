import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { PasswordResetService } from "../../../src/modules/auth/password-reset.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("auth activation flow", () => {
  it("activates an invited user with a one-time token and audits the change", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const user = await users.create({ email: "new-admin@example.com", displayName: "New Admin", roles: ["support_admin"] }, superAdminActor);
    const reset = new PasswordResetService();
    const issued = reset.issueToken();
    await users.setPasswordResetToken(user.id, issued.tokenHash, issued.expiresAt);

    const session = await new AuthModule(users, audit).service.activate({ token: issued.token, password: "activation password 123" });

    expect(session.mfaRequired).toBe(true);
    expect((await users.require(user.id)).status).toBe("active");
    expect((await users.require(user.id)).passwordHash).toContain("$argon2id$");
    expect(audit.search({ action: AuthAuditActions.userActivated, targetId: user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userPasswordChanged, targetId: user.id })).toHaveLength(1);
  }, 20_000);
});
