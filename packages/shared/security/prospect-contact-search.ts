/**
 * Spec 073 x lot 8 (spec 075): the admin search of a prospect by exact e-mail or phone.
 *
 * Nothing here hashes. A typed contact travels only in a POST body (admin server action, then the
 * admin API), and the API turns it into the keyed HMAC blind index of lot 8 (`PiiVault.blindIndex`),
 * with the legacy fingerprint (`legacyPiiFingerprint`, its single definition) as the fallback for
 * rows written before the encryption. An unsalted SHA-256 of a phone is enumerable, so no hash of a
 * contact is ever put in a URL, a query string, a response or an audit entry.
 */

export type ProspectContactKind = "email" | "phone";

/** True when the typed text is an e-mail address or a phone number (at least 7 digits, no letters). */
export function looksLikeProspectContact(input: string): boolean {
  const value = input.trim();
  if (value.includes("@")) return true;
  return /^\+?[\d\s.\-()]+$/.test(value) && (value.match(/\d/g) ?? []).length >= 7;
}

/**
 * The stored form of a typed contact: an e-mail trimmed and lower-cased, a phone without its
 * separators (prospects store `+<dial><digits>`). Undefined when the text is not a contact.
 */
export function normalizeTypedProspectContact(input: string): { kind: ProspectContactKind; value: string } | undefined {
  const value = input.trim();
  if (!looksLikeProspectContact(value)) return undefined;
  if (value.includes("@")) return { kind: "email", value: value.toLowerCase() };
  return { kind: "phone", value: value.replace(/[\s.\-()]/g, "") };
}
