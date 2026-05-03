import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { verifyActorToken } from "../../../src/modules/auth/http-auth-token.service";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { PrismaUsersRepository } from "../../../src/modules/users/users.repository";
import { superAdminActor } from "../helpers/enterprise-seed";

function createFakePrisma(partnerTenants: Array<{ id: string; plan: string }> = []) {
  const users = new Map<string, Record<string, unknown>>();
  const partners = new Map(partnerTenants.map((partner) => [partner.id, partner]));
  const roles = new Map<string, { id: string; key: string }>();
  const userRoles: Array<{ userId: string; roleId: string; reason: string }> = [];
  const decorate = (row: Record<string, unknown>) => ({
    ...row,
    userRoles: userRoles
      .filter((join) => join.userId === row.id)
      .map((join) => ({ role: [...roles.values()].find((role) => role.id === join.roleId) }))
  });

  return {
    requireRuntimeClient: () => ({
      user: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if ([...users.values()].some((row) => row.email === data.email)) throw new Error("Unique constraint failed");
          users.set(data.id as string, { ...data });
          return decorate(users.get(data.id as string)!);
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          users.set(where.id, { ...users.get(where.id), ...data, updatedAt: new Date() });
          return decorate(users.get(where.id)!);
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = users.get(where.id);
          return row ? decorate(row) : null;
        },
        findFirst: async ({ where }: { where: { email: string } }) => {
          const row = [...users.values()].find((candidate) => candidate.email === where.email);
          return row ? decorate(row) : null;
        },
        findMany: async () => [...users.values()].map(decorate)
      },
      role: {
        upsert: async ({ where, create }: { where: { key: string }; create: { key: string } }) => {
          const existing = roles.get(where.key);
          if (existing) return existing;
          const role = { id: crypto.randomUUID(), key: create.key };
          roles.set(role.key, role);
          return role;
        }
      },
      userRole: {
        deleteMany: async ({ where }: { where: { userId: string } }) => {
          for (let index = userRoles.length - 1; index >= 0; index -= 1) {
            if (userRoles[index]?.userId === where.userId) userRoles.splice(index, 1);
          }
        },
        create: async ({ data }: { data: { userId: string; roleId: string; reason: string } }) => {
          userRoles.push(data);
          return data;
        }
      },
      partnerTenant: {
        findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const ids = where?.id?.in;
          if (!ids) return [...partners.values()];
          return ids.flatMap((id) => {
            const partner = partners.get(id);
            return partner ? [partner] : [];
          });
        }
      }
    })
  } as unknown as PrismaService;
}

describe("auth users Prisma persistence", () => {
  it("reconstructs a created user from a fresh PrismaUsersRepository", async () => {
    const prisma = createFakePrisma();
    const first = new UsersService(new AuditLogWriter(), new PrismaUsersRepository(prisma));
    const created = await first.create({
      email: "persisted-user@example.com",
      displayName: "Persisted User",
      roles: ["support_admin"],
      scopes: { countryIds: ["00000000-0000-4000-8000-0000000000a1"], productIds: [] }
    }, superAdminActor);
    await first.setPassword(created.id, "argon2id-hash");

    const recreated = new UsersService(new AuditLogWriter(), new PrismaUsersRepository(prisma));
    const loaded = await recreated.findByEmail("persisted-user@example.com");

    expect(loaded?.id).toBe(created.id);
    expect(loaded?.roles).toEqual(["support_admin"]);
    expect(loaded?.passwordHash).toBe("argon2id-hash");
  });

  it("hydrates persisted partner plan into login-issued tokens", async () => {
    const partnerTenantId = "00000000-0000-4000-8000-0000000000b1";
    const countryId = "00000000-0000-4000-8000-0000000000c1";
    const productId = "00000000-0000-4000-8000-0000000000d1";
    const prisma = createFakePrisma([{ id: partnerTenantId, plan: "enterprise" }]);
    const users = new UsersService(new AuditLogWriter(), new PrismaUsersRepository(prisma));
    const auth = new AuthModule(users);
    const created = await users.create({
      email: "persisted-broker@example.com",
      displayName: "Persisted Broker",
      roles: ["broker_owner_pro"],
      partnerTenantId,
      scopes: { countryIds: [countryId], productIds: [productId] }
    }, superAdminActor);
    await users.update({ ...created, mfaStatus: "verified" });
    await users.setPassword(created.id, await auth.passwordHashing.hash("valid password 123"));

    const session = await auth.service.login({ email: "persisted-broker@example.com", password: "valid password 123" });
    const claims = verifyActorToken(session.accessToken);

    expect(claims).toMatchObject({
      actorId: created.id,
      partnerTenantId,
      partnerPlan: "enterprise",
      countryScopes: [countryId],
      productScopes: [productId]
    });
  }, 20_000);
});
