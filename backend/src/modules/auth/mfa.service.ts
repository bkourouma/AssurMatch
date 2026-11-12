import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import type { UserAccount } from "../users/users.module";
import { EncryptionService } from "./encryption.service";
import { PasswordHashingService } from "./password-hashing.service";

export interface MfaChallenge {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
  encryptedSecret: string;
  backupCodeHashes: string[];
}

export interface MfaVerifyResult {
  verified: boolean;
  backupCodeHashes?: string[];
  /** Backup code only: the stored hash that matched; the caller must consume it atomically (`consumeBackupCode`). */
  consumedBackupCodeHash?: string;
  /** TOTP only: the time step (epoch seconds / 30) that validated the code, to refuse its replay. */
  totpCounter?: number;
}

export class MfaService {
  constructor(
    private readonly encryption = new EncryptionService(),
    private readonly hashing = new PasswordHashingService()
  ) {}

  async enroll(user: UserAccount): Promise<MfaChallenge> {
    const secret = generateSecret({ length: 32 });
    const backupCodes = Array.from({ length: 8 }, () => randomBytes(5).toString("hex"));
    const backupCodeHashes = await Promise.all(backupCodes.map((code) => this.hashing.hash(code)));
    return {
      secret,
      otpauthUri: generateURI({ issuer: "AssurMatch", label: user.email, secret, strategy: "totp", digits: 6, period: 30 }),
      backupCodes,
      encryptedSecret: this.encryption.encrypt(secret),
      backupCodeHashes
    };
  }

  async verify(user: UserAccount, code: string, kind: "totp" | "backup" = "totp"): Promise<MfaVerifyResult> {
    if (kind === "backup") return this.verifyBackupCode(user, code);
    if (!user.mfaSecretEncrypted) return { verified: false };
    const secret = this.encryption.decrypt(user.mfaSecretEncrypted);
    // The epoch is fixed once so the matched step is exact: step = floor(epoch / 30) + delta.
    const epoch = Math.floor(Date.now() / 1000);
    const result = await verify({ token: code, secret, strategy: "totp", digits: 6, period: 30, epochTolerance: 30, epoch });
    if (!result.valid) return { verified: false };
    return { verified: true, totpCounter: Math.floor(epoch / 30) + result.delta };
  }

  private async verifyBackupCode(user: UserAccount, code: string): Promise<MfaVerifyResult> {
    for (let index = 0; index < user.mfaBackupCodesHashes.length; index += 1) {
      const hash = user.mfaBackupCodesHashes[index];
      if (hash && await this.hashing.verify(hash, code)) {
        const next = [...user.mfaBackupCodesHashes];
        next[index] = "";
        return { verified: true, backupCodeHashes: next, consumedBackupCodeHash: hash };
      }
    }
    return { verified: false };
  }
}
