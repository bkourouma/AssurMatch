import { describe, expect, it } from "vitest";
import { fixture } from "./admin-users-fixture";

describe("password reset and account locks", () => {
  it.each(["failed-login-threshold", "failed-mfa-threshold"])("lifts the automatic lock %s", async (reason) => {
    const { users, seed } = fixture();
    const user = await seed(["support_admin"], { status: "active" });
    await users.lock(user.id, reason);
    const updated = await users.consumePasswordReset(user.id, "hash:new");
    expect(updated.status).toBe("active");
    expect(updated.lockedReason).toBeUndefined();
    expect(updated.passwordHash).toBe("hash:new");
  });

  it("keeps a lock set by an admin while the password is changed", async () => {
    const { users, seed } = fixture();
    const user = await seed(["support_admin"], { status: "active" });
    await users.lock(user.id, "Suspicion de compromission");
    const updated = await users.consumePasswordReset(user.id, "hash:new");
    expect(updated.status).toBe("locked");
    expect(updated.lockedReason).toBe("Suspicion de compromission");
    expect(updated.passwordHash).toBe("hash:new");
  });

  it("keeps a suspended account suspended", async () => {
    const { users, seed } = fixture();
    const user = await seed(["support_admin"], { status: "active" });
    await users.suspend(user.id);
    expect((await users.consumePasswordReset(user.id, "hash:new")).status).toBe("suspended");
  });
});
