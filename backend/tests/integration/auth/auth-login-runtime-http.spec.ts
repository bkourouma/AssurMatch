import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { verifyActorToken } from "../../../src/modules/auth/http-auth-token.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

async function activeAuthUser() {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const user = await users.create({ email: "login@example.com", displayName: "Login User", roles: ["support_admin"] }, superAdminActor);
  await users.setPassword(user.id, await auth.passwordHashing.hash("valid password 123"));
  return { audit, users, auth, user };
}

describe("auth login flow", () => {
  it("logs in with a valid password and audits success", async () => {
    const { audit, auth, user } = await activeAuthUser();
    const session = await auth.service.login({ email: user.email, password: "valid password 123" });
    expect(session.accessToken).toContain(".");
    expect(session.mfaRequired).toBe(true);
    expect(audit.search({ action: AuthAuditActions.userLoginSucceeded, targetId: user.id })).toHaveLength(1);
  }, 20_000);

  it("refuses invalid password and increments failed-login count", async () => {
    const { audit, auth, users, user } = await activeAuthUser();
    await expect(auth.service.login({ email: user.email, password: "wrong password 123" })).rejects.toThrow(/Invalid credentials/);
    expect((await users.require(user.id)).failedLoginCount).toBe(1);
    expect(audit.search({ action: AuthAuditActions.userLoginFailed, targetId: user.id })).toHaveLength(1);
  }, 20_000);

  it("signs login tokens with persisted tenant, plan and scope claims", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);
    const broker = await users.create({
      email: "broker-claims@example.com",
      displayName: "Broker Claims",
      roles: ["broker_owner_pro"],
      partnerTenantId: "00000000-0000-4000-8000-0000000000b1",
      scopes: {
        countryIds: ["00000000-0000-4000-8000-0000000000c1"],
        productIds: ["00000000-0000-4000-8000-0000000000d1"]
      }
    }, superAdminActor);
    await users.update({ ...broker, partnerPlan: "pro", mfaStatus: "verified" });
    await users.setPassword(broker.id, await auth.passwordHashing.hash("valid password 123"));

    const session = await auth.service.login({ email: broker.email, password: "valid password 123" });
    const claims = verifyActorToken(session.accessToken);

    expect(session.mfaRequired).toBe(false);
    expect(claims).toMatchObject({
      actorId: broker.id,
      roles: ["broker_owner_pro"],
      mfaVerified: true,
      partnerTenantId: "00000000-0000-4000-8000-0000000000b1",
      partnerPlan: "pro",
      countryScopes: ["00000000-0000-4000-8000-0000000000c1"],
      productScopes: ["00000000-0000-4000-8000-0000000000d1"]
    });
  }, 20_000);
});
