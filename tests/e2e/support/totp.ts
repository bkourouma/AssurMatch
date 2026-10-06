import { createHmac } from "node:crypto";

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the parameters of backend/src/modules/auth/mfa.service.ts.
// Written out instead of importing otplib so the test proves the enrolment secret works with any
// standard authenticator, not only with the library the backend happens to use.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/u, "").replace(/\s+/gu, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character in TOTP secret`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, at: number = Date.now(), period = 30, digits = 6): string {
  const counter = Math.floor(at / 1000 / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = (((hmac[offset] ?? 0) & 0x7f) << 24) | ((hmac[offset + 1] ?? 0) << 16) | ((hmac[offset + 2] ?? 0) << 8) | (hmac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Extracts the base32 secret from an `otpauth://` URI or returns the input when it is already one. */
export function secretFromOtpauth(uriOrSecret: string): string {
  if (!uriOrSecret.startsWith("otpauth://")) return uriOrSecret.trim();
  const secret = new URL(uriOrSecret).searchParams.get("secret");
  if (!secret) throw new Error("otpauth URI without secret");
  return secret;
}
