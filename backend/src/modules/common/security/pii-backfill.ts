import { legacyPiiFingerprint, PiiCryptoError, type PiiVault } from "./pii-vault";
import { PROSPECT_EMAIL_FIELD, PROSPECT_PHONE_FIELD, QUOTE_PAYLOAD_FIELD } from "./pii-columns";

/**
 * Lot 8 (spec 075 FR-A4, FR-A5): the idempotent re-encryption pass behind
 * `scripts/ops/backfill-pii-encryption.ts`.
 *
 * - encrypt (default): every live Prospect / QuoteRequest row whose `piiKeyId` is NULL (legacy clear)
 *   or another key (rotation) is rewritten under the active key; prospects get their blind indexes
 *   and lose the unsalted legacy fingerprints. `reindex` also revisits rows already on the active key
 *   and only rewrites the blind indexes that differ (after a PII_BLIND_INDEX_KEY change).
 * - decrypt (rollback): every row with a `piiKeyId` goes back to clear values, legacy fingerprints
 *   restored and `piiKeyId` NULL. The blind indexes are kept (harmless, used again on re-encryption).
 * - dry-run unless `apply`: rows are read and counted, nothing is written.
 * - pages of `batchSize` rows ordered by id (keyset cursor); `after` resumes behind a reported id.
 * - each write is conditional on the row's `updatedAt` (optimistic check) and keeps it unchanged,
 *   so the retention anchors (spec 046) never move; a row changed meanwhile is counted as a conflict
 *   and picked up by the next run.
 * - anonymized rows are never touched. A row that cannot be decrypted is reported (id + error code)
 *   and left as is. Nothing here ever logs or returns a value, an envelope or a key.
 */

export type PiiBackfillTable = "prospect" | "quoteRequest";
export type PiiBackfillDirection = "encrypt" | "decrypt";

export interface PiiBackfillDelegate {
  findMany(input: unknown): Promise<unknown[]>;
  updateMany(input: unknown): Promise<{ count: number }>;
}

export type PiiBackfillClient = Record<PiiBackfillTable, PiiBackfillDelegate>;

export interface PiiBackfillOptions {
  apply: boolean;
  direction: PiiBackfillDirection;
  reindex?: boolean | undefined;
  batchSize?: number | undefined;
  tables?: readonly PiiBackfillTable[] | undefined;
  /** Resume cursor: rows of the FIRST table with an id lower or equal are skipped. */
  after?: string | undefined;
  /** Called after each page (progress for the operator: counts and the last id only). */
  onBatch?: ((progress: { table: PiiBackfillTable; scanned: number; lastId: string }) => void) | undefined;
}

export interface PiiBackfillTableReport {
  table: PiiBackfillTable;
  scanned: number;
  /** Rows that need a rewrite (written when `apply`). */
  pending: number;
  updated: number;
  conflicts: number;
  failed: number;
  failures: Array<{ id: string; code: string }>;
  lastId?: string | undefined;
}

export interface PiiBackfillReport {
  direction: PiiBackfillDirection;
  apply: boolean;
  activeKeyId?: string | undefined;
  tables: PiiBackfillTableReport[];
}

export const PII_BACKFILL_DEFAULT_BATCH = 200;
export const PII_BACKFILL_MAX_BATCH = 1000;
const MAX_REPORTED_FAILURES = 50;

interface ProspectPiiRow {
  id: string;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  emailFingerprint: string | null;
  phoneFingerprint: string | null;
  emailBlindIndex: string | null;
  phoneBlindIndex: string | null;
  piiKeyId: string | null;
  updatedAt: Date;
}

interface QuotePiiRow {
  id: string;
  payload: unknown;
  piiKeyId: string | null;
  updatedAt: Date;
}

const SELECT: Record<PiiBackfillTable, Record<string, true>> = {
  prospect: { id: true, emailNormalized: true, phoneNormalized: true, emailFingerprint: true, phoneFingerprint: true, emailBlindIndex: true, phoneBlindIndex: true, piiKeyId: true, updatedAt: true },
  quoteRequest: { id: true, payload: true, piiKeyId: true, updatedAt: true }
};

/** Usage errors (refused before any read). */
export class PiiBackfillUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiiBackfillUsageError";
  }
}

export async function runPiiBackfill(client: PiiBackfillClient, vault: PiiVault, options: PiiBackfillOptions): Promise<PiiBackfillReport> {
  const batchSize = options.batchSize ?? PII_BACKFILL_DEFAULT_BATCH;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > PII_BACKFILL_MAX_BATCH) throw new PiiBackfillUsageError(`batch size must be an integer between 1 and ${PII_BACKFILL_MAX_BATCH}`);
  if (options.direction === "encrypt" && !vault.enabled) throw new PiiBackfillUsageError("PII encryption is not configured (PII_ENCRYPTION_KEYS / PII_ENCRYPTION_ACTIVE_KEY_ID / PII_BLIND_INDEX_KEY)");
  if (options.direction === "decrypt" && options.reindex) throw new PiiBackfillUsageError("--reindex only applies to the encryption pass");
  const tables = options.tables ?? (["prospect", "quoteRequest"] as const);
  const reports: PiiBackfillTableReport[] = [];
  for (const [index, table] of tables.entries()) {
    reports.push(await backfillTable(client[table], table, vault, options, batchSize, index === 0 ? options.after : undefined));
  }
  return { direction: options.direction, apply: options.apply, ...(vault.activeKeyId ? { activeKeyId: vault.activeKeyId } : {}), tables: reports };
}

function selection(table: PiiBackfillTable, vault: PiiVault, options: PiiBackfillOptions): Record<string, unknown> {
  if (options.direction === "decrypt") return { anonymizedAt: null, piiKeyId: { not: null } };
  // Encrypt: legacy clear rows (NULL) and rows of another key; `reindex` revisits everything live.
  if (options.reindex && table === "prospect") return { anonymizedAt: null };
  return { anonymizedAt: null, OR: [{ piiKeyId: null }, { piiKeyId: { not: vault.activeKeyId } }] };
}

async function backfillTable(delegate: PiiBackfillDelegate, table: PiiBackfillTable, vault: PiiVault, options: PiiBackfillOptions, batchSize: number, after: string | undefined): Promise<PiiBackfillTableReport> {
  const report: PiiBackfillTableReport = { table, scanned: 0, pending: 0, updated: 0, conflicts: 0, failed: 0, failures: [] };
  const where = selection(table, vault, options);
  let cursor = after;
  for (;;) {
    const rows = await delegate.findMany({
      where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: SELECT[table],
      orderBy: { id: "asc" },
      take: batchSize
    }) as Array<ProspectPiiRow | QuotePiiRow>;
    for (const row of rows) {
      report.scanned += 1;
      let data: Record<string, unknown> | undefined;
      try {
        data = table === "prospect" ? planProspect(row as ProspectPiiRow, vault, options) : planQuote(row as QuotePiiRow, vault, options);
      } catch (error) {
        if (!(error instanceof PiiCryptoError)) throw error;
        report.failed += 1;
        if (report.failures.length < MAX_REPORTED_FAILURES) report.failures.push({ id: row.id, code: error.code });
        continue;
      }
      if (!data) continue;
      report.pending += 1;
      if (!options.apply) continue;
      // Optimistic check on updatedAt, and updatedAt kept: retention anchors do not move.
      const result = await delegate.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { ...data, updatedAt: row.updatedAt } });
      if (result.count === 1) report.updated += 1;
      else report.conflicts += 1;
    }
    const last = rows.at(-1);
    if (last) {
      cursor = last.id;
      report.lastId = last.id;
      options.onBatch?.({ table, scanned: report.scanned, lastId: last.id });
    }
    if (rows.length < batchSize) break;
  }
  return report;
}

function planProspect(row: ProspectPiiRow, vault: PiiVault, options: PiiBackfillOptions): Record<string, unknown> | undefined {
  const email = vault.decryptOptional(PROSPECT_EMAIL_FIELD, row.emailNormalized);
  const phone = vault.decryptOptional(PROSPECT_PHONE_FIELD, row.phoneNormalized);
  if (options.direction === "decrypt") {
    return {
      emailNormalized: email,
      phoneNormalized: phone,
      emailFingerprint: email === null ? null : legacyPiiFingerprint(email),
      phoneFingerprint: phone === null ? null : legacyPiiFingerprint(phone),
      piiKeyId: null
    };
  }
  const current = row.piiKeyId === vault.activeKeyId && [row.emailNormalized, row.phoneNormalized].every((value) => value === null || vault.isCurrent(value));
  const emailBlindIndex = email === null ? null : vault.blindIndex("email", email) ?? null;
  const phoneBlindIndex = phone === null ? null : vault.blindIndex("phone", phone) ?? null;
  if (current && row.emailBlindIndex === emailBlindIndex && row.phoneBlindIndex === phoneBlindIndex && row.emailFingerprint === null && row.phoneFingerprint === null) return undefined;
  return {
    // A value already under the active key keeps its envelope (reindex only rewrites the indexes).
    emailNormalized: current ? row.emailNormalized : email === null ? null : vault.encryptField(PROSPECT_EMAIL_FIELD, email),
    phoneNormalized: current ? row.phoneNormalized : phone === null ? null : vault.encryptField(PROSPECT_PHONE_FIELD, phone),
    emailFingerprint: null,
    phoneFingerprint: null,
    emailBlindIndex,
    phoneBlindIndex,
    piiKeyId: vault.activeKeyId
  };
}

function planQuote(row: QuotePiiRow, vault: PiiVault, options: PiiBackfillOptions): Record<string, unknown> | undefined {
  const payload = vault.decryptJson(QUOTE_PAYLOAD_FIELD, row.payload);
  if (options.direction === "decrypt") return { payload, piiKeyId: null };
  if (row.piiKeyId === vault.activeKeyId && vault.isCurrent(row.payload)) return undefined;
  return { payload: vault.encryptJson(QUOTE_PAYLOAD_FIELD, payload), piiKeyId: vault.activeKeyId };
}
