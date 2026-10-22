import { afterEach, describe, expect, it } from "vitest";
import { validateRuntimeEnvironment } from "../../../src/config/config.module";
import { PiiConfigurationError, PiiKeyRing, piiEncryptionRequired } from "../../../src/modules/common/security/pii-key-ring";
import { isEncryptedJson, legacyPiiFingerprint, PII_ENVELOPE_PREFIX, PiiCryptoError, piiEnvelopeKeyId, PiiVault } from "../../../src/modules/common/security/pii-vault";
import { setLogSink, type LogEntry } from "../../../src/modules/observability/structured-logger";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { envOf, randomKey, secretsOf, testRing, vaultOf } from "./pii-test-kit";

const EMAIL = "awa.kone@example.com";
const PHONE = "+2250102030405";

describe("PII vault (spec 075 FR-A1)", () => {
  const ring = testRing();
  const vault = vaultOf(ring);

  it("round-trips a field through a versioned envelope that never contains the value", () => {
    const envelope = vault.encryptField("prospect.emailNormalized", EMAIL);
    expect(envelope.startsWith(`${PII_ENVELOPE_PREFIX}k1:`)).toBe(true);
    expect(envelope.split(":")).toHaveLength(6);
    expect(envelope).not.toContain(EMAIL);
    expect(envelope).not.toContain("awa");
    expect(vault.decryptField("prospect.emailNormalized", envelope)).toBe(EMAIL);
    // Random IV: two encryptions of the same value differ.
    expect(vault.encryptField("prospect.emailNormalized", EMAIL)).not.toBe(envelope);
    expect(piiEnvelopeKeyId(envelope)).toBe("k1");
  });

  it("round-trips a JSON payload inside a {$enc} object", () => {
    const payload = { city: "Abidjan", contact: { email: EMAIL, phone: PHONE }, vehicle_value: 4500000, tags: ["a", "b"] };
    const stored = vault.encryptJson("quoteRequest.payload", payload);
    expect(isEncryptedJson(stored)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(EMAIL);
    expect(JSON.stringify(stored)).not.toContain("Abidjan");
    expect(vault.decryptJson("quoteRequest.payload", stored)).toEqual(payload);
    expect(piiEnvelopeKeyId(stored)).toBe("k1");
  });

  it("binds the envelope to its column (AAD): another column refuses it", () => {
    const envelope = vault.encryptField("prospect.emailNormalized", EMAIL);
    expect(() => vault.decryptField("prospect.phoneNormalized", envelope)).toThrow(PiiCryptoError);
    expect(() => vault.decryptJson("quoteRequest.payload", { $enc: envelope })).toThrow(/pii_authentication_failed/);
  });

  it("returns legacy clear values unchanged (transition)", () => {
    expect(vault.decryptField("prospect.emailNormalized", EMAIL)).toBe(EMAIL);
    expect(vault.decryptOptional("prospect.phoneNormalized", null)).toBeNull();
    const legacy = { city: "Abidjan", $enc: "not an envelope", other: 1 };
    expect(vault.decryptJson("quoteRequest.payload", legacy)).toBe(legacy);
    expect(vault.decryptJson("quoteRequest.payload", { vehicle_use: "prive" })).toEqual({ vehicle_use: "prive" });
  });

  it("reads every key of the ring and writes with the active one (rotation)", () => {
    const rotated = { keys: [...ring.keys, { id: "k2", key: randomKey() }], active: "k2", blind: ring.blind };
    const before = vault.encryptField("prospect.phoneNormalized", PHONE);
    const after = vaultOf(rotated);
    expect(after.decryptField("prospect.phoneNormalized", before)).toBe(PHONE);
    const written = after.encryptField("prospect.phoneNormalized", PHONE);
    expect(piiEnvelopeKeyId(written)).toBe("k2");
    expect(after.isCurrent(written)).toBe(true);
    expect(after.isCurrent(before)).toBe(false);
    // The old vault cannot read the new key.
    expect(() => vault.decryptField("prospect.phoneNormalized", written)).toThrow(/pii_unknown_key/);
  });

  it("fails explicitly without leaking the value, the envelope or the key", () => {
    const logs: LogEntry[] = [];
    setLogSink((entry) => logs.push(entry));
    try {
      const envelope = vault.encryptField("prospect.emailNormalized", EMAIL);
      const parts = envelope.split(":");
      const tamperedTag = [...parts.slice(0, 4), Buffer.alloc(16, 1).toString("base64url"), parts[5]].join(":");
      const failures: unknown[] = [];
      for (const value of [tamperedTag, `${PII_ENVELOPE_PREFIX}k1:broken`, envelope.replace(":k1:", ":zz:")]) {
        try {
          vault.decryptField("prospect.emailNormalized", value);
        } catch (error) {
          failures.push(error);
        }
      }
      expect(failures).toHaveLength(3);
      expect(failures.map((error) => (error as PiiCryptoError).code)).toEqual(["pii_authentication_failed", "pii_invalid_envelope", "pii_unknown_key"]);
      const text = JSON.stringify([failures.map((error) => `${(error as Error).name} ${(error as Error).message} ${(error as Error).stack ?? ""}`), logs]);
      expect(text).not.toContain(EMAIL);
      expect(text).not.toContain(parts[5]);
      for (const secret of secretsOf(ring)) expect(text).not.toContain(secret);
      expect(logs.map((entry) => entry.event)).toEqual(["pii.protection_failed", "pii.protection_failed", "pii.protection_failed"]);
    } finally {
      setLogSink(undefined);
    }
  });

  it("refuses an envelope when no key is configured instead of returning it", () => {
    const envelope = vault.encryptField("prospect.emailNormalized", EMAIL);
    expect(() => PiiVault.disabled().decryptField("prospect.emailNormalized", envelope)).toThrow(/pii_encryption_disabled/);
  });
});

describe("PII blind index (spec 075 FR-A2)", () => {
  const ring = testRing();
  const vault = vaultOf(ring);

  it("is deterministic on the normalised value, per kind, and differs from the legacy fingerprint", () => {
    const index = vault.blindIndex("email", EMAIL);
    expect(index).toMatch(/^[0-9a-f]{64}$/);
    expect(vault.blindIndex("email", ` ${EMAIL.toUpperCase()} `)).toBe(index);
    expect(vault.blindIndex("phone", EMAIL)).not.toBe(index);
    expect(index).not.toBe(legacyPiiFingerprint(EMAIL));
    expect(index).not.toBe(new ProspectIdentityService().fingerprint(EMAIL));
  });

  it("depends on the blind index key, not on the encryption keys", () => {
    const otherBlind = vaultOf({ ...ring, blind: randomKey() });
    const otherEncryption = vaultOf({ ...testRing(["k9"]), blind: ring.blind });
    expect(otherBlind.blindIndex("email", EMAIL)).not.toBe(vault.blindIndex("email", EMAIL));
    expect(otherEncryption.blindIndex("email", EMAIL)).toBe(vault.blindIndex("email", EMAIL));
  });

  it("keeps the legacy fingerprint identical to the pre-lot-8 identity service", () => {
    expect(new ProspectIdentityService().fingerprint("  Awa.Kone@Example.com ")).toBe(legacyPiiFingerprint(EMAIL));
    expect(legacyPiiFingerprint(EMAIL)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("PII key ring configuration (spec 075 FR-A3)", () => {
  const ring = testRing(["k2026a", "k2027a"], "k2027a");
  const mfaKey = "m".repeat(16) + "f".repeat(16);
  const base = { NODE_ENV: "production", APP_ENV: "production", DATABASE_URL: "postgresql://u:p@localhost:5432/db", REDIS_URL: "redis://localhost:6379", ENCRYPTION_KEY: mfaKey, EMAIL_SERVICE_TYPE: "disabled" };

  afterEach(() => setLogSink(undefined));

  it("is disabled without keys outside production: clear writes as before", () => {
    const vault = PiiVault.fromEnv({ NODE_ENV: "test" });
    expect(vault.enabled).toBe(false);
    expect(vault.blindIndexEnabled).toBe(false);
    expect(vault.encryptField("prospect.emailNormalized", EMAIL)).toBe(EMAIL);
    expect(vault.encryptJson("quoteRequest.payload", { a: 1 })).toEqual({ a: 1 });
    expect(vault.blindIndex("email", EMAIL)).toBeUndefined();
    // Blind index only (no encryption key) is allowed outside production.
    const indexOnly = PiiVault.fromEnv({ NODE_ENV: "development", PII_BLIND_INDEX_KEY: ring.blind.toString("base64") });
    expect(indexOnly.enabled).toBe(false);
    expect(indexOnly.blindIndex("email", EMAIL)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parses the ring from the environment", () => {
    const vault = PiiVault.fromEnv({ NODE_ENV: "production", ...envOf(ring) });
    expect(vault.enabled).toBe(true);
    expect(vault.activeKeyId).toBe("k2027a");
    expect(vault.keyIds).toEqual(["k2026a", "k2027a"]);
    expect(piiEncryptionRequired({ NODE_ENV: "production", APP_ENV: "staging" })).toBe(true);
    expect(piiEncryptionRequired({ APP_ENV: "production" })).toBe(true);
    expect(piiEncryptionRequired({ NODE_ENV: "development", APP_ENV: "local" })).toBe(false);
  });

  it("refuses to start in production without the three variables", () => {
    for (const missing of ["PII_ENCRYPTION_KEYS", "PII_ENCRYPTION_ACTIVE_KEY_ID", "PII_BLIND_INDEX_KEY"]) {
      const env: Record<string, string | undefined> = { ...base, ...envOf(ring), [missing]: undefined };
      expect(() => validateRuntimeEnvironment(env)).toThrow(new RegExp(`missing ${missing}`));
    }
    expect(() => validateRuntimeEnvironment({ ...base, ...envOf(ring) })).not.toThrow();
  });

  it("refuses invalid or partial configurations with messages free of any value", () => {
    const valid = envOf(ring);
    const pasted = randomKey().toString("base64");
    const cases: Array<Record<string, string>> = [
      { ...valid, PII_ENCRYPTION_KEYS: pasted },
      { ...valid, PII_ENCRYPTION_KEYS: `k1:${randomKey(16).toString("base64")}` },
      { ...valid, PII_ENCRYPTION_KEYS: `k1:${pasted},k1:${randomKey().toString("base64")}` },
      { ...valid, PII_ENCRYPTION_KEYS: "bad id:abc" },
      { ...valid, PII_ENCRYPTION_ACTIVE_KEY_ID: "unknown" },
      { ...valid, PII_BLIND_INDEX_KEY: randomKey(16).toString("base64") },
      { ...valid, PII_BLIND_INDEX_KEY: ring.keys[0]!.key.toString("base64") },
      { ...valid, PII_BLIND_INDEX_KEY: "***not base64***" },
      { PII_ENCRYPTION_KEYS: valid.PII_ENCRYPTION_KEYS!, PII_ENCRYPTION_ACTIVE_KEY_ID: "k2027a" },
      { PII_ENCRYPTION_ACTIVE_KEY_ID: "k2027a" },
      // The MFA key must never double as a PII key.
      { ...valid, PII_ENCRYPTION_KEYS: `k2027a:${Buffer.from(mfaKey, "utf8").toString("base64")}`, ENCRYPTION_KEY: mfaKey }
    ];
    for (const env of cases) {
      let message = "";
      try {
        PiiKeyRing.fromEnv({ NODE_ENV: "development", ...env });
      } catch (error) {
        expect(error).toBeInstanceOf(PiiConfigurationError);
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(Object.keys(env))).not.toBe("");
      for (const secret of [...secretsOf(ring), pasted]) expect(message).not.toContain(secret);
    }
  });

  it("keeps the runtime validation order: earlier errors still win", () => {
    expect(() => validateRuntimeEnvironment({ NODE_ENV: "production", APP_ENV: "production", REDIS_URL: "redis://localhost:6379" })).toThrow(/DATABASE_URL is required/);
    expect(() => validateRuntimeEnvironment({ NODE_ENV: "test" })).not.toThrow();
  });
});
