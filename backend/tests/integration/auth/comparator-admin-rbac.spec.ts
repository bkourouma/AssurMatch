import { describe, expect, it } from "vitest";
import { RolePermissions, roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

describe("comparator admin RBAC", () => {
  it("grants scoped spec 002 permissions to admin roles and broker lead access to brokers", async () => {
    expect(roleHasPermission("super_admin", "offers:create")).toBe(true);
    expect(roleHasPermission("admin_pays", "lead_assignments:read")).toBe(true);
    expect(RolePermissions.compliance_admin).toContain("quote_form_definitions:*");
    expect(RolePermissions.broker_agent).toContain("broker_leads:read");
  });
});
