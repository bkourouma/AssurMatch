import type { LoginRequest } from "../../../../packages/shared/contracts/auth.contracts";
import type { ActorContext } from "../common/types";
import type { UserAccount } from "../users/users.module";
import { AuthService, type AuthSession } from "./auth.module";

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  login(input: LoginRequest): AuthSession {
    return this.auth.login(input);
  }

  logout(): void {
    this.auth.logout();
  }

  me(actor: ActorContext): ActorContext {
    return this.auth.me(actor);
  }

  enrollMfa(user: UserAccount) {
    return this.auth.enrollMfa(user);
  }

  verifyMfa(user: UserAccount, challengeId: string, code: string): AuthSession {
    return this.auth.verifyMfa(user, challengeId, code);
  }
}
