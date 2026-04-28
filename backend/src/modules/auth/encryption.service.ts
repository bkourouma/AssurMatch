import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH_BYTES = 12;
const TAG_LENGTH_BYTES = 16;

export class EncryptionService {
  private readonly key: Buffer;

  constructor(secret = process.env.ENCRYPTION_KEY ?? "test-encryption-key-at-least-32-bytes") {
    const key = Buffer.from(secret, "utf8");
    if (key.byteLength < 32) throw new Error("ENCRYPTION_KEY must be at least 32 bytes");
    this.key = key.subarray(0, 32);
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
  }

  decrypt(encrypted: string): string {
    const [encodedIv, encodedTag, encodedCiphertext] = encrypted.split(":");
    if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Invalid encrypted payload");
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.byteLength !== IV_LENGTH_BYTES || tag.byteLength !== TAG_LENGTH_BYTES) throw new Error("Invalid encrypted payload");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
