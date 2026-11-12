import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { toSafeErrorResponse } from "../../../src/modules/common/filters/error-response.filter";
import { UsersService } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository } from "../../../src/modules/users/users.repository";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const PASSWORD = "valid password 123";
const correlationId = "8a413d58-323c-43b7-86a1-2bfafb54ffab";

async function setup(email = "login-errors@example.com") {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const user = await users.create({ email, displayName: "Login User", roles: ["support_admin"] }, superAdminActor);
  await users.activateWithPassword(user.id, await auth.passwordHashing.hash(PASSWORD));
  return { audit, users, auth, user };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status?: number; getStatus?: () => number };
  }
  throw new Error("expected a rejection");
}

describe("login error responses", () => {
  it("answers 401 INVALID_CREDENTIALS identically for unknown e-mail, wrong password, locked and deleted accounts", async () => {
    const { users, auth, user } = await setup();
    const unknown = await failure(auth.service.login({ email: "ghost@example.com", password: PASSWORD }));
    const wrong = await failure(auth.service.login({ email: user.email, password: "wrong password 123" }));
    await users.lock(user.id, "test");
    const locked = await failure(auth.service.login({ email: user.email, password: PASSWORD }));
    const lockedWrong = await failure(auth.service.login({ email: user.email, password: "wrong password 123" }));
    const bodies = [unknown, wrong, locked, lockedWrong].map((error) => {
      const status = (error as { getStatus(): number }).getStatus();
      return { status, body: toSafeErrorResponse(error, correlationId, status) };
    });
    for (const entry of bodies) {
      expect(entry.status).toBe(401);
      expect(entry.body).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid credentials", correlationId });
    }
  }, 60_000);

  it("a deleted account with the right password gets the neutral answer", async () => {
    const audit = new AuditLogWriter();
    const repository = new MemoryUsersRepository();
    const users = new UsersService(audit, repository);
    const auth = new AuthModule(users, audit);
    const user = await users.create({ email: "deleted-login@example.com", displayName: "Deleted User", roles: ["support_admin"] }, superAdminActor);
    await users.activateWithPassword(user.id, await auth.passwordHashing.hash(PASSWORD));
    await repository.update({ ...(await users.require(user.id)), status: "deleted" });
    const error = await failure(auth.service.login({ email: user.email, password: PASSWORD })) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ code: "INVALID_CREDENTIALS" });
  }, 30_000);

  it("suspended account: 403 ACCOUNT_SUSPENDED only with the right password, neutral 401 otherwise, no counting", async () => {
    const { users, auth, user, audit } = await setup("suspended-login@example.com");
    await users.suspend(user.id);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const wrong = await failure(auth.service.login({ email: user.email, password: "wrong password 123" })) as { getStatus(): number; getResponse(): unknown };
      expect(wrong.getStatus()).toBe(401);
      expect(wrong.getResponse()).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
    }
    const after = await users.require(user.id);
    expect(after.status).toBe("suspended");
    expect(after.failedLoginCount).toBe(0);

    const right = await failure(auth.service.login({ email: user.email, password: PASSWORD })) as { getStatus(): number; getResponse(): unknown };
    expect(right.getStatus()).toBe(403);
    expect(toSafeErrorResponse(right, correlationId, 403)).toMatchObject({ code: "ACCOUNT_SUSPENDED", message: "Account suspended" });
    expect(audit.search({ action: AuthAuditActions.userLoginRefusedSuspended, targetId: user.id })).toHaveLength(1);
  }, 60_000);
});
