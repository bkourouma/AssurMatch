import type { ActivateRequest, LoginRequest, MfaVerifyRequest, PasswordChangeRequest, PasswordResetRequest } from "../../../../packages/shared/contracts/auth.contracts";
import type { ActorContext } from "../common/types";
import type { UserAccount } from "../users/users.module";
import { AuthService, type AuthSession } from "./auth.module";

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  login(input: LoginRequest): Promise<AuthSession> {
    return this.auth.login(input);
  }

  logout(): void {
    this.auth.logout();
  }

  me(actor: ActorContext): ActorContext {
    return this.auth.me(actor);
  }

  activate(input: ActivateRequest): Promise<AuthSession> {
    return this.auth.activate(input);
  }

  passwordChange(actor: ActorContext, input: PasswordChangeRequest): Promise<void> {
    return this.auth.changePassword(actor, input);
  }

  passwordReset(input: PasswordResetRequest): Promise<void> {
    return this.auth.resetPassword(input);
  }

  enrollMfa(user: UserAccount) {
    return this.auth.enrollMfa(user);
  }

  verifyMfa(user: UserAccount, input: MfaVerifyRequest): Promise<AuthSession> {
    return this.auth.verifyMfa(user, input.challengeId ?? "", input.code, input.kind ?? "totp");
  }
}
