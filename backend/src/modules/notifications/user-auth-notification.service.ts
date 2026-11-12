import type { UserAccount } from "../users/users.module";
import { AuthEmailTemplateService } from "./email/email-template.service";
import type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";

export type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";

export interface AuthTokenDeliveryResult {
  emailStatus: "not_configured" | "previewed" | "sent" | "failed";
  token?: string;
}

/**
 * The plain-text token (activation / password reset) may only travel in an API response outside
 * production-like environments (local, test, staging / e2e, runtime-smoke). Rule: `APP_ENV ?? NODE_ENV
 * ?? "local"` is neither `production` nor `preproduction`. Deliberately not `isProductionLike()`: the
 * e2e stack runs NODE_ENV=production with APP_ENV=staging and relies on the token. Read at call time.
 */
export function exposeAuthTokensInResponse(env: NodeJS.ProcessEnv = process.env): boolean {
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  return appEnv !== "production" && appEnv !== "preproduction";
}

export class UserAuthNotificationService {
  private readonly templates = new AuthEmailTemplateService();

  constructor(private readonly sender?: AuthEmailDeliveryPort) {}

  /** `expiresAt` is the stored expiry of the token: the e-mail announces exactly that validity. */
  buildActivationEmail(user: UserAccount, token: string, expiresAt: Date): AuthEmailPayload {
    return this.templates.activation(user, token, expiresAt);
  }

  buildPasswordResetEmail(user: UserAccount, token: string, expiresAt: Date): AuthEmailPayload {
    return this.templates.passwordReset(user, token, expiresAt);
  }

  async deliverPasswordReset(user: UserAccount, token: string, expiresAt: Date): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildPasswordResetEmail(user, token, expiresAt), token);
  }

  async deliverActivation(user: UserAccount, token: string, expiresAt: Date): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildActivationEmail(user, token, expiresAt), token);
  }

  private async deliver(payload: AuthEmailPayload, token: string): Promise<AuthTokenDeliveryResult> {
    const withToken = (emailStatus: AuthTokenDeliveryResult["emailStatus"]): AuthTokenDeliveryResult =>
      exposeAuthTokensInResponse() ? { emailStatus, token } : { emailStatus };
    if (!this.sender) return withToken("not_configured");
    try {
      const result = await this.sender.send(payload);
      if (result && result.status !== "sent") return withToken(result.status);
      return { emailStatus: "sent" };
    } catch {
      return withToken("failed");
    }
  }
}
