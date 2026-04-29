import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("user soft delete", () => {
  it("keeps the row, rotates email to a tombstone and filters normal lookup/list results", async () => {
    const users = new UsersService(new AuditLogWriter());
    const user = await users.create({ email: "soft-delete@example.com", displayName: "Soft Delete", roles: ["support_admin"] }, superAdminActor);

    const deleted = await users.softDelete(user.id);

    expect(deleted.status).toBe("deleted");
    expect(deleted.email).toBe(`${user.id}@deleted.assurmatch.local`);
    expect((await users.require(user.id)).deletedAt).toBeInstanceOf(Date);
    expect(await users.findByEmail("soft-delete@example.com")).toBeUndefined();
    expect((await users.list(superAdminActor)).map((candidate) => candidate.id)).not.toContain(user.id);
  });
});
