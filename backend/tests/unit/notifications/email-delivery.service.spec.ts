import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { maskEmail, RuntimeEmailDeliveryService, type AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";

const payload: AuthEmailPayload = {
  to: "recipient@example.test",
  subject: "Activation de votre acces AssurMatch",
  body: "Jeton temporaire: super-secret-token",
  html: "<p>Jeton temporaire: super-secret-token</p>",
  purpose: "auth_activation"
};

describe("RuntimeEmailDeliveryService", () => {
  it("returns not_configured and audits masked metadata in disabled mode", async () => {
    const audit = new AuditLogWriter();
    const service = new RuntimeEmailDeliveryService({
      serviceType: "disabled",
      smtpSecure: false,
      sendTimeoutMs: 5000,
      previewMode: false
    }, audit);

    await expect(service.send(payload)).resolves.toEqual({ status: "not_configured", provider: "disabled" });
    const serialized = JSON.stringify(audit.all());
    expect(serialized).toContain("email.delivery.not_configured");
    expect(serialized).not.toContain("recipient@example.test");
    expect(serialized).not.toContain("super-secret-token");
  });

  it("audits sent status without storing email body or token", async () => {
    const audit = new AuditLogWriter();
    const service = new RuntimeEmailDeliveryService({
      serviceType: "mailpit",
      from: "no-reply@assurmatch.local",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpSecure: false,
      sendTimeoutMs: 5000,
      previewMode: true
    }, audit, { send: async () => undefined });

    await expect(service.send(payload)).resolves.toEqual({ status: "sent", provider: "mailpit" });
    const entry = audit.search({ action: "email.delivery.sent" })[0];
    expect(entry?.context).toMatchObject({
      purpose: "auth_activation",
      provider: "mailpit",
      status: "sent"
    });
    expect(JSON.stringify(audit.all())).not.toContain("super-secret-token");
  });

  it("does not call SMTP transport when preview mode is enabled", async () => {
    const audit = new AuditLogWriter();
    let calls = 0;
    const service = new RuntimeEmailDeliveryService({
      serviceType: "smtp",
      from: "no-reply@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "sender@example.com",
      smtpPass: "runtime-only-secret",
      smtpSecure: false,
      sendTimeoutMs: 5000,
      previewMode: true
    }, audit, { send: async () => { calls += 1; } });

    await expect(service.send(payload)).resolves.toEqual({ status: "previewed", provider: "smtp" });
    expect(calls).toBe(0);
    const entry = audit.search({ action: "email.delivery.previewed" })[0];
    expect(entry?.context).toMatchObject({
      purpose: "auth_activation",
      provider: "smtp",
      status: "previewed"
    });
    expect(JSON.stringify(audit.all())).not.toContain("super-secret-token");
    expect(JSON.stringify(audit.all())).not.toContain("recipient@example.test");
  });

  it("maps transport failures to safe error classes", async () => {
    const audit = new AuditLogWriter();
    const service = new RuntimeEmailDeliveryService({
      serviceType: "smtp",
      from: "no-reply@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpUser: "sender@example.com",
      smtpPass: "runtime-only-secret",
      smtpSecure: true,
      sendTimeoutMs: 5000,
      previewMode: false
    }, audit, { send: async () => { throw new Error("runtime-only-secret connection refused"); } });

    await expect(service.send(payload)).resolves.toEqual({ status: "failed", provider: "smtp", errorClass: "smtp_unavailable" });
    const serialized = JSON.stringify(audit.all());
    expect(serialized).toContain("email.delivery.failed");
    expect(serialized).not.toContain("runtime-only-secret");
  });

  it("masks recipient addresses deterministically before audit masking", () => {
    expect(maskEmail("recipient@example.test")).toBe("r***@example.test");
    expect(maskEmail("not-an-email")).toBe("[masked-email]");
  });
});
