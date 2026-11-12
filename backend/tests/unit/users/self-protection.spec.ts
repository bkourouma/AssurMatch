import { describe, expect, it } from "vitest";
import { actorOf, fixture } from "./admin-users-fixture";

async function expectCode(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  const error = await promise.then(() => undefined, (caught: unknown) => caught as { getStatus?: () => number; getResponse?: () => { code?: string } });
  expect(error, "expected a rejection").toBeDefined();
  expect(error?.getStatus?.()).toBe(status);
  expect(error?.getResponse?.().code).toBe(code);
}

describe("self protection and last super admin", () => {
  it("SEC-SELF-1a/b/c/d a super_admin cannot suspend, lock, delete or demote itself (409 SELF_ACTION_FORBIDDEN)", async () => {
    const { controller, rolesController, seed, users } = fixture();
    const me = await seed(["super_admin"], { status: "active" });
    await seed(["super_admin"], { status: "active" });
    const actor = actorOf(me.id, ["super_admin"]);
    await expectCode(controller.suspend(actor, me.id, { reason: "suspension reason" }), 409, "SELF_ACTION_FORBIDDEN");
    await expectCode(controller.lock(actor, me.id, { reason: "lock reason ok" }), 409, "SELF_ACTION_FORBIDDEN");
    await expectCode(controller.delete(actor, me.id, { reason: "delete reason ok" }), 409, "SELF_ACTION_FORBIDDEN");
    await expectCode(rolesController.updateRoles(actor, me.id, ["support_admin"], "self demotion ok"), 409, "SELF_ACTION_FORBIDDEN");
    await expectCode(rolesController.updateRoles(actor, me.id, ["super_admin", "support_admin"], "self change ok"), 409, "SELF_ACTION_FORBIDDEN");
    const after = await users.require(me.id);
    expect(after.status).toBe("active");
    expect(after.roles).toEqual(["super_admin"]);
  });

  it("audits the refusals", async () => {
    const { controller, audit, seed } = fixture();
    const me = await seed(["super_admin"], { status: "active" });
    await controller.suspend(actorOf(me.id, ["super_admin"]), me.id, { reason: "suspension reason" }).catch(() => undefined);
    expect(audit.all().some((entry) => entry.action === "user.suspended" && entry.result === "refused" && entry.targetId === me.id)).toBe(true);
  });

  it("SEC-LAST-1 refuses any action that leaves no active super_admin, even when the actor is another account", async () => {
    const { controller, rolesController, seed, users } = fixture();
    const only = await seed(["super_admin"], { status: "active" });
    await seed(["super_admin"], { status: "suspended" });
    const other = actorOf("someone-else", ["super_admin"]);
    await expectCode(controller.suspend(other, only.id, { reason: "suspension reason" }), 409, "LAST_SUPER_ADMIN");
    await expectCode(controller.lock(other, only.id, { reason: "lock reason ok" }), 409, "LAST_SUPER_ADMIN");
    await expectCode(controller.delete(other, only.id, { reason: "delete reason ok" }), 409, "LAST_SUPER_ADMIN");
    await expectCode(rolesController.updateRoles(other, only.id, ["support_admin"], "demotion reason"), 409, "LAST_SUPER_ADMIN");
    expect((await users.require(only.id)).status).toBe("active");
  });

  it("allows the same actions once another active super_admin exists", async () => {
    const { controller, seed } = fixture();
    const first = await seed(["super_admin"], { status: "active" });
    await seed(["super_admin"], { status: "active" });
    await expect(controller.suspend(actorOf("someone-else", ["super_admin"]), first.id, { reason: "suspension reason" })).resolves.toMatchObject({ status: "suspended" });
  });
});
