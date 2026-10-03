import { describe, expect, it } from "vitest";
import { AssurMatchRoles, RolePermissions, roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

describe("constitution role matrix", () => {
  it("defines every constitutional role with permissions", async () => {
    expect(AssurMatchRoles).toHaveLength(12);
    for (const role of AssurMatchRoles) {
      expect(RolePermissions[role].length).toBeGreaterThan(0);
    }
  });

  it("lets the Admin Pays create and prepare partners, never approve or decide (spec 051 R13)", () => {
    for (const permission of ["partners:read", "partners:create", "partners:update", "licenses:read", "licenses:create", "documents:read", "documents:create", "partner_applications:review"]) {
      expect(roleHasPermission("admin_pays", permission), permission).toBe(true);
    }
    for (const permission of ["licenses:approve", "licenses:update", "documents:review", "partners:activate", "partner_applications:decide", "users:create"]) {
      expect(roleHasPermission("admin_pays", permission), permission).toBe(false);
    }
    expect(roleHasPermission("compliance_admin", "partner_applications:review")).toBe(true);
    expect(roleHasPermission("support_admin", "partners:read")).toBe(true);
    expect(roleHasPermission("support_admin", "documents:read")).toBe(false);
    expect(roleHasPermission("support_admin", "partners:update")).toBe(false);
  });

  it("spec 053 R7: every broker role reads its account and team, only owners and managers write them", () => {
    for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager", "broker_agent", "broker_read_only"] as const) {
      expect(roleHasPermission(role, "broker_account:read"), role).toBe(true);
      expect(roleHasPermission(role, "broker_team:read"), role).toBe(true);
    }
    for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager"] as const) {
      expect(roleHasPermission(role, "broker_account:write"), role).toBe(true);
      expect(roleHasPermission(role, "broker_team:write"), role).toBe(true);
    }
    for (const role of ["broker_agent", "broker_read_only"] as const) {
      expect(roleHasPermission(role, "broker_account:write"), role).toBe(false);
      expect(roleHasPermission(role, "broker_team:write"), role).toBe(false);
    }
    // Admin roles never act as a broker (the broker routes also require the actor's partner).
    expect(roleHasPermission("admin_pays", "broker_team:write")).toBe(false);
  });
});
