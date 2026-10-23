# Runbook — Encryption of personal data at rest (spec 075, lot 8)

## What is protected

| Data | Column | At rest |
|------|--------|---------|
| Visitor e-mail | `Prospect.emailNormalized` | envelope `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>` (AES-256-GCM) |
| Visitor phone | `Prospect.phoneNormalized` | same |
| Quote answers (+ contact block when present) | `QuoteRequest.payload` (JSONB) | `{"$enc": "enc:v1:..."}` |
| Search / de-duplication / erasure keys | `Prospect.emailBlindIndex`, `Prospect.phoneBlindIndex` | HMAC-SHA256 with `PII_BLIND_INDEX_KEY` |
| Key that encrypted the row | `Prospect.piiKeyId`, `QuoteRequest.piiKeyId` | key id (NULL = clear legacy row) |

- The additional authenticated data of each envelope is the column name: an envelope copied into
  another column does not decrypt.
- The unsalted legacy fingerprints (`Prospect.emailFingerprint` / `phoneFingerprint`, SHA-256 of
  `assurmatch:<value>`) are no longer written for encrypted rows and are cleared by the backfill.
  They are still READ during the transition (prospect matching and erasure lookups use
  `blind index OR legacy fingerprint`).
- Everything happens in `backend/src/modules/common/security/` (`pii-key-ring.ts`, `pii-vault.ts`,
  `pii-columns.ts`), called by the Prisma repositories. The rest of the code, the HTTP contracts and
  the back-offices see clear values exactly as before.
- Not covered by this lot (hypothesis H-A): `Prospect.displayName`, contact messages, waiting list,
  partner applications, documents (files), `ConsentRecord.subjectReference` (legacy fingerprint).

## Hypothesis H6 — key management

Keys are environment variables provisioned from the server's secret store (the `api.env` /
`worker.env` files, mode 0600, outside the repository). There is no KMS in this lot. Anyone with
root on the VPS can read the keys: the encryption protects database dumps, backups, replicas and
SQL access, not a compromised application host.

## Variables

| Variable | Format | Notes |
|----------|--------|-------|
| `PII_ENCRYPTION_KEYS` | `keyId:base64[,keyId2:base64]` | each key = exactly 32 random bytes; id = letters, digits, `-`, `_` (max 32) |
| `PII_ENCRYPTION_ACTIVE_KEY_ID` | one id of the ring | encrypts every new write; the other keys are read-only |
| `PII_BLIND_INDEX_KEY` | base64, >= 32 bytes | distinct from every encryption key and from `ENCRYPTION_KEY` (MFA) |

- `NODE_ENV=production` or `APP_ENV=production`: the API, the worker and the ops scripts refuse to
  start when one of them is missing or invalid. Messages name the variable, never a value.
- Local and test runtimes without any of them: clear writes, as before the lot (blind indexes only
  if `PII_BLIND_INDEX_KEY` is set). A partial configuration is always refused.
- The API and the worker must carry the SAME three values.

### Generating keys

```sh
openssl rand -base64 32   # one encryption key (prefix it with its id: k2026a:<output>)
openssl rand -base64 32   # the blind index key
```

Choose dated ids (`k2026a`, `k2027a`...). Never reuse a key between environments
(production / preproduction / e2e). Never paste a key in a ticket, chat, commit or log.

### Backing keys up (mandatory)

**A lost encryption key means the data it encrypted is lost.** Database backups are useless without
the keys that were active when they were taken.

- Store every key (current AND retired) in the team password manager / offline vault, with its id
  and its activation and retirement dates, by two custodians.
- Keep a retired key as long as any backup in the retention window may contain rows encrypted with
  it (`BACKUP_PASSPHRASE` follows the same rule, see `secret-rotation.md`).
- Test a restore of a backup with the stored keys at least once a year.

## First deployment (three steps)

1. **Migration** `0037_security_hardening` (additive: nullable columns and indexes, no rewrite).
   The running version ignores the new columns.
2. **Deploy the version with the keys** in `api.env` and `worker.env`, restart `assurmatch-app` and
   `assurmatch-worker`. From now on every new prospect and quote request is written encrypted; old
   rows are still read in clear (transition).
3. **Backfill** the existing rows, from the API image:

   ```sh
   docker compose -f docker-compose.production.yml run --rm api \
     node --import tsx scripts/ops/backfill-pii-encryption.ts            # dry-run: counts
   docker compose -f docker-compose.production.yml run --rm api \
     node --import tsx scripts/ops/backfill-pii-encryption.ts --apply    # writes
   ```

   Then check with a second dry-run: `pending` must be 0 for both tables, and

   ```sql
   SELECT count(*) FROM "Prospect" WHERE "anonymizedAt" IS NULL AND "piiKeyId" IS NULL;
   SELECT count(*) FROM "QuoteRequest" WHERE "anonymizedAt" IS NULL AND "piiKeyId" IS NULL;
   ```

   must both return 0.

Backfill properties: dry-run unless `--apply`; pages of `--batch` rows (default 200) ordered by id;
idempotent (a second run finds nothing); a run interrupted can be restarted as is, or resumed with
`--only prospect|quote-request --after <last id printed>`; each write is conditional on the row's
`updatedAt` (a row edited meanwhile is reported as a `conflict` and processed by the next run) and
keeps `updatedAt`, so retention anchors do not move. Anonymized rows are never touched. Rows that
cannot be decrypted are listed by id and error code (exit code 2); nothing else is printed.

Take a database backup (and check the keys are in the vault) before any `--apply`.

## Rotation

1. Generate the new key (`openssl rand -base64 32`), store it in the vault.
2. Append it to the ring and switch the active id, on the API **and** the worker:
   `PII_ENCRYPTION_KEYS=k2026a:<old>,k2027a:<new>` and `PII_ENCRYPTION_ACTIVE_KEY_ID=k2027a`.
3. Restart `assurmatch-app` and `assurmatch-worker`. New writes use `k2027a`; rows under `k2026a`
   remain readable.
4. Re-encrypt: `backfill-pii-encryption.ts` (dry-run), then `--apply`. It rewrites every live row
   whose `piiKeyId` is not the active one.
5. Verify that no live row carries the old id:

   ```sql
   SELECT "piiKeyId", count(*) FROM "Prospect" WHERE "anonymizedAt" IS NULL GROUP BY 1;
   SELECT "piiKeyId", count(*) FROM "QuoteRequest" WHERE "anonymizedAt" IS NULL GROUP BY 1;
   ```

6. Only then remove `k2026a` from `PII_ENCRYPTION_KEYS` and restart. Keep it in the vault while
   backups taken before step 5 are in the retention window.

Cadence: yearly, or immediately when a key may have leaked (then also rotate the blind index key).

### Blind index key

Changing `PII_BLIND_INDEX_KEY` invalidates every stored blind index: prospect de-duplication and
erasure lookups miss the rows not yet re-indexed. Only on suspected compromise, in a maintenance
window (public quote submission paused):

1. Set the new `PII_BLIND_INDEX_KEY` on the API and the worker, restart.
2. `backfill-pii-encryption.ts --reindex` (dry-run), then `--reindex --apply`.
3. Second `--reindex` dry-run: `pending` = 0. Reopen submissions.

## Rollback

- Before removing the version or the keys, return to clear values with every key still in the ring:
  `backfill-pii-encryption.ts --decrypt` (dry-run), then `--decrypt --apply`. Clear values and legacy
  fingerprints are restored, `piiKeyId` becomes NULL (blind indexes are kept).
- Then deploy the previous version, and only then, if needed, `rollback.sql` of migration 0037.
- Never drop the keys while a row still has a `piiKeyId`: those rows would become unreadable
  (the API answers an error on them; the error names the column, never the value).

## Incidents

| Symptom | Cause | Action |
|---------|-------|--------|
| Boot fails: `PII encryption is required ... missing ...` | variable absent | provision it (API and worker) |
| Boot fails: `PII_ENCRYPTION_KEYS entry #n ...` | malformed key | regenerate with `openssl rand -base64 32` |
| Log `pii.protection_failed` code `pii_unknown_key` | a row encrypted with a key removed from the ring | put the retired key back from the vault |
| Log `pii.protection_failed` code `pii_authentication_failed` | tampered value, envelope moved between columns, wrong key material under a known id | restore the row from backup; check the ring values |

## Known limits

- `scripts/ops/sql/f1-shared-prospect-detection.sql` compares `ConsentRecord.subjectReference` to
  `Prospect.emailFingerprint`; encrypted prospects have no legacy fingerprint, so that read-only
  query only sees legacy rows.
- The local demo seed (`scripts/local-app/seed-broker-demo.ts`) writes clear rows; they are read as
  legacy values (and backfilled like any other row if keys are configured locally).
