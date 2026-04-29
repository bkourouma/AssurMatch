import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("user RBAC administration", () => {
  it("audits user creation and role assignment", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const user = await users.create({ email: "compliance@example.com", displayName: "Compliance", roles: ["compliance_admin"] }, superAdminActor);
    await users.updateRoles(user.id, ["support_admin"], "temporary support coverage", superAdminActor);

    expect(audit.all().map((entry) => entry.action)).toContain(AuthAuditActions.userRoleChanged);
  });
});
