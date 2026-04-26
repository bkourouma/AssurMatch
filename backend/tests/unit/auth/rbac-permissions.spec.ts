import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

describe("RBAC role matrix", () => {
  it("grants super admin all permissions and limits broker read-only", async () => {
    expect(roleHasPermission("super_admin", "countries:update")).toBe(true);
    expect(roleHasPermission("broker_read_only", "broker_leads:read")).toBe(true);
    expect(roleHasPermission("broker_read_only", "broker_leads:update")).toBe(false);
  });
});
