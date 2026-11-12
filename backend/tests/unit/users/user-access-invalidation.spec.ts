import { describe, expect, it } from "vitest";
import { UserAccessStatusService } from "../../../src/modules/auth/user-access-status.service";
import { signActorToken } from "../../../src/modules/auth/http-auth-token.service";
import { AuthRequiredHttpGuard } from "../../../src/modules/auth/guards/http-auth.guard";
import { actorOf, fixture } from "./admin-users-fixture";

function contextFor(headers: Record<string, string>) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as never;
}

describe("user access cache invalidation", () => {
  it("sees a suspension, role change, lock and deletion immediately despite the TTL", async () => {
    const { users, seed } = fixture();
    const access = new UserAccessStatusService(users, 3_600_000);
    const user = await seed(["support_admin"], { status: "active" });
    expect((await access.snapshot(user.id))?.status).toBe("active");
    await users.suspend(user.id);
    expect((await access.snapshot(user.id))?.status).toBe("suspended");
    await users.unsuspend(user.id);
    expect((await access.snapshot(user.id))?.status).toBe("active");
    await users.updateRoles(user.id, ["content_admin"], "role change reason", actorOf("a", ["super_admin"]));
    expect((await access.snapshot(user.id))?.roles).toEqual(["content_admin"]);
    await users.lock(user.id, "lock reason ok");
    expect((await access.snapshot(user.id))?.status).toBe("locked");
    await users.unlock(user.id);
    await users.softDelete(user.id);
    expect((await access.snapshot(user.id))?.status).toBe("deleted");
  });

  it("invalidates on activation and password reset consumption", async () => {
    const { users, seed } = fixture();
    const access = new UserAccessStatusService(users, 3_600_000);
    const user = await seed(["support_admin"], { status: "invited" });
    expect((await access.snapshot(user.id))?.status).toBe("invited");
    await users.activateWithPassword(user.id, "hash:new");
    expect((await access.snapshot(user.id))?.status).toBe("active");
    await users.lock(user.id, "failed-login-threshold");
    expect((await access.snapshot(user.id))?.status).toBe("locked");
    await users.consumePasswordReset(user.id, "hash:newer");
    expect((await access.snapshot(user.id))?.status).toBe("active");
  });

  it("the guard answers 401 AUTH_REQUIRED to a suspended or re-roled administrator, not to an unknown id", async () => {
    const { users, seed } = fixture();
    const access = new UserAccessStatusService(users, 3_600_000);
    const guard = new AuthRequiredHttpGuard({ userAccessStatus: access });
    const user = await seed(["support_admin"], { status: "active" });
    const headers = { authorization: `Bearer ${signActorToken(actorOf(user.id, ["support_admin"]))}` };
    await expect(guard.canActivate(contextFor(headers))).resolves.toBe(true);
    await users.updateRoles(user.id, ["content_admin"], "role change reason", actorOf("a", ["super_admin"]));
    await expect(guard.canActivate(contextFor(headers))).rejects.toMatchObject({ status: 401 });
    await users.updateRoles(user.id, ["support_admin"], "role change reason", actorOf("a", ["super_admin"]));
    await expect(guard.canActivate(contextFor(headers))).resolves.toBe(true);
    await users.suspend(user.id);
    await expect(guard.canActivate(contextFor(headers))).rejects.toMatchObject({ status: 401 });
    const unknown = { authorization: `Bearer ${signActorToken(actorOf("00000000-0000-4000-8000-00000000ffff", ["support_admin"]))}` };
    await expect(guard.canActivate(contextFor(unknown))).resolves.toBe(true);
  });

  it("activateWithPassword only works on an invited account (INVALID_TOKEN)", async () => {
    const { users, seed } = fixture();
    const locked = await seed(["support_admin"], { status: "locked" });
    const suspended = await seed(["support_admin"], { status: "suspended" });
    const active = await seed(["support_admin"], { status: "active" });
    for (const user of [locked, suspended, active]) {
      const error = await users.activateWithPassword(user.id, "hash:x").then(() => undefined, (caught: unknown) => caught as { getStatus(): number; getResponse(): { code: string } });
      expect(error?.getStatus()).toBe(403);
      expect(error?.getResponse().code).toBe("INVALID_TOKEN");
    }
    expect((await users.require(locked.id)).status).toBe("locked");
  });

  it("consumePasswordReset does not reactivate a suspended account and clears the token", async () => {
    const { users, seed } = fixture();
    const user = await seed(["support_admin"], { status: "suspended" });
    await users.setPasswordResetToken(user.id, "tok", new Date(Date.now() + 60_000));
    await users.consumePasswordReset(user.id, "hash:new");
    const after = await users.require(user.id);
    expect(after.status).toBe("suspended");
    expect(after.passwordResetTokenHash).toBeUndefined();
    expect(after.passwordResetTokenExpiresAt).toBeUndefined();
  });
});
