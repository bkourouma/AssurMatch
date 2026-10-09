import type { UserAccount } from "../../users/users.module";
import type { AuthEmailPayload, EmailPurpose } from "./email-delivery.service";

interface TemplateOptions {
  /** Admin back-office URL (`APP_BASE_URL`). */
  appBaseUrl?: string;
  /** Broker back-office URL (`BROKER_APP_URL`), used for every broker user. */
  brokerAppUrl?: string;
}

/**
 * A broker user (attached to a partner tenant, or holding a broker role) signs in on the broker
 * back-office, never on the admin one: their activation and password-reset links point there.
 */
export function isBrokerAccount(user: Pick<UserAccount, "partnerTenantId" | "roles">): boolean {
  return Boolean(user.partnerTenantId) || user.roles.some((role) => role.startsWith("broker_"));
}

/**
 * Spec 059 follow-up: the validity announced in the e-mail is computed from the token's real expiry
 * (`AUTH_ACTION_TOKEN_TTL_MINUTES` for invitations and resets, `--ttl-minutes` for the bootstrap
 * command), never a hard-coded duration. Rounded down to the minute so it never over-promises.
 */
export function formatTokenValidity(expiresAt: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const days = minutes / 1440;
  if (Number.isInteger(days)) return `${days} jour${days > 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursLabel = `${hours} heure${hours > 1 ? "s" : ""}`;
  return rest === 0 ? hoursLabel : `${hoursLabel} ${String(rest).padStart(2, "0")}`;
}

export class AuthEmailTemplateService {
  constructor(private readonly options: TemplateOptions = {}) {}

  activation(user: UserAccount, token: string, expiresAt: Date, now: Date = new Date()): AuthEmailPayload {
    return this.render(user, token, "auth_activation", "Activation de votre accès AssurMatch", "activer votre accès", "/activate", formatTokenValidity(expiresAt, now));
  }

  passwordReset(user: UserAccount, token: string, expiresAt: Date, now: Date = new Date()): AuthEmailPayload {
    return this.render(user, token, "auth_password_reset", "Réinitialisation de votre mot de passe AssurMatch", "réinitialiser votre mot de passe", "/password-reset", formatTokenValidity(expiresAt, now));
  }

  private render(
    user: UserAccount,
    token: string,
    purpose: EmailPurpose,
    subject: string,
    actionLabel: string,
    path: string,
    validity: string
  ): AuthEmailPayload {
    const link = this.link(user, path, token);
    const lines = [
      `Bonjour ${user.displayName},`,
      "",
      "Une action de sécurité a été initiée pour votre compte AssurMatch.",
      `Utilisez ce lien pour ${actionLabel}: ${link}`,
      `Jeton temporaire: ${token}`,
      "",
      `Ce lien et ce jeton expirent dans ${validity}.`,
      "AssurMatch est une plateforme technique de mise en relation et de comparaison indicative.",
      "Ignorez ce message si vous n'êtes pas à l'origine de cette demande."
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
        "<p>Une action de sécurité a été initiée pour votre compte AssurMatch.</p>",
        `<p><a href="${escapeHtml(link)}">Continuer</a></p>`,
        `<p>Jeton temporaire: <strong>${escapeHtml(token)}</strong></p>`,
        `<p>Ce lien et ce jeton expirent dans ${escapeHtml(validity)}.</p>`,
        "<p>AssurMatch est une plateforme technique de mise en relation et de comparaison indicative.</p>",
        "<p>Ignorez ce message si vous n'êtes pas à l'origine de cette demande.</p>",
        "</body>",
        "</html>"
      ].join(""),
      purpose
    };
  }

  private link(user: UserAccount, path: string, token: string): string {
    const base = (isBrokerAccount(user)
      ? this.options.brokerAppUrl ?? process.env.BROKER_APP_URL ?? "http://127.0.0.1:3603"
      : this.options.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3602").replace(/\/$/, "");
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
