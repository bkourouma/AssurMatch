import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminUserRolesController } from "../../../src/modules/users/admin-user-roles.controller";
import { AdminUsersController } from "../../../src/modules/users/admin-users.controller";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

const countryA = "00000000-0000-4000-8000-0000000000a1";
const countryB = "00000000-0000-4000-8000-0000000000b1";
const adminPaysActor: ActorContext = { actorId: "admin-pays", roles: ["admin_pays"], countryScopes: [countryA], mfaVerified: true };
const brokerActor: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000c1", mfaVerified: true };

function createInput(email = "created-user@example.com", countryIds = [countryA]) {
  return {
    email,
    displayName: "Created User",
    roles: ["support_admin" as const],
    scopes: { countryIds, productIds: [] },
    reason: "Admin onboarding request"
  };
}

describe("admin users runtime controller", () => {
  it("creates users, returns one-time activation token and lists without password material", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);

    const response = await controller.create(superAdminActor, createInput());
    const listed = await controller.list(superAdminActor);

    expect(response.user.status).toBe("invited");
    expect(response.user.mfaStatus).toBe("required");
    expect(response.token).toBeTruthy();
    expect(response.expiresAt).toBeInstanceOf(Date);
    expect((await users.require(response.user.id)).passwordResetTokenHash).toBeTruthy();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("passwordHash");
    expect(audit.search({ action: AuthAuditActions.userCreated, targetId: response.user.id })).toHaveLength(1);
  });

  it("audits duplicate create and scoped RBAC refusals", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);

    await controller.create(superAdminActor, createInput("duplicate@example.com"));
    await expect(controller.create(superAdminActor, createInput("duplicate@example.com"))).rejects.toThrow(/already exists/);
    await expect(controller.create(adminPaysActor, createInput("out-of-scope@example.com", [countryB]))).rejects.toThrow(/RBAC denied/);
    await expect(controller.create(brokerActor, createInput("broker-denied@example.com"))).rejects.toThrow(/RBAC denied/);

    expect(audit.search({ action: AuthAuditActions.userCreated, result: "refused" })).toHaveLength(3);
  });

  it("updates user profile and role changes with audit", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);
    const roles = new AdminUserRolesController(users, audit);
    const created = await controller.create(superAdminActor, createInput("role-change@example.com"));

    const updated = await controller.update(superAdminActor, created.user.id, {
      displayName: "Renamed User",
      scopes: { countryIds: [countryA], productIds: [] },
      reason: "Correct user profile"
    });
    const roleChanged = await roles.updateRoles(superAdminActor, created.user.id, ["compliance_admin"], "Promote for compliance duty");

    expect(updated.displayName).toBe("Renamed User");
    expect(roleChanged.roles).toEqual(["compliance_admin"]);
    expect(audit.search({ action: AuthAuditActions.userUpdated, targetId: created.user.id })).toHaveLength(1);
    expect(audit.search({ action: AuthAuditActions.userRoleChanged, targetId: created.user.id })).toHaveLength(1);
  });
});
