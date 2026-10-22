import { createHash } from "node:crypto";

/**
 * Spec 073: single definition of the prospect contact fingerprint (SHA-256 of `assurmatch:<value>`),
 * used by the prospect identity service and by the admin search so a typed e-mail or phone is
 * hashed before it leaves the admin server: it never travels in a URL, a query string or a log.
 */
export function prospectContactFingerprint(value: string): string {
  return createHash("sha256").update(`assurmatch:${value.trim().toLowerCase()}`).digest("hex");
}

/** True when the typed text is an e-mail address or a phone number (at least 7 digits, no letters). */
export function looksLikeProspectContact(input: string): boolean {
  const value = input.trim();
  if (value.includes("@")) return true;
  return /^\+?[\d\s.\-()]+$/.test(value) && (value.match(/\d/g) ?? []).length >= 7;
}

/** The fingerprint of a typed e-mail, or of a phone without separators (stored as `+<dial><digits>`). */
export function fingerprintTypedProspectContact(input: string): string {
  const value = input.trim();
  return prospectContactFingerprint(value.includes("@") ? value : value.replace(/[\s.\-()]/g, ""));
}
