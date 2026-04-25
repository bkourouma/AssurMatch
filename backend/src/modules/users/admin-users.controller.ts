import type { UserCreateDto } from "../../../../packages/shared/contracts/auth.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { UsersService, type UserAccount } from "./users.module";

export class AdminUsersController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly users: UsersService) {}

  list(actor: ActorContext): UserAccount[] {
    this.rbac.assert(actor, "users:read");
    return this.users.list(actor);
  }

  create(actor: ActorContext, input: UserCreateDto): UserAccount {
    this.rbac.assert(actor, "users:create");
    return this.users.create(input, actor);
  }
}
