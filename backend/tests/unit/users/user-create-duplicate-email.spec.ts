import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { MemoryUsersRepository, type UserAccount } from "../../../src/modules/users/users.repository";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const input = { email: "dup-create@example.com", displayName: "Dup Create", roles: ["support_admin" as const] };

describe("user creation with an e-mail already used", () => {
  it("answers a neutral 409 EMAIL_ALREADY_USED instead of a raw ORM error", async () => {
    const users = new UsersService(new AuditLogWriter());
    await users.create(input, superAdminActor);
    await expect(users.create(input, superAdminActor)).rejects.toMatchObject({ response: { code: "EMAIL_ALREADY_USED" } });
  });

  it("maps a concurrent unique-constraint failure of the repository to the same 409", async () => {
    class RacingRepository extends MemoryUsersRepository {
      override async create(_user: UserAccount): Promise<UserAccount> {
        throw Object.assign(new Error("Invalid `prisma.user.create()` invocation: Unique constraint failed on the constraint: `User_email_key`"), { code: "P2002" });
      }
    }
    const users = new UsersService(new AuditLogWriter(), new RacingRepository());
    const error = await users.create(input, superAdminActor).catch((caught: unknown) => caught);
    expect(JSON.stringify((error as { response?: unknown }).response)).not.toMatch(/prisma|unique constraint/i);
    expect(error).toMatchObject({ response: { code: "EMAIL_ALREADY_USED" } });
  });
});
