import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuditEntry } from "../types";

/**
 * Spec 075 FR-B3: tamper evidence for "AuditLog". Each row carries the HMAC-SHA256 (hex) of its
 * canonical form and the id of the key that signed it, so a key rotation never invalidates the
 * history. Keys come from AUDIT_INTEGRITY_KEYS ("keyId:base64,keyId2:base64") and the signing key id
 * from AUDIT_INTEGRITY_ACTIVE_KEY_ID. There is NO default key: without a configuration the rows are
 * stored unsigned (columns NULL), which the verification script reports as "missing signature".
 */
export interface AuditIntegrityFields {
  integrityHash: string | null;
  integrityKeyId: string | null;
}

/** The row fields the signature covers, as read back from the database. */
export type AuditIntegritySubject = Pick<AuditEntry, "id" | "action" | "targetType" | "targetId" | "scope" | "result" | "context"> & {
  actorId?: string | null | undefined;
  reason?: string | null | undefined;
  correlationId?: string | null | undefined;
  occurredAt: Date | string;
  retentionUntil: Date | string;
};

export type AuditVerification = "ok" | "missing" | "invalid";

export type AuditIntegrityKeyring = Map<string, Buffer>;

export function parseAuditIntegrityKeys(raw: string | undefined = process.env.AUDIT_INTEGRITY_KEYS): AuditIntegrityKeyring {
  const keyring: AuditIntegrityKeyring = new Map();
  for (const part of (raw ?? "").split(",")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;
    const keyId = trimmed.slice(0, separator).trim();
    const secret = Buffer.from(trimmed.slice(separator + 1).trim(), "base64");
    if (keyId && secret.length >= 16) keyring.set(keyId, secret);
  }
  return keyring;
}

export function activeAuditIntegrityKeyId(keyring: AuditIntegrityKeyring, configured: string | undefined = process.env.AUDIT_INTEGRITY_ACTIVE_KEY_ID): string | undefined {
  const wanted = configured?.trim();
  if (wanted) return keyring.has(wanted) ? wanted : undefined;
  // A single configured key needs no explicit active id.
  return keyring.size === 1 ? [...keyring.keys()][0] : undefined;
}

/** True when a signing key is configured (used for the production start-up warning). */
export function auditIntegrityConfigured(): boolean {
  const keyring = parseAuditIntegrityKeys();
  return activeAuditIntegrityKeyId(keyring) !== undefined;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested !== undefined) output[key] = stable(nested);
    }
    return output;
  }
  return value;
}

/** Canonical JSON (sorted keys, ISO dates, absent optionals as null) of the signed fields. */
export function canonicalAuditEntry(entry: AuditIntegritySubject): string {
  return JSON.stringify(stable({
    action: entry.action,
    actorId: entry.actorId ?? null,
    context: entry.context ?? {},
    correlationId: entry.correlationId ?? null,
    id: entry.id,
    occurredAt: iso(entry.occurredAt),
    reason: entry.reason ?? null,
    result: entry.result,
    retentionUntil: iso(entry.retentionUntil),
    scope: entry.scope ?? {},
    targetId: entry.targetId,
    targetType: entry.targetType
  }));
}

export function computeAuditHmac(entry: AuditIntegritySubject, secret: Buffer): string {
  return createHmac("sha256", secret).update(canonicalAuditEntry(entry)).digest("hex");
}

/** Signs with the active key; `null` columns when no key is configured. */
export function signAuditEntry(entry: AuditIntegritySubject, keyring: AuditIntegrityKeyring = parseAuditIntegrityKeys(), activeKeyId: string | undefined = activeAuditIntegrityKeyId(keyring)): AuditIntegrityFields {
  const secret = activeKeyId ? keyring.get(activeKeyId) : undefined;
  if (!activeKeyId || !secret) return { integrityHash: null, integrityKeyId: null };
  return { integrityHash: computeAuditHmac(entry, secret), integrityKeyId: activeKeyId };
}

/**
 * `missing`: no signature stored (legacy row, or written without a key). `invalid`: the signature
 * does not match (altered row) or its key id is unknown to the keyring (cannot be proven).
 */
export function verifyAuditEntry(
  entry: AuditIntegritySubject,
  row: { integrityHash?: string | null | undefined; integrityKeyId?: string | null | undefined },
  keyring: AuditIntegrityKeyring = parseAuditIntegrityKeys()
): AuditVerification {
  if (!row.integrityHash || !row.integrityKeyId) return "missing";
  const secret = keyring.get(row.integrityKeyId);
  if (!secret) return "invalid";
  const expected = Buffer.from(computeAuditHmac(entry, secret), "utf8");
  const presented = Buffer.from(row.integrityHash, "utf8");
  return expected.length === presented.length && timingSafeEqual(expected, presented) ? "ok" : "invalid";
}
