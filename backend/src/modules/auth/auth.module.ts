import { loginRequestSchema, type LoginRequest } from "../../../../packages/shared/contracts/auth.contracts";
import type { ActorContext } from "../common/types";
import type { UserAccount, UsersService } from "../users/users.module";
import { signActorToken } from "./http-auth-token.service";
import { MfaService } from "./mfa.service";

export interface AuthSession {
  accessToken: string;
  mfaRequired: boolean;
  user: UserAccount;
}

export class AuthService {
  constructor(private readonly users: UsersService, private readonly mfa: MfaService) {}

  login(input: LoginRequest): AuthSession {
    const parsed = loginRequestSchema.parse(input);
    const user = this.users.list({ roles: ["super_admin"] }).find((candidate) => candidate.email === parsed.email);
    if (!user || user.status === "suspended" || user.status === "locked" || user.status === "deleted") {
      throw new Error("Invalid credentials");
    }
    user.status = "active";
    return {
      accessToken: signActorToken({ actorId: user.id, roles: user.roles, ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}), mfaVerified: user.mfaStatus === "verified" }),
      mfaRequired: user.mfaStatus !== "verified",
      user
    };
  }

  logout(): void {
    return undefined;
  }

  me(actor: ActorContext): ActorContext {
    return actor;
  }

  enrollMfa(user: UserAccount) {
    return this.mfa.enroll(user);
  }

  verifyMfa(user: UserAccount, challengeId: string, code: string): AuthSession {
    if (!this.mfa.verify(user, challengeId, code)) throw new Error("Invalid MFA code");
    return {
      accessToken: signActorToken({ actorId: user.id, roles: user.roles, ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}), mfaVerified: true }),
      mfaRequired: false,
      user
    };
  }
}

export class AuthModule {
  readonly mfa = new MfaService();
  readonly service: AuthService;

  constructor(users: UsersService) {
    this.service = new AuthService(users, this.mfa);
  }
}
