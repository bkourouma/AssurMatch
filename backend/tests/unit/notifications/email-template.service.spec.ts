import { describe, expect, it } from "vitest";
import { AuthEmailTemplateService } from "../../../src/modules/notifications/email/email-template.service";
import type { UserAccount } from "../../../src/modules/users/users.module";

const user: UserAccount = {
  id: "user-1",
  email: "user@example.test",
  displayName: "Ava Admin",
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

describe("auth email templates", () => {
  it("renders activation text and HTML with safe platform wording", () => {
    const template = new AuthEmailTemplateService({ appBaseUrl: "https://admin.assurmatch.test" });
    const email = template.activation(user, "activation-token");

    expect(email).toMatchObject({
      to: user.email,
      subject: "Activation de votre acces AssurMatch",
      purpose: "auth_activation"
    });
    expect(email.body).toContain("activation-token");
    expect(email.body).toContain("plateforme technique");
    expect(email.html).toContain("activation-token");
    expect(email.body.toLowerCase()).not.toContain("souscrire maintenant");
    expect(email.body.toLowerCase()).not.toContain("contrat valide");
    expect(email.body.toLowerCase()).not.toContain("garantie acceptee");
  });

  it("renders reset link with encoded token", () => {
    const template = new AuthEmailTemplateService({ appBaseUrl: "https://admin.assurmatch.test/" });
    const email = template.passwordReset(user, "reset token");

    expect(email.purpose).toBe("auth_password_reset");
    expect(email.body).toContain("https://admin.assurmatch.test/password-reset?token=reset%20token");
    expect(email.subject).toContain("Reinitialisation");
  });

  it("sends broker users to the broker back-office, never to the admin one", () => {
    const template = new AuthEmailTemplateService({ appBaseUrl: "https://admin.assurmatch.test", brokerAppUrl: "https://pro.assurmatch.test/" });
    const broker: UserAccount = { ...user, roles: ["broker_owner_starter"], partnerTenantId: "partner-1" };
    expect(template.activation(broker, "tok").body).toContain("https://pro.assurmatch.test/activate?token=tok");
    expect(template.passwordReset(broker, "tok").body).toContain("https://pro.assurmatch.test/password-reset?token=tok");
    expect(template.passwordReset(broker, "tok").body).not.toContain("admin.assurmatch.test");
    // A partner-attached account is a broker account even before a role is granted.
    expect(template.activation({ ...user, roles: [], partnerTenantId: "partner-1" }, "tok").body).toContain("https://pro.assurmatch.test/activate");
    expect(template.activation({ ...user, roles: ["broker_agent"] }, "tok").body).toContain("https://pro.assurmatch.test/activate");
    // Platform admins keep the admin back-office.
    expect(template.activation(user, "tok").body).toContain("https://admin.assurmatch.test/activate?token=tok");
  });

  it("reads BROKER_APP_URL for broker users when no option is given", () => {
    const previous = { app: process.env.APP_BASE_URL, broker: process.env.BROKER_APP_URL };
    process.env.APP_BASE_URL = "https://admin.env.test";
    process.env.BROKER_APP_URL = "https://pro.env.test";
    try {
      const template = new AuthEmailTemplateService();
      expect(template.passwordReset({ ...user, roles: ["broker_manager"], partnerTenantId: "partner-1" }, "tok").body).toContain("https://pro.env.test/password-reset?token=tok");
      expect(template.passwordReset(user, "tok").body).toContain("https://admin.env.test/password-reset?token=tok");
    } finally {
      if (previous.app === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previous.app;
      if (previous.broker === undefined) delete process.env.BROKER_APP_URL; else process.env.BROKER_APP_URL = previous.broker;
    }
  });
});
