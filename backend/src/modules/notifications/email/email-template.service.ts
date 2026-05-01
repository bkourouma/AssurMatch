import type { UserAccount } from "../../users/users.module";
import type { AuthEmailPayload, EmailPurpose } from "./email-delivery.service";

interface TemplateOptions {
  appBaseUrl?: string;
}

export class AuthEmailTemplateService {
  constructor(private readonly options: TemplateOptions = {}) {}

  activation(user: UserAccount, token: string): AuthEmailPayload {
    return this.render(user, token, "auth_activation", "Activation de votre acces AssurMatch", "activer votre acces", "/activate");
  }

  passwordReset(user: UserAccount, token: string): AuthEmailPayload {
    return this.render(user, token, "auth_password_reset", "Reinitialisation de votre mot de passe AssurMatch", "reinitialiser votre mot de passe", "/password-reset");
  }

  private render(
    user: UserAccount,
    token: string,
    purpose: EmailPurpose,
    subject: string,
    actionLabel: string,
    path: string
  ): AuthEmailPayload {
    const link = this.link(path, token);
    const lines = [
      `Bonjour ${user.displayName},`,
      "",
      "Une action de securite a ete initiee pour votre compte AssurMatch.",
      `Utilisez ce lien pour ${actionLabel}: ${link}`,
      `Jeton temporaire: ${token}`,
      "",
      "Ce jeton expire dans 30 minutes.",
      "AssurMatch est une plateforme technique de mise en relation et de comparaison indicative.",
      "Ignorez ce message si vous n'etes pas a l'origine de cette demande."
    ];

    return {
      to: user.email,
      subject,
      body: lines.join("\n"),
      html: [
        "<!doctype html>",
        "<html>",
        "<body>",
        `<p>Bonjour ${escapeHtml(user.displayName)},</p>`,
        "<p>Une action de securite a ete initiee pour votre compte AssurMatch.</p>",
        `<p><a href="${escapeHtml(link)}">Continuer</a></p>`,
        `<p>Jeton temporaire: <strong>${escapeHtml(token)}</strong></p>`,
        "<p>Ce jeton expire dans 30 minutes.</p>",
        "<p>AssurMatch est une plateforme technique de mise en relation et de comparaison indicative.</p>",
        "<p>Ignorez ce message si vous n'etes pas a l'origine de cette demande.</p>",
        "</body>",
        "</html>"
      ].join(""),
      purpose
    };
  }

  private link(path: string, token: string): string {
    const base = (this.options.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3702").replace(/\/$/, "");
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
