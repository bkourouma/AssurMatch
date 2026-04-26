import { describe, expect, it } from "vitest";
import { AssurMatchRoles, RolePermissions } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

describe("constitution role matrix", () => {
  it("defines every constitutional role with permissions", async () => {
    expect(AssurMatchRoles).toHaveLength(12);
    for (const role of AssurMatchRoles) {
      expect(RolePermissions[role].length).toBeGreaterThan(0);
    }
  });
});
