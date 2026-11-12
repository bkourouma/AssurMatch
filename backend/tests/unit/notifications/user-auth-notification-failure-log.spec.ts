import { afterEach, describe, expect, it } from "vitest";
import { setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import { UserAuthNotificationService } from "../../../src/modules/notifications/user-auth-notification.service";
import type { UserAccount } from "../../../src/modules/users/users.module";

const user: UserAccount = {
  id: "user-technical-id-1",
  email: "invitee@example.com",
  displayName: "Invitee Person",
  roles: ["support_admin"],
  status: "invited",
  mfaStatus: "not_enrolled",
  countryScopes: [],
  productScopes: [],
  passwordChangeRequired: true,
  failedLoginCount: 0,
  mfaBackupCodesHashes: [],
  createdAt: new Date(),
  updatedAt: new Date()
};

const token = "activation-secret-token-abc123";
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

afterEach(() => setLogSink(undefined));

describe("auth e-mail delivery failure is logged without personal data", () => {
  it("logs type, user id and a cleaned message, and still resolves with failed", async () => {
    const entries: LogEntry[] = [];
    setLogSink((entry) => entries.push(entry));
    const service = new UserAuthNotificationService({
      send: async (payload) => {
        throw new Error(`SMTP timeout sending to ${payload.to} with ${token}`);
      }
    });

    await expect(service.deliverActivation(user, token, expiresAt)).resolves.toMatchObject({ emailStatus: "failed" });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "warn", event: "auth_email.delivery_failed", notification: "auth_activation", userId: user.id });
    const serialized = JSON.stringify(entries);
    expect(serialized).toContain("SMTP timeout");
    expect(serialized).not.toContain(user.email);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("/activate");
  });

  it("does not log when the sender succeeds", async () => {
    const entries: LogEntry[] = [];
    setLogSink((entry) => entries.push(entry));
    const service = new UserAuthNotificationService({ send: async () => ({ status: "sent", provider: "smtp" }) });
    await expect(service.deliverActivation(user, token, expiresAt)).resolves.toEqual({ emailStatus: "sent" });
    expect(entries).toEqual([]);
  });
});
