import type { UserAccount } from "../users/users.module";
import { AuthEmailTemplateService } from "./email/email-template.service";
import type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";

export type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";

export interface AuthTokenDeliveryResult {
  emailStatus: "not_configured" | "previewed" | "sent" | "failed";
  token?: string;
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
    if (!this.sender) return { emailStatus: "not_configured", token };
    try {
      const result = await this.sender.send(payload);
      if (result && result.status !== "sent") return { emailStatus: result.status, token };
      return { emailStatus: "sent" };
    } catch {
      return { emailStatus: "failed", token };
    }
  }
}
