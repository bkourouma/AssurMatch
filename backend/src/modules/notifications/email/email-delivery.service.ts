import { AuditLogWriter } from "../../audit-logs/audit-log-writer.service";
import type { EmailRuntimeConfig } from "./email-config";
import { classifySmtpError, SmtpEmailSender } from "./smtp-email-sender";

export type EmailPurpose = "auth_activation" | "auth_password_reset";
export type EmailDeliveryStatus = "not_configured" | "previewed" | "sent" | "failed";
export type EmailProvider = "disabled" | "mailpit" | "smtp";

export interface AuthEmailPayload {
  to: string;
  subject: string;
  body: string;
  html?: string;
  purpose: EmailPurpose;
}

export interface AuthEmailDeliveryResult {
  status: EmailDeliveryStatus;
  provider: EmailProvider;
  errorClass?: string;
}

export interface AuthEmailDeliveryPort {
  send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult | void>;
}

interface Transport {
  send(payload: AuthEmailPayload): Promise<void>;
}

export class RuntimeEmailDeliveryService implements AuthEmailDeliveryPort {
  private readonly transport: Transport | undefined;

  constructor(
    private readonly config: EmailRuntimeConfig,
    private readonly audit = new AuditLogWriter(),
    transport?: Transport
  ) {
    this.transport = transport ?? this.createTransport();
  }

  async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
    if (this.config.serviceType === "disabled" || !this.transport) {
      const result: AuthEmailDeliveryResult = { status: "not_configured", provider: "disabled" };
      this.auditDelivery(payload, result);
      return result;
    }

    if (this.config.serviceType === "smtp" && this.config.previewMode) {
      const result: AuthEmailDeliveryResult = { status: "previewed", provider: "smtp" };
      this.auditDelivery(payload, result);
      return result;
    }

    try {
      await this.transport.send(payload);
      const result: AuthEmailDeliveryResult = { status: "sent", provider: this.config.serviceType };
      this.auditDelivery(payload, result);
      return result;
    } catch (error) {
      const result: AuthEmailDeliveryResult = {
        status: "failed",
        provider: this.config.serviceType,
        errorClass: classifySmtpError(error)
      };
      this.auditDelivery(payload, result);
      return result;
    }
  }

  private createTransport(): Transport | undefined {
    if (this.config.serviceType === "disabled") return undefined;
    return new SmtpEmailSender({
      host: this.config.smtpHost ?? "127.0.0.1",
      port: this.config.smtpPort ?? 1025,
      secure: this.config.smtpSecure,
      from: this.config.from ?? "no-reply@assurmatch.local",
      ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      ...(this.config.smtpUser ? { username: this.config.smtpUser } : {}),
      ...(this.config.smtpPass ? { password: this.config.smtpPass } : {}),
      timeoutMs: this.config.sendTimeoutMs
    });
  }

  private auditDelivery(payload: AuthEmailPayload, result: AuthEmailDeliveryResult): void {
    this.audit.write({
      action: `email.delivery.${result.status}`,
      targetType: "EmailDelivery",
      targetId: payload.purpose,
      result: result.status === "sent" || result.status === "previewed" ? "success" : result.status === "failed" ? "failed" : "refused",
      context: {
        purpose: payload.purpose,
        recipientMasked: maskEmail(payload.to),
        provider: result.provider,
        status: result.status,
        ...(result.errorClass ? { errorClass: result.errorClass } : {})
      }
    });
  }
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "[masked-email]";
  const first = local.slice(0, 1) || "*";
  return `${first}***@${domain}`;
}
