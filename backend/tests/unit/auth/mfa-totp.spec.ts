import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { MfaService } from "../../../src/modules/auth/mfa.service";
import type { UserAccount } from "../../../src/modules/users/users.module";

describe("MfaService TOTP", () => {
  it("enrolls and verifies a generated TOTP secret", async () => {
    const user: UserAccount = {
      id: "user-1",
      email: "mfa@example.com",
      displayName: "MFA User",
      roles: ["support_admin"],
      status: "active",
      mfaStatus: "required",
      countryScopes: [],
      productScopes: [],
      passwordChangeRequired: false,
      failedLoginCount: 0,
      mfaBackupCodesHashes: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const service = new MfaService();
    const enrollment = await service.enroll(user);
    const token = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30 });
    const now = Math.floor(Date.now() / 1000);
    const previousStepToken = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30, epoch: now - 30 });
    const nextStepToken = await generate({ secret: enrollment.secret, strategy: "totp", digits: 6, period: 30, epoch: now + 30 });

    expect(enrollment.otpauthUri).toContain("otpauth://totp/");
    expect(await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: enrollment.backupCodeHashes }, token)).toEqual({ verified: true });
    expect(await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: enrollment.backupCodeHashes }, previousStepToken)).toEqual({ verified: true });
    expect(await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: enrollment.backupCodeHashes }, nextStepToken)).toEqual({ verified: true });
    expect(await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: enrollment.backupCodeHashes }, "000000")).toEqual({ verified: false });
  }, 20_000);
});
