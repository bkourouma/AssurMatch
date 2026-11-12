import { describe, expect, it } from "vitest";
import { AssurMatchRoles } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { canChangeRoles, canCreateWithRoles } from "../../../../packages/shared/rbac/role-assignment-policy";
import { actorOf, CI, fixture, SN } from "./admin-users-fixture";

describe("role assignment policy", () => {
  it("lets only super_admin touch super_admin and refuses equal or higher roles", () => {
    expect(canChangeRoles(["super_admin"], ["support_admin"], ["support_admin", "super_admin"], AssurMatchRoles)).toBe(true);
    expect(canChangeRoles(["compliance_admin"], ["support_admin"], ["support_admin", "super_admin"], AssurMatchRoles)).toBe(false);
    expect(canChangeRoles(["compliance_admin"], ["support_admin"], ["support_admin", "compliance_admin"], AssurMatchRoles)).toBe(false);
    expect(canChangeRoles(["admin_pays"], ["support_admin"], ["support_admin", "admin_pays"], AssurMatchRoles)).toBe(false);
    expect(canChangeRoles(["admin_pays"], ["support_admin"], ["support_admin", "finance_admin"], AssurMatchRoles)).toBe(false);
    expect(canChangeRoles(["admin_pays"], ["support_admin"], ["support_admin", "broker_agent"], AssurMatchRoles)).toBe(true);
    expect(canChangeRoles(["support_admin"], ["content_admin"], ["broker_agent"], AssurMatchRoles)).toBe(false);
    // Removing a role the actor could not have granted is refused too; unchanged roles do not count.
    expect(canChangeRoles(["compliance_admin"], ["support_admin", "finance_admin"], ["support_admin"], AssurMatchRoles)).toBe(false);
    expect(canChangeRoles(["compliance_admin"], ["support_admin", "finance_admin"], ["support_admin", "finance_admin", "broker_agent"], AssurMatchRoles)).toBe(true);
    // A target already carrying super_admin is only editable by a super_admin.
    expect(canChangeRoles(["compliance_admin"], ["super_admin"], ["super_admin", "support_admin"], AssurMatchRoles)).toBe(false);
  });

  it("applies the same whitelist at creation", () => {
    expect(canCreateWithRoles(["admin_pays"], ["content_admin"], AssurMatchRoles)).toBe(true);
    expect(canCreateWithRoles(["admin_pays"], ["compliance_admin"], AssurMatchRoles)).toBe(false);
    expect(canCreateWithRoles(["admin_pays"], ["super_admin"], AssurMatchRoles)).toBe(false);
    expect(canCreateWithRoles(["super_admin"], ["finance_admin"], AssurMatchRoles)).toBe(true);
  });
});

describe("role escalation through the controllers", () => {
  it("SEC-ESC-1a/d admin_pays cannot grant super_admin, to a target or to itself (403)", async () => {
    const { rolesController, seed, users } = fixture();
    const target = await seed(["support_admin"], { countryIds: [CI] });
    const ap = await seed(["admin_pays"], { countryIds: [CI], status: "active" });
    const apActor = actorOf(ap.id, ["admin_pays"], { countryScopes: [CI] });
    await expect(rolesController.updateRoles(apActor, target.id, ["support_admin", "super_admin"], "escalation attempt")).rejects.toThrow(/RBAC denied/);
    await expect(rolesController.updateRoles(apActor, ap.id, ["admin_pays", "super_admin"], "escalation attempt")).rejects.toThrow(/RBAC denied/);
    expect((await users.require(target.id)).roles).toEqual(["support_admin"]);
    expect((await users.require(ap.id)).roles).toEqual(["admin_pays"]);
  });

  it("SEC-ESC-1b/c compliance_admin cannot grant super_admin or compliance_admin; admin_pays cannot grant compliance_admin", async () => {
    const { rolesController, seed } = fixture();
    const target = await seed(["support_admin"], { countryIds: [CI] });
    const ca = actorOf("ca", ["compliance_admin"]);
    await expect(rolesController.updateRoles(ca, target.id, ["support_admin", "super_admin"], "escalation attempt")).rejects.toThrow(/RBAC denied/);
    await expect(rolesController.updateRoles(ca, target.id, ["support_admin", "compliance_admin"], "escalation attempt")).rejects.toThrow(/RBAC denied/);
    const ap = actorOf("ap", ["admin_pays"], { countryScopes: [CI] });
    await expect(rolesController.updateRoles(ap, target.id, ["support_admin", "compliance_admin"], "escalation attempt")).rejects.toThrow(/RBAC denied/);
  });

  it("allows the whitelisted grants, admin_pays inside its countries only", async () => {
    const { rolesController, seed } = fixture();
    const inScope = await seed(["support_admin"], { countryIds: [CI] });
    const outScope = await seed(["support_admin"], { countryIds: [SN] });
    const ap = actorOf("ap", ["admin_pays"], { countryScopes: [CI] });
    const view = await rolesController.updateRoles(ap, inScope.id, ["support_admin", "broker_agent"], "legit grant ok");
    expect(view.roles).toEqual(["support_admin", "broker_agent"]);
    await expect(rolesController.updateRoles(ap, outScope.id, ["support_admin", "broker_agent"], "out of scope")).rejects.toThrow(/RBAC denied/);
    const ca = actorOf("ca", ["compliance_admin"]);
    await expect(rolesController.updateRoles(ca, outScope.id, ["support_admin", "content_admin"], "legit grant ok")).resolves.toBeDefined();
  });

  it("refuses to touch the roles of a super_admin unless super_admin", async () => {
    const { rolesController, seed } = fixture();
    const sa = await seed(["super_admin"], { status: "active" });
    await seed(["super_admin"], { status: "active" });
    const ca = actorOf("ca", ["compliance_admin"]);
    await expect(rolesController.updateRoles(ca, sa.id, ["super_admin", "support_admin"], "tamper attempt")).rejects.toThrow(/RBAC denied/);
    await expect(rolesController.updateRoles(ca, sa.id, ["support_admin"], "tamper attempt")).rejects.toThrow(/RBAC denied/);
  });

  it("SEC-ESC-1e admin_pays cannot create a compliance_admin or a super_admin", async () => {
    const { controller } = fixture();
    const ap = actorOf("ap", ["admin_pays"], { countryScopes: [CI] });
    const base = { displayName: "New Person", scopes: { countryIds: [CI], productIds: [] }, reason: "onboarding person" };
    await expect(controller.create(ap, { ...base, email: "c1@example.com", roles: ["compliance_admin"] } as never)).rejects.toThrow(/RBAC denied/);
    await expect(controller.create(ap, { ...base, email: "c2@example.com", roles: ["super_admin"] } as never)).rejects.toThrow(/RBAC denied/);
    await expect(controller.create(ap, { ...base, email: "c3@example.com", roles: ["content_admin"] } as never)).resolves.toBeDefined();
  });

  it("a compliance_admin cannot suspend, lock, unlock, reset MFA of or update a super_admin", async () => {
    const { controller, seed } = fixture();
    const sa = await seed(["super_admin"], { status: "active" });
    await seed(["super_admin"], { status: "active" });
    const ca = actorOf("ca", ["compliance_admin"]);
    await expect(controller.suspend(ca, sa.id, { reason: "suspension reason" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.lock(ca, sa.id, { reason: "lock reason ok" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.unlock(ca, sa.id, { reason: "unlock reason" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.unsuspend(ca, sa.id, { reason: "unsuspend reason" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.resetMfa(ca, sa.id, { reason: "mfa reset reason" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.issuePasswordReset(ca, sa.id, { reason: "reset reason ok" })).rejects.toThrow(/RBAC denied/);
    await expect(controller.update(ca, sa.id, { displayName: "Hijack", reason: "profile hijack" })).rejects.toThrow(/RBAC denied/);
  });
});
