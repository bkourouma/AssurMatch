import { legacyPiiFingerprint, type PiiField, type PiiVault } from "./pii-vault";

/**
 * Lot 8 (spec 075 FR-A6): the only file that knows which Prospect and QuoteRequest columns are
 * encrypted. Repositories call these codecs on write and read; everything above them keeps handling
 * clear `ProspectRecord` values and payloads (the domain does not change).
 */

export const PROSPECT_EMAIL_FIELD: PiiField = "prospect.emailNormalized";
export const PROSPECT_PHONE_FIELD: PiiField = "prospect.phoneNormalized";
export const QUOTE_PAYLOAD_FIELD: PiiField = "quoteRequest.payload";

/** The lot 8 columns that never leave the repository layer. */
const PROSPECT_STORAGE_COLUMNS = ["emailBlindIndex", "phoneBlindIndex", "piiKeyId"] as const;

export interface ProspectContactValues {
  emailNormalized: string;
  phoneNormalized: string;
  emailFingerprint: string;
  phoneFingerprint: string;
}

/**
 * Column values of a new prospect row. Encrypted: envelopes, blind indexes and the key id, and no
 * legacy fingerprint (FR-A2). Disabled: the clear values and legacy fingerprints exactly as before;
 * the blind indexes only when PII_BLIND_INDEX_KEY is present (so a stale Prisma client without the
 * lot 8 columns keeps working in local runtimes without keys).
 */
export function prospectContactColumns(vault: PiiVault, contact: ProspectContactValues): Record<string, unknown> {
  const emailBlindIndex = vault.blindIndex("email", contact.emailNormalized);
  const phoneBlindIndex = vault.blindIndex("phone", contact.phoneNormalized);
  if (!vault.enabled) {
    return {
      emailNormalized: contact.emailNormalized,
      phoneNormalized: contact.phoneNormalized,
      emailFingerprint: contact.emailFingerprint,
      phoneFingerprint: contact.phoneFingerprint,
      ...(emailBlindIndex ? { emailBlindIndex } : {}),
      ...(phoneBlindIndex ? { phoneBlindIndex } : {})
    };
  }
  return {
    emailNormalized: vault.encryptField(PROSPECT_EMAIL_FIELD, contact.emailNormalized),
    phoneNormalized: vault.encryptField(PROSPECT_PHONE_FIELD, contact.phoneNormalized),
    emailFingerprint: null,
    phoneFingerprint: null,
    emailBlindIndex,
    phoneBlindIndex,
    piiKeyId: vault.activeKeyId
  };
}

/**
 * Where fragment of the rows carrying this very e-mail AND phone (spec 066 F1): encrypted rows by
 * blind index, legacy clear rows by the old fingerprint, during the whole transition.
 */
export function prospectContactMatch(vault: PiiVault, contact: Pick<ProspectContactValues, "emailNormalized" | "phoneNormalized" | "emailFingerprint" | "phoneFingerprint">): Record<string, unknown> {
  const legacy = { emailFingerprint: contact.emailFingerprint, phoneFingerprint: contact.phoneFingerprint };
  const emailBlindIndex = vault.blindIndex("email", contact.emailNormalized);
  const phoneBlindIndex = vault.blindIndex("phone", contact.phoneNormalized);
  if (!emailBlindIndex || !phoneBlindIndex) return legacy;
  return { OR: [{ emailBlindIndex, phoneBlindIndex }, legacy] };
}

/**
 * Domain view of a prospect row: clear e-mail and phone, the legacy fingerprints the domain still
 * compares (tracking link check, consent subject reference) recomputed from the clear values, and
 * no lot 8 storage column.
 */
export function prospectRowToDomain(vault: PiiVault, row: unknown): Record<string, unknown> {
  const record = { ...(row as Record<string, unknown>) };
  if (typeof record.emailNormalized === "string") record.emailNormalized = vault.decryptField(PROSPECT_EMAIL_FIELD, record.emailNormalized);
  if (typeof record.phoneNormalized === "string") record.phoneNormalized = vault.decryptField(PROSPECT_PHONE_FIELD, record.phoneNormalized);
  if (!record.emailFingerprint && typeof record.emailNormalized === "string") record.emailFingerprint = legacyPiiFingerprint(record.emailNormalized);
  if (!record.phoneFingerprint && typeof record.phoneNormalized === "string") record.phoneFingerprint = legacyPiiFingerprint(record.phoneNormalized);
  for (const column of PROSPECT_STORAGE_COLUMNS) delete record[column];
  return record;
}

/** Clear e-mail / phone of a projected prospect row (lead enrichment). */
export function decryptProspectContact<T extends { emailNormalized?: string | null | undefined; phoneNormalized?: string | null | undefined }>(vault: PiiVault, row: T): T {
  return {
    ...row,
    ...(typeof row.emailNormalized === "string" ? { emailNormalized: vault.decryptField(PROSPECT_EMAIL_FIELD, row.emailNormalized) } : {}),
    ...(typeof row.phoneNormalized === "string" ? { phoneNormalized: vault.decryptField(PROSPECT_PHONE_FIELD, row.phoneNormalized) } : {})
  };
}

/**
 * Erasure keys of one prospect row (spec 046 D3): the legacy fingerprint, still the key of the
 * contact messages, waiting list and partner applications (not encrypted in this lot), and the
 * blind index of the prospects written encrypted. Both are computed in memory only.
 */
export function prospectErasureKeys(vault: PiiVault, row: { emailFingerprint?: string | null | undefined; emailNormalized?: string | null | undefined; emailBlindIndex?: string | null | undefined } | null | undefined): { emailFingerprint: string | undefined; emailBlindIndex: string | undefined } {
  if (!row) return { emailFingerprint: undefined, emailBlindIndex: undefined };
  const email = typeof row.emailNormalized === "string" ? vault.decryptField(PROSPECT_EMAIL_FIELD, row.emailNormalized) : undefined;
  return {
    emailFingerprint: row.emailFingerprint || (email ? legacyPiiFingerprint(email) : undefined),
    emailBlindIndex: row.emailBlindIndex || (email ? vault.blindIndex("email", email) : undefined)
  };
}

/** Prospect columns cleared by an anonymization (D5), lot 8 columns included. */
export function prospectAnonymizedPiiColumns(vault: PiiVault): Record<string, null> {
  return vault.enabled || vault.blindIndexEnabled ? { emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null } : {};
}

/** Quote request columns cleared by an anonymization: the D5 marker payload is clear JSON, no key id. */
export function quoteAnonymizedPiiColumns(vault: PiiVault): Record<string, null> {
  return vault.enabled ? { piiKeyId: null } : {};
}

/** Quote request data with an encrypted payload and its key id (payload untouched when disabled or absent). */
export function quotePayloadColumns(vault: PiiVault, data: Record<string, unknown>): Record<string, unknown> {
  if (data.payload === undefined || !vault.enabled) return data;
  return { ...data, payload: vault.encryptJson(QUOTE_PAYLOAD_FIELD, data.payload), piiKeyId: vault.activeKeyId };
}

/** Domain view of a quote request row: clear payload, no key id. */
export function quoteRowToDomain(vault: PiiVault, row: unknown): Record<string, unknown> {
  const record = { ...(row as Record<string, unknown>) };
  if ("payload" in record) record.payload = vault.decryptJson(QUOTE_PAYLOAD_FIELD, record.payload);
  delete record.piiKeyId;
  return record;
}

/** Clear payload of a projected quote request row (lead enrichment). */
export function decryptQuotePayload(vault: PiiVault, payload: unknown): unknown {
  return vault.decryptJson(QUOTE_PAYLOAD_FIELD, payload);
}
