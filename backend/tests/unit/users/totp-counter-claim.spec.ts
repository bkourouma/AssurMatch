import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository, PrismaUsersRepository } from "../../../src/modules/users/users.repository";
import { actorOf } from "./admin-users-fixture";

describe("claimTotpCounter", () => {
  it("accepts only a strictly greater counter (memory)", async () => {
    const users = new UsersService(new AuditLogWriter(), new MemoryUsersRepository());
    const user = await users.create({ email: "t@example.com", displayName: "T", roles: ["support_admin"] }, actorOf("a", ["super_admin"]));
    expect(await users.claimTotpCounter(user.id, 100)).toBe(true);
    expect(await users.claimTotpCounter(user.id, 100)).toBe(false);
    expect(await users.claimTotpCounter(user.id, 99)).toBe(false);
    expect(await users.claimTotpCounter(user.id, 101)).toBe(true);
    expect(await users.claimTotpCounter("unknown", 1)).toBe(false);
    expect((await users.require(user.id)).mfaLastTotpCounter).toBe(101);
  });

  it("is cleared by resetMfa and by a new enrolment", async () => {
    const users = new UsersService(new AuditLogWriter(), new MemoryUsersRepository());
    const user = await users.create({ email: "t@example.com", displayName: "T", roles: ["support_admin"] }, actorOf("a", ["super_admin"]));
    await users.claimTotpCounter(user.id, 100);
    await users.resetMfa(user.id);
    expect((await users.require(user.id)).mfaLastTotpCounter).toBeUndefined();
    await users.claimTotpCounter(user.id, 200);
    await users.setMfaEnrollment(user.id, "enc", []);
    expect((await users.require(user.id)).mfaLastTotpCounter).toBeUndefined();
  });

  it("uses one conditional updateMany on Prisma", async () => {
    const seen: unknown[] = [];
    const prisma = { requireRuntimeClient: () => ({ user: { updateMany: async (input: unknown) => { seen.push(input); return { count: seen.length === 1 ? 1 : 0 }; } } }) };
    const repository = new PrismaUsersRepository(prisma as never);
    expect(await repository.claimTotpCounter("u1", 7)).toBe(true);
    expect(await repository.claimTotpCounter("u1", 7)).toBe(false);
    expect(seen[0]).toEqual({ where: { id: "u1", OR: [{ mfaLastTotpCounter: null }, { mfaLastTotpCounter: { lt: 7 } }] }, data: { mfaLastTotpCounter: 7 } });
  });
});
