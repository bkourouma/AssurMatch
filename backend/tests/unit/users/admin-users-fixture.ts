import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminUserRolesController } from "../../../src/modules/users/admin-user-roles.controller";
import { AdminUsersController } from "../../../src/modules/users/admin-users.controller";
import { UsersService, type UserAccount } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository } from "../../../src/modules/users/users.repository";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

export const CI = "00000000-0000-4000-8000-0000000000c1";
export const SN = "00000000-0000-4000-8000-0000000000c2";

export function actorOf(id: string, roles: AssurMatchRole[], extra: Partial<ActorContext> = {}): ActorContext {
  return { actorId: id, roles, mfaVerified: true, ...extra };
}

export function fixture() {
  const audit = new AuditLogWriter();
  const repository = new MemoryUsersRepository();
  const users = new UsersService(audit, repository);
  const controller = new AdminUsersController(users, audit);
  const rolesController = new AdminUserRolesController(users, audit);
  let counter = 0;
  const seed = async (roles: AssurMatchRole[], options: { status?: UserAccount["status"]; countryIds?: string[]; partnerTenantId?: string } = {}): Promise<UserAccount> => {
    counter += 1;
    const created = await users.create({
      email: `user${counter}@example.com`,
      displayName: `User ${counter}`,
      roles,
      ...(options.partnerTenantId ? { partnerTenantId: options.partnerTenantId } : {}),
      scopes: { countryIds: options.countryIds ?? [], productIds: [] }
    }, actorOf("seed", ["super_admin"]));
    const record = await users.require(created.id);
    record.passwordHash = "hash:secret";
    record.mfaSecretEncrypted = "enc:secret";
    record.mfaBackupCodesHashes = ["backup-hash"];
    record.passwordResetTokenHash = "reset-hash";
    record.failedLoginCount = 3;
    if (options.status && options.status !== "invited") record.status = options.status;
    return users.update(record);
  };
  return { audit, repository, users, controller, rolesController, seed };
}
