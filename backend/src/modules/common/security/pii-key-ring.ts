/**
 * Lot 8 (spec 075 FR-A3): the key ring that protects personal data at rest.
 *
 *   PII_ENCRYPTION_KEYS          "keyId:base64,keyId2:base64" - AES-256 keys (exactly 32 bytes each)
 *   PII_ENCRYPTION_ACTIVE_KEY_ID the key that encrypts every new write (older keys stay readable)
 *   PII_BLIND_INDEX_KEY          base64, >= 32 bytes - HMAC key of the blind indexes (distinct from every
 *                                encryption key and from ENCRYPTION_KEY, which protects MFA secrets)
 *
 * Production runtimes (NODE_ENV=production or APP_ENV=production) refuse to start without the three
 * variables. Elsewhere, nothing configured means "disabled": the columns
 * keep being written in clear, as before the lot (local and test runtimes). A partial or invalid
 * configuration is always refused. Error messages name the variable, never a value nor a key.
 */

export const PII_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const PII_ENCRYPTION_KEY_BYTES = 32;
export const PII_BLIND_INDEX_KEY_MIN_BYTES = 32;

const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

export type PiiEnv = Record<string, string | undefined>;

/** A configuration problem. The message names the variable and the rule only. */
export class PiiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiiConfigurationError";
  }
}

export interface PiiKey {
  readonly id: string;
  readonly key: Buffer;
}

/**
 * Lot 8: every runtime started with NODE_ENV=production (production, the preproduction VPS and the
 * e2e stack all are) or APP_ENV=production must encrypt.
 */
export function piiEncryptionRequired(env: PiiEnv): boolean {
  return env.NODE_ENV === "production" || env.APP_ENV === "production";
}

function decodeBase64(raw: string, variable: string): Buffer {
  const value = raw.trim();
  if (!BASE64_PATTERN.test(value)) throw new PiiConfigurationError(`${variable} must be base64 encoded`);
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function parseKeys(raw: string): PiiKey[] {
  const keys: PiiKey[] = [];
  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) throw new PiiConfigurationError("PII_ENCRYPTION_KEYS must list at least one keyId:base64 entry");
  entries.forEach((entry, index) => {
    const separator = entry.indexOf(":");
    const id = separator > 0 ? entry.slice(0, separator).trim() : "";
    const material = separator > 0 ? entry.slice(separator + 1) : "";
    // The position only: the entry may be a pasted key without its id.
    if (!PII_KEY_ID_PATTERN.test(id) || !material) throw new PiiConfigurationError(`PII_ENCRYPTION_KEYS entry #${index + 1} must be keyId:base64 (keyId: letters, digits, - or _, at most 32)`);
    const key = decodeBase64(material, `PII_ENCRYPTION_KEYS entry #${index + 1}`);
    if (key.byteLength !== PII_ENCRYPTION_KEY_BYTES) throw new PiiConfigurationError(`PII_ENCRYPTION_KEYS entry #${index + 1} must decode to exactly ${PII_ENCRYPTION_KEY_BYTES} bytes`);
    if (keys.some((existing) => existing.id === id)) throw new PiiConfigurationError(`PII_ENCRYPTION_KEYS entry #${index + 1} repeats a key id`);
    if (keys.some((existing) => existing.key.equals(key))) throw new PiiConfigurationError(`PII_ENCRYPTION_KEYS entry #${index + 1} repeats a key`);
    keys.push({ id, key });
  });
  return keys;
}

export class PiiKeyRing {
  private readonly keys: ReadonlyMap<string, PiiKey>;

  constructor(keys: readonly PiiKey[], readonly activeKeyId: string | undefined, readonly blindIndexKey: Buffer | undefined) {
    this.keys = new Map(keys.map((key) => [key.id, key]));
    if (activeKeyId !== undefined && !this.keys.has(activeKeyId)) throw new PiiConfigurationError("PII_ENCRYPTION_ACTIVE_KEY_ID must name a key of PII_ENCRYPTION_KEYS");
    if (keys.length > 0 && activeKeyId === undefined) throw new PiiConfigurationError("PII_ENCRYPTION_ACTIVE_KEY_ID is required with PII_ENCRYPTION_KEYS");
    if (keys.length > 0 && !blindIndexKey) throw new PiiConfigurationError("PII_BLIND_INDEX_KEY is required with PII_ENCRYPTION_KEYS");
    if (blindIndexKey && blindIndexKey.byteLength < PII_BLIND_INDEX_KEY_MIN_BYTES) throw new PiiConfigurationError(`PII_BLIND_INDEX_KEY must decode to at least ${PII_BLIND_INDEX_KEY_MIN_BYTES} bytes`);
    if (blindIndexKey && keys.some((key) => key.key.equals(blindIndexKey))) throw new PiiConfigurationError("PII_BLIND_INDEX_KEY must differ from every PII encryption key");
  }

  /** No key at all: clear writes (local and test runtimes only). */
  static disabled(): PiiKeyRing {
    return new PiiKeyRing([], undefined, undefined);
  }

  /** Parses the ring from the environment; throws a `PiiConfigurationError` on any invalid value. */
  static fromEnv(env: PiiEnv = process.env): PiiKeyRing {
    const rawKeys = env.PII_ENCRYPTION_KEYS?.trim() ?? "";
    const rawActive = env.PII_ENCRYPTION_ACTIVE_KEY_ID?.trim() ?? "";
    const rawBlind = env.PII_BLIND_INDEX_KEY?.trim() ?? "";
    if (piiEncryptionRequired(env)) {
      const missing = [
        ["PII_ENCRYPTION_KEYS", rawKeys],
        ["PII_ENCRYPTION_ACTIVE_KEY_ID", rawActive],
        ["PII_BLIND_INDEX_KEY", rawBlind]
      ].filter(([, value]) => !value).map(([name]) => name);
      if (missing.length > 0) throw new PiiConfigurationError(`PII encryption is required with NODE_ENV=production or APP_ENV=production: missing ${missing.join(", ")}`);
    }
    if (!rawKeys && rawActive) throw new PiiConfigurationError("PII_ENCRYPTION_ACTIVE_KEY_ID is set without PII_ENCRYPTION_KEYS");
    const keys = rawKeys ? parseKeys(rawKeys) : [];
    const blind = rawBlind ? decodeBase64(rawBlind, "PII_BLIND_INDEX_KEY") : undefined;
    // The MFA key (ENCRYPTION_KEY, utf8, first 32 bytes used) must never double as a PII key.
    const mfaKey = env.ENCRYPTION_KEY ? Buffer.from(env.ENCRYPTION_KEY, "utf8").subarray(0, 32) : undefined;
    if (mfaKey && (keys.some((key) => key.key.equals(mfaKey)) || blind?.subarray(0, 32).equals(mfaKey))) {
      throw new PiiConfigurationError("PII keys must differ from ENCRYPTION_KEY");
    }
    return new PiiKeyRing(keys, rawActive || undefined, blind);
  }

  get encryptionEnabled(): boolean {
    return this.activeKeyId !== undefined;
  }

  get blindIndexEnabled(): boolean {
    return this.blindIndexKey !== undefined;
  }

  get keyIds(): string[] {
    return [...this.keys.keys()];
  }

  key(id: string): PiiKey | undefined {
    return this.keys.get(id);
  }

  activeKey(): PiiKey | undefined {
    return this.activeKeyId === undefined ? undefined : this.keys.get(this.activeKeyId);
  }
}

/** Lot 8: boot-time check called by `validateRuntimeEnvironment`. */
export function validatePiiEnvironment(env: PiiEnv): void {
  PiiKeyRing.fromEnv(env);
}
