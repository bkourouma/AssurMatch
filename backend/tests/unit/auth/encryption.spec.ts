import { describe, expect, it } from "vitest";
import { EncryptionService } from "../../../src/modules/auth/encryption.service";

describe("EncryptionService", () => {
  it("round-trips MFA secret material without exposing plaintext in ciphertext", () => {
    const service = new EncryptionService("12345678901234567890123456789012");
    const encrypted = service.encrypt("totp-secret-value");
    expect(encrypted).not.toContain("totp-secret-value");
    expect(service.decrypt(encrypted)).toBe("totp-secret-value");
  });

  it("rejects tampered ciphertext", () => {
    const service = new EncryptionService("12345678901234567890123456789012");
    const encrypted = service.encrypt("totp-secret-value");
    expect(() => service.decrypt(`${encrypted}x`)).toThrow();
  });

  it("rejects the wrong key", () => {
    const encrypted = new EncryptionService("12345678901234567890123456789012").encrypt("totp-secret-value");
    expect(() => new EncryptionService("abcdefghijklmnopqrstuvwxyz123456").decrypt(encrypted)).toThrow();
  });
});
