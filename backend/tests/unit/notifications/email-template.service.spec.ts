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
});
