import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { logEvent } from "../../observability/structured-logger";
import { PiiKeyRing, type PiiEnv } from "./pii-key-ring";

/**
 * Lot 8 (spec 075 FR-A1, FR-A2, FR-A5): application-level encryption of personal data at rest.
 *
 * - A field is stored as the versioned envelope `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>` (AES-256-GCM,
 *   96-bit random IV, 128-bit tag, base64url parts). The additional authenticated data is the field
 *   name, so an envelope copied into another column (or JSON payload) fails to decrypt.
 * - A JSON column keeps its type: the envelope is stored as `{"$enc": "enc:v1:..."}`.
 * - A value that is not an envelope is a legacy clear value and is returned unchanged (transition).
 * - Blind index = HMAC-SHA256(PII_BLIND_INDEX_KEY, "<kind>:<normalised value>"), hex. It replaces the
 *   unsalted `assurmatch:` SHA-256 fingerprint, which stays readable for the transition only.
 *
 * Disabled (no key, local/test only): encryption is a no-op and blind indexes are computed only
 * when PII_BLIND_INDEX_KEY is present. Errors carry a code and the field name, never a value or key.
 * The vault holds no global state: build one with `PiiVault.fromEnv(env)` or inject a test ring.
 */

export const PII_ENVELOPE_VERSION = "v1";
export const PII_ENVELOPE_PREFIX = `enc:${PII_ENVELOPE_VERSION}:`;
/** The single key of an encrypted JSON column. */
export const PII_JSON_ENVELOPE_KEY = "$enc";

/** Every encrypted column, used as additional authenticated data. */
export type PiiField = "prospect.emailNormalized" | "prospect.phoneNormalized" | "quoteRequest.payload";
export type BlindIndexKind = "email" | "phone";

export type PiiCryptoErrorCode =
  | "pii_invalid_envelope"
  | "pii_unknown_key"
  | "pii_authentication_failed"
  | "pii_invalid_json"
  | "pii_encryption_disabled";

/** A decryption or encryption failure. The message names the code and the field only. */
export class PiiCryptoError extends Error {
  constructor(readonly code: PiiCryptoErrorCode, readonly field: PiiField) {
    super(`PII protection failed (${code}) on ${field}`);
    this.name = "PiiCryptoError";
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

function aad(field: PiiField): Buffer {
  return Buffer.from(`assurmatch:pii:${PII_ENVELOPE_VERSION}:${field}`, "utf8");
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** The pre-lot-8 unsalted fingerprint (`ProspectIdentityService.fingerprint`), read during the transition. */
export function legacyPiiFingerprint(value: string): string {
  return createHash("sha256").update(`assurmatch:${normalise(value)}`).digest("hex");
}

export function isPiiEnvelope(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PII_ENVELOPE_PREFIX);
}

/** `{"$enc": "enc:v1:..."}` and nothing else. */
export function isEncryptedJson(value: unknown): value is { [PII_JSON_ENVELOPE_KEY]: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === PII_JSON_ENVELOPE_KEY && isPiiEnvelope((value as Record<string, unknown>)[PII_JSON_ENVELOPE_KEY]);
}

/** The key id an envelope was written with, or undefined for a clear value. */
export function piiEnvelopeKeyId(value: unknown): string | undefined {
  const envelope = isEncryptedJson(value) ? value[PII_JSON_ENVELOPE_KEY] : value;
  if (!isPiiEnvelope(envelope)) return undefined;
  return envelope.slice(PII_ENVELOPE_PREFIX.length).split(":")[0] || undefined;
}

export class PiiVault {
  constructor(private readonly ring: PiiKeyRing) {}

  static fromEnv(env: PiiEnv = process.env): PiiVault {
    return new PiiVault(PiiKeyRing.fromEnv(env));
  }

  static disabled(): PiiVault {
    return new PiiVault(PiiKeyRing.disabled());
  }

  /** New writes are encrypted. */
  get enabled(): boolean {
    return this.ring.encryptionEnabled;
  }

  get blindIndexEnabled(): boolean {
    return this.ring.blindIndexEnabled;
  }

  get activeKeyId(): string | undefined {
    return this.ring.activeKeyId;
  }

  get keyIds(): string[] {
    return this.ring.keyIds;
  }

  /** Encrypts with the active key; returns the value unchanged when encryption is disabled. */
  encryptField(field: PiiField, value: string): string {
    const key = this.ring.activeKey();
    if (!key) return value;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(field));
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PII_ENVELOPE_PREFIX}${key.id}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
  }

  /** Same as `encryptField`; null and undefined pass through. */
  encryptOptional<T extends string | null | undefined>(field: PiiField, value: T): T | string {
    return typeof value === "string" ? this.encryptField(field, value) : value;
  }

  /** Decrypts an envelope (any key of the ring); a non-envelope is a legacy clear value, returned as is. */
  decryptField(field: PiiField, value: string): string {
    if (!isPiiEnvelope(value)) return value;
    const parts = value.slice(PII_ENVELOPE_PREFIX.length).split(":");
    if (parts.length !== 4) return this.fail("pii_invalid_envelope", field);
    const [keyId, encodedIv, encodedTag, encodedCiphertext] = parts as [string, string, string, string];
    const key = this.ring.key(keyId);
    if (!key) return this.fail(this.ring.keyIds.length === 0 ? "pii_encryption_disabled" : "pii_unknown_key", field);
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) return this.fail("pii_invalid_envelope", field);
    try {
      const decipher = createDecipheriv(ALGORITHM, key.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(aad(field));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      return this.fail("pii_authentication_failed", field);
    }
  }

  /** Same as `decryptField`; null and undefined pass through. */
  decryptOptional<T extends string | null | undefined>(field: PiiField, value: T): T | string {
    return typeof value === "string" ? this.decryptField(field, value) : value;
  }

  /** `{"$enc": envelope}` of the JSON value; the value itself when encryption is disabled. */
  encryptJson(field: PiiField, value: unknown): unknown {
    if (!this.enabled || value === undefined) return value;
    return { [PII_JSON_ENVELOPE_KEY]: this.encryptField(field, JSON.stringify(value)) };
  }

  /** The JSON value of `{"$enc": envelope}`; any other value is legacy clear JSON, returned as is. */
  decryptJson(field: PiiField, value: unknown): unknown {
    if (!isEncryptedJson(value)) return value;
    const text = this.decryptField(field, value[PII_JSON_ENVELOPE_KEY]);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return this.fail("pii_invalid_json", field);
    }
  }

  /** True when the value is an envelope written with the active key (nothing to rotate). */
  isCurrent(value: unknown): boolean {
    const keyId = piiEnvelopeKeyId(value);
    return keyId !== undefined && keyId === this.ring.activeKeyId;
  }

  /** HMAC blind index of a normalised value; undefined without PII_BLIND_INDEX_KEY. */
  blindIndex(kind: BlindIndexKind, value: string): string | undefined {
    const key = this.ring.blindIndexKey;
    if (!key) return undefined;
    return createHmac("sha256", key).update(`${kind}:${normalise(value)}`, "utf8").digest("hex");
  }

  legacyFingerprint(value: string): string {
    return legacyPiiFingerprint(value);
  }

  private fail(code: PiiCryptoErrorCode, field: PiiField): never {
    // Code and field only: never the value, the envelope, the key or its id.
    logEvent("error", "pii.protection_failed", { code, field });
    throw new PiiCryptoError(code, field);
  }
}
