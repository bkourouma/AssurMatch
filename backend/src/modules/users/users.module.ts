import { userCreateSchema, type UserCreateDto } from "../../../../packages/shared/contracts/auth.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface UserAccount extends Omit<UserCreateDto, "roles" | "scopes"> {
  id: string;
  roles: AssurMatchRole[];
  status: "invited" | "active" | "suspended" | "locked" | "deleted";
  mfaStatus: "not_enrolled" | "enrolled" | "required" | "verified";
  countryScopes: string[];
  productScopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class UsersService {
  private readonly users: UserAccount[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: UserCreateDto, actor: ActorContext): UserAccount {
    const parsed = userCreateSchema.parse(input);
    if (this.users.some((user) => user.email === parsed.email)) throw new Error("User email already exists");
    const now = new Date();
    const user: UserAccount = {
      id: parsed.id ?? crypto.randomUUID(),
      email: parsed.email,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      displayName: parsed.displayName,
      roles: parsed.roles as AssurMatchRole[],
      status: "invited",
      mfaStatus: "required",
      ...(parsed.partnerTenantId ? { partnerTenantId: parsed.partnerTenantId } : {}),
      countryScopes: parsed.scopes.countryIds,
      productScopes: parsed.scopes.productIds,
      createdAt: now,
      updatedAt: now
    };
    this.users.push(user);
    this.audit.write({
      actor,
      action: "user.created",
      targetType: "User",
      targetId: user.id,
      result: "success",
      context: { email: user.email, roles: user.roles }
    });
    return user;
  }

  updateRoles(userId: string, roles: AssurMatchRole[], reason: string, actor: ActorContext): UserAccount {
    const user = this.require(userId);
    user.roles = roles;
    user.updatedAt = new Date();
    this.audit.write({
      actor,
      action: "user.roles_updated",
      targetType: "User",
      targetId: user.id,
      result: "success",
      reason,
      context: { roles }
    });
    return user;
  }

  list(actor: ActorContext): UserAccount[] {
    if (actor.roles.includes("super_admin")) return [...this.users];
    if (actor.partnerTenantId) return this.users.filter((user) => user.partnerTenantId === actor.partnerTenantId);
    return this.users.filter((user) =>
      user.countryScopes.some((countryId) => actor.countryScopes?.includes(countryId))
    );
  }

  require(id: string): UserAccount {
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}

export class UsersModule {
  readonly service: UsersService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new UsersService(audit);
  }
}
