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

  buildActivationEmail(user: UserAccount, token: string): AuthEmailPayload {
    return this.templates.activation(user, token);
  }

  buildPasswordResetEmail(user: UserAccount, token: string): AuthEmailPayload {
    return this.templates.passwordReset(user, token);
  }

  async deliverPasswordReset(user: UserAccount, token: string): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildPasswordResetEmail(user, token), token);
  }

  async deliverActivation(user: UserAccount, token: string): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildActivationEmail(user, token), token);
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
