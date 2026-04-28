import { describe, expect, it } from "vitest";
import { MfaService } from "../../../src/modules/auth/mfa.service";
import type { UserAccount } from "../../../src/modules/users/users.module";

describe("MfaService backup codes", () => {
  it("generates eight single-use backup codes", async () => {
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
    const code = enrollment.backupCodes[0] ?? "";
    const result = await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: enrollment.backupCodeHashes }, code, "backup");

    expect(enrollment.backupCodes).toHaveLength(8);
    expect(enrollment.backupCodeHashes[0]).toContain("$argon2id$");
    expect(result.verified).toBe(true);
    expect(result.backupCodeHashes?.[0]).toBe("");
    expect(await service.verify({ ...user, mfaSecretEncrypted: enrollment.encryptedSecret, mfaBackupCodesHashes: result.backupCodeHashes ?? [] }, code, "backup")).toEqual({ verified: false });
  }, 30_000);
});
