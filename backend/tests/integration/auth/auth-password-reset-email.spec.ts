import { describe, expect, it } from "vitest";
import { UserAuthNotificationService, type AuthEmailPayload } from "../../../src/modules/notifications/user-auth-notification.service";
import type { UserAccount } from "../../../src/modules/users/users.module";

const user: UserAccount = {
  id: "user-1",
  email: "reset@example.com",
  displayName: "Reset Person",
  roles: ["support_admin"],
  status: "active",
  mfaStatus: "verified",
  countryScopes: [],
  productScopes: [],
  passwordChangeRequired: false,
  failedLoginCount: 0,
  mfaBackupCodesHashes: [],
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("password reset email fallback", () => {
  it("returns a one-time token preview when SMTP is not configured", async () => {
    const previousSmtpHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const service = new UserAuthNotificationService();
      await expect(service.deliverPasswordReset(user, "preview-token")).resolves.toEqual({
        emailStatus: "not_configured",
        token: "preview-token"
      });
    } finally {
      if (previousSmtpHost !== undefined) process.env.SMTP_HOST = previousSmtpHost;
    }
  });

  it("falls back to a one-time token if sending fails", async () => {
    const service = new UserAuthNotificationService({
      send: async () => {
        throw new Error("SMTP unavailable");
      }
    });

    await expect(service.deliverPasswordReset(user, "fallback-token")).resolves.toEqual({
      emailStatus: "failed",
      token: "fallback-token"
    });
  });

  it("does not return the token after a successful send", async () => {
    const sent: AuthEmailPayload[] = [];
    const service = new UserAuthNotificationService({
      send: async (payload) => {
        sent.push(payload);
      }
    });

    await expect(service.deliverPasswordReset(user, "sent-token")).resolves.toEqual({ emailStatus: "sent" });
    expect(sent[0]).toMatchObject({ to: user.email, subject: expect.stringContaining("Reinitialisation") });
    expect(sent[0]?.body).toContain("sent-token");
  });
});
