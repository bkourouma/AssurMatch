import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository } from "../../../src/modules/users/users.repository";
import type { ActorContext } from "../../../src/modules/common/types";

const admin: ActorContext = { actorId: "admin", roles: ["super_admin"], mfaVerified: true };

function createService(): UsersService {
  return new UsersService(new AuditLogWriter(), new MemoryUsersRepository());
}

describe("UsersRepository contract", () => {
  it("creates users with auth persistence defaults", async () => {
    const service = createService();
    const user = await service.create({
      email: "person@example.com",
      displayName: "Person Example",
      roles: ["compliance_admin"],
      scopes: { countryIds: [], productIds: [] }
    }, admin);

    expect(user.status).toBe("invited");
    expect(user.mfaStatus).toBe("required");
    expect(user.passwordChangeRequired).toBe(true);
    expect(user.failedLoginCount).toBe(0);
    expect(user.mfaBackupCodesHashes).toEqual([]);
  });

  it("rejects duplicate emails", async () => {
    const service = createService();
    const input = { email: "person@example.com", displayName: "Person Example", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] } };
    await service.create(input, admin);
    await expect(service.create(input, admin)).rejects.toThrow(/already exists/);
  });

  it("filters soft-deleted users from list and findByEmail", async () => {
    const service = createService();
    const user = await service.create({
      email: "person@example.com",
      displayName: "Person Example",
      roles: ["support_admin"],
      scopes: { countryIds: [], productIds: [] }
    }, admin);

    await service.softDelete(user.id);

    expect(await service.list(admin)).toEqual([]);
    expect(await service.findByEmail("person@example.com")).toBeUndefined();
    expect((await service.require(user.id)).email).toBe(`${user.id}@deleted.assurmatch.local`);
  });

  it("persists password, lockout and login metadata", async () => {
    const service = createService();
    const user = await service.create({
      email: "person@example.com",
      displayName: "Person Example",
      roles: ["support_admin"],
      scopes: { countryIds: [], productIds: [] }
    }, admin);

    await service.setPassword(user.id, "argon2id-hash");
    await service.incrementFailedLogin(user.id, new Date("2026-04-28T00:00:00.000Z"));
    await service.lock(user.id, "failed-login-threshold");
    await service.unlock(user.id);
    await service.recordSuccessfulLogin(user.id, "ip-hash");

    const updated = await service.require(user.id);
    expect(updated.passwordHash).toBe("argon2id-hash");
    expect(updated.passwordChangeRequired).toBe(false);
    expect(updated.status).toBe("active");
    expect(updated.failedLoginCount).toBe(0);
    expect(updated.lastLoginIpHash).toBe("ip-hash");
  });
});
