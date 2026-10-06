import { describe, expect, it } from "vitest";
import { RolePermissions, roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

describe("comparator admin RBAC", () => {
  it("grants scoped spec 002 permissions to admin roles and broker lead access to brokers", async () => {
    expect(roleHasPermission("super_admin", "offers:create")).toBe(true);
    expect(roleHasPermission("admin_pays", "lead_assignments:read")).toBe(true);
    expect(RolePermissions.compliance_admin).toContain("quote_form_definitions:*");
    expect(RolePermissions.broker_agent).toContain("broker_leads:read");
  });

  it("spec 052 R4: every broker role reads its offers, only owners and managers write them", () => {
    for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager", "broker_agent", "broker_read_only"] as const) {
      expect(roleHasPermission(role, "broker_offers:read"), role).toBe(true);
    }
    for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager"] as const) expect(roleHasPermission(role, "broker_offers:write"), role).toBe(true);
    for (const role of ["broker_agent", "broker_read_only"] as const) expect(roleHasPermission(role, "broker_offers:write"), role).toBe(false);
    // Offer decisions are checked by role (compliance or super admin), not by a wider permission.
    expect(roleHasPermission("compliance_admin", "offers:update")).toBe(false);
    expect(roleHasPermission("admin_pays", "broker_offers:write")).toBe(false);
  });
});
