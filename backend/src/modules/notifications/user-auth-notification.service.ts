import type { UserAccount } from "../users/users.module";

export interface AuthEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface AuthEmailDeliveryPort {
  send(payload: AuthEmailPayload): Promise<void>;
}

export interface AuthTokenDeliveryResult {
  emailStatus: "not_configured" | "sent" | "failed";
  token?: string;
}

export class UserAuthNotificationService {
  constructor(private readonly sender?: AuthEmailDeliveryPort) {}

  buildActivationEmail(user: UserAccount, token: string): AuthEmailPayload {
    return this.buildUserTokenEmail(user, token, "Activation de votre acces AssurMatch");
  }

  buildPasswordResetEmail(user: UserAccount, token: string): AuthEmailPayload {
    return this.buildUserTokenEmail(user, token, "Reinitialisation de votre mot de passe AssurMatch");
  }

  async deliverPasswordReset(user: UserAccount, token: string): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildPasswordResetEmail(user, token), token);
  }

  async deliverActivation(user: UserAccount, token: string): Promise<AuthTokenDeliveryResult> {
    return this.deliver(this.buildActivationEmail(user, token), token);
  }

  private async deliver(payload: AuthEmailPayload, token: string): Promise<AuthTokenDeliveryResult> {
    if (!process.env.SMTP_HOST && !this.sender) return { emailStatus: "not_configured", token };
    try {
      await this.sender?.send(payload);
      return { emailStatus: "sent" };
    } catch {
      return { emailStatus: "failed", token };
    }
  }

  private buildUserTokenEmail(user: UserAccount, token: string, subject: string): AuthEmailPayload {
    return {
      to: user.email,
      subject,
      body: [
        `Bonjour ${user.displayName},`,
        "",
        "Une action de securite a ete initiee par votre administrateur AssurMatch.",
        "Utilisez le lien ou le jeton temporaire transmis par votre canal securise interne.",
        `Jeton temporaire: ${token}`,
        "",
        "Ce jeton expire dans 30 minutes. Ignorez ce message si vous n'etes pas a l'origine de cette demande."
      ].join("\n")
    };
  }
}
