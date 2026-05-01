export type EmailServiceType = "disabled" | "mailpit" | "smtp";

export interface EmailRuntimeConfig {
  serviceType: EmailServiceType;
  from?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure: boolean;
  sendTimeoutMs: number;
  previewMode: boolean;
}

const serviceTypes = new Set<EmailServiceType>(["disabled", "mailpit", "smtp"]);

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function bool(value: string | undefined): boolean {
  return value === "true";
}

function positiveInt(env: Record<string, string | undefined>, key: string, defaultValue: number): number {
  const raw = optional(env[key]);
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
}

function requireValue(env: Record<string, string | undefined>, key: string, mode: EmailServiceType): string {
  const value = optional(env[key]);
  if (!value || value === "REDACTED") throw new Error(`${key} is required when EMAIL_SERVICE_TYPE=${mode}`);
  return value;
}

export function resolveEmailRuntimeConfig(env: Record<string, string | undefined> = process.env): EmailRuntimeConfig {
  const rawType = optional(env.EMAIL_SERVICE_TYPE) ?? "disabled";
  if (!serviceTypes.has(rawType as EmailServiceType)) {
    throw new Error("EMAIL_SERVICE_TYPE must be disabled, mailpit or smtp");
  }

  const serviceType = rawType as EmailServiceType;
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  const sendTimeoutMs = positiveInt(env, "EMAIL_SEND_TIMEOUT_MS", 5000);
  const replyTo = optional(env.EMAIL_REPLY_TO);

  if (serviceType === "disabled") {
    const from = optional(env.EMAIL_FROM);
    return {
      serviceType,
      ...(from ? { from } : {}),
      ...(replyTo ? { replyTo } : {}),
      smtpSecure: false,
      sendTimeoutMs,
      previewMode: bool(env.EMAIL_PREVIEW_MODE)
    };
  }

  if (serviceType === "mailpit") {
    if (appEnv === "production") throw new Error("EMAIL_SERVICE_TYPE=mailpit is not allowed in production");
    const smtpPort = positiveInt(env, "EMAIL_SMTP_PORT", 1025);
    return {
      serviceType,
      from: requireValue(env, "EMAIL_FROM", serviceType),
      ...(replyTo ? { replyTo } : {}),
      smtpHost: optional(env.EMAIL_SMTP_HOST) ?? "127.0.0.1",
      smtpPort,
      smtpSecure: bool(env.EMAIL_SMTP_SECURE),
      sendTimeoutMs,
      previewMode: env.EMAIL_PREVIEW_MODE === undefined ? true : bool(env.EMAIL_PREVIEW_MODE)
    };
  }

  const smtpPort = positiveInt(env, "EMAIL_SMTP_PORT", 465);
  return {
    serviceType,
    from: requireValue(env, "EMAIL_FROM", serviceType),
    ...(replyTo ? { replyTo } : {}),
    smtpHost: requireValue(env, "EMAIL_SMTP_HOST", serviceType),
    smtpPort,
    smtpUser: requireValue(env, "EMAIL_SMTP_USER", serviceType),
    smtpPass: requireValue(env, "EMAIL_SMTP_PASS", serviceType),
    smtpSecure: env.EMAIL_SMTP_SECURE === undefined ? smtpPort === 465 : bool(env.EMAIL_SMTP_SECURE),
    sendTimeoutMs,
    previewMode: bool(env.EMAIL_PREVIEW_MODE)
  };
}

export function validateEmailRuntimeEnvironment(env: Record<string, string | undefined> = process.env): void {
  resolveEmailRuntimeConfig(env);
}
