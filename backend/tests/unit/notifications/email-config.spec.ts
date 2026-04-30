import { describe, expect, it } from "vitest";
import { resolveEmailRuntimeConfig, validateEmailRuntimeEnvironment } from "../../../src/modules/notifications/email/email-config";

describe("email runtime config", () => {
  it("defaults to disabled mode without requiring SMTP secrets", () => {
    expect(resolveEmailRuntimeConfig({ APP_ENV: "local" })).toMatchObject({
      serviceType: "disabled",
      smtpSecure: false,
      sendTimeoutMs: 5000,
      previewMode: false
    });
  });

  it("resolves Mailpit defaults for local/preproduction verification", () => {
    expect(resolveEmailRuntimeConfig({
      APP_ENV: "preproduction",
      EMAIL_SERVICE_TYPE: "mailpit",
      EMAIL_FROM: "no-reply@assurmatch.local"
    })).toMatchObject({
      serviceType: "mailpit",
      from: "no-reply@assurmatch.local",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpSecure: false,
      previewMode: true
    });
  });

  it("refuses Mailpit in production", () => {
    expect(() => validateEmailRuntimeEnvironment({
      APP_ENV: "production",
      EMAIL_SERVICE_TYPE: "mailpit",
      EMAIL_FROM: "no-reply@assurmatch.local"
    })).toThrow("EMAIL_SERVICE_TYPE=mailpit is not allowed in production");
  });

  it("requires SMTP env values without echoing password values", () => {
    expect(() => validateEmailRuntimeEnvironment({
      APP_ENV: "production",
      EMAIL_SERVICE_TYPE: "smtp",
      EMAIL_FROM: "no-reply@example.com",
      EMAIL_SMTP_HOST: "smtp.example.com",
      EMAIL_SMTP_PORT: "465",
      EMAIL_SMTP_USER: "sender@example.com"
    })).toThrow("EMAIL_SMTP_PASS is required when EMAIL_SERVICE_TYPE=smtp");
  });

  it("loads SMTP config with secure default on port 465", () => {
    expect(resolveEmailRuntimeConfig({
      APP_ENV: "production",
      EMAIL_SERVICE_TYPE: "smtp",
      EMAIL_FROM: "AssurMatch <no-reply@example.com>",
      EMAIL_SMTP_HOST: "smtp.example.com",
      EMAIL_SMTP_PORT: "465",
      EMAIL_SMTP_USER: "sender@example.com",
      EMAIL_SMTP_PASS: "runtime-only-secret"
    })).toMatchObject({
      serviceType: "smtp",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpPass: "runtime-only-secret"
    });
  });

  it("rejects invalid service type and timeout values", () => {
    expect(() => validateEmailRuntimeEnvironment({ EMAIL_SERVICE_TYPE: "sendgrid" })).toThrow("EMAIL_SERVICE_TYPE must be disabled, mailpit or smtp");
    expect(() => validateEmailRuntimeEnvironment({ EMAIL_SERVICE_TYPE: "disabled", EMAIL_SEND_TIMEOUT_MS: "0" })).toThrow("EMAIL_SEND_TIMEOUT_MS must be a positive integer");
  });
});
