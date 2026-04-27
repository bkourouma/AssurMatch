# Contract: Seed and Import

This contract complements `data-model.md`. It specifies the exact CLI signatures, file conventions, validation, audit and rollback semantics for both reference and operational data.

## A. Reference seed (in repo)

### Command

```
npm run seed:reference
# or
node --import tsx scripts/preprod/seed-reference.ts [--dry-run]
```

### Inputs

`scripts/preprod/seeds/reference/*.json` files committed to Git:

- `countries.json`
- `currencies.json`
- `languages.json`
- `regulatory-regimes.json`
- `product-categories.json`
- `products.json`
- `feature-flags.defaults.json`
- `statuses.json` (documentation-only)
- `consent-templates.json`

### Behavior

- Idempotent: re-running on a fresh DB or an already-seeded DB is safe.
- Audit: emits `AuditLog` per upsert (`country.seeded`, `product.seeded`, `feature_flag.seeded`, `regulatory_regime.seeded`, `consent_text.seeded`).
- Default flags: every sensitive flag remains `false`. Country and product flags initialize per the `defaultFlags` in the source files.
- `--dry-run`: prints the plan without writing.

### Exit codes

- `0` success
- `2` validation error in source files
- `3` runtime error contacting DB
- `4` partial success (logged; non-zero so CI/operator notice)

## B. Operational import (out of repo)

### Command (run on the VPS only)

```
node --import tsx scripts/preprod/import-partners.ts \
  --batch /home/deployer/apps/assurmatch/imports/<batch-id> \
  [--dry-run] \
  [--mode upsert|insert|soft-delete] \
  [--rollback]
```

### Batch directory layout

```
imports/<batch-id>/
  manifest.json
  partners.json
  licenses.json
  offers.json
  users.json
  documents/
    <filename>
  rollback.json          (created by the script after a successful apply)
```

### `manifest.json`

```json
{
  "batchId": "2026-04-27-001",
  "createdAt": "2026-04-27T10:00:00Z",
  "createdBy": "compliance@assurmatch.net",
  "signature": "base64(ed25519 signature of file list)",
  "files": [
    { "name": "partners.json",  "sha256": "..." },
    { "name": "licenses.json",  "sha256": "..." },
    { "name": "offers.json",    "sha256": "..." },
    { "name": "users.json",     "sha256": "..." },
    { "name": "documents/...",  "sha256": "..." }
  ],
  "mode": "insert"
}
```

The signature scheme (which key, where it lives) is finalized in /speckit.tasks. Default recommendation: ed25519 key held by compliance, public key stored on the VPS.

### Validation pipeline

1. Verify `manifest.json` exists and parses.
2. Verify all listed files exist with matching `sha256`.
3. Verify signature against the configured public key.
4. Run zod validation on each row (rules in `data-model.md`).
5. Resolve foreign keys (country isoCode → existing seeded country, productKey → existing seeded product, partnerLegalName → existing partner if `mode=upsert`).
6. Check uniqueness (legalName + registrationNumber, license number, offer (partner+country+product+name+validFrom)).
7. In `--dry-run`, stop here and print a per-row report.
8. Otherwise, apply rows in a single transaction per file; if any row fails, rollback that file's transaction and abort the import.
9. Write `rollback.json` capturing prior state for every modified row.
10. Emit one `AuditLog` per row (`partner.imported`, etc.) with `correlationId = batchId`.

### Document handling

- File path on host: `imports/<batch-id>/documents/<filename>`.
- Storage path on container: `/app/uploads/<partner-id>/<document-id>` (matches `LOCAL_STORAGE_ROOT`).
- The script copies (not moves) the file into the upload volume; the import row stores the relative path and sha256 of the file.
- After successful import, the source `imports/<batch-id>/documents/` may be archived/encrypted/deleted by the operator (runbook).

### Rollback

```
node --import tsx scripts/preprod/import-partners.ts \
  --batch /home/deployer/apps/assurmatch/imports/<batch-id> \
  --rollback
```

- Reads `rollback.json`.
- Applies the inverse operations.
- Emits `*.rolled_back` audit entries.

### Soft-delete and retire

- `--mode soft-delete`: marks rows as `retired` (or `inactive`) without deleting; this is a single, explicit operator action.
- Physical deletion is never performed by the import.

### Logging and error reports

- Console output (stdout) is JSON Lines for machine parsing.
- A human-readable report is written to `imports/<batch-id>/report.md`.
- PII is not echoed; emails are masked except at the row-level success/failure summary.

## C. CI gate for accidental commits

A future task adds a verify-step `gitleaks` scan with rules forbidding:

- file matches `.env*` (except `.env*.example`),
- patterns matching `BEGIN RSA/OPENSSH PRIVATE KEY`,
- patterns `POSTGRES://*`/`DATABASE_URL=` with explicit credentials.

`scripts/preprod/seeds/reference/` is whitelisted; `imports/` is forbidden in the repo (covered by `.gitignore`).

## D. What is forbidden

- Committing real partner names, real licenses, real emails, real offers, real documents, real user credentials.
- Committing `.env.production`, `.env.preproduction`, or any file that contains a non-placeholder secret.
- Running the operational import in CI.
- Bypassing audit (`--no-audit` will not exist).
- Running `--rollback` on a batch that did not produce `rollback.json`.

## E. Open questions for /speckit.tasks

1. Final ed25519 signature scheme and key custody.
2. Whether the operational import should be invocable from the back-office UI for compliance teams (out of scope here; would be a new spec).
3. Whether deletions should ever be allowed (default: no; document the exception path).
4. Encryption-at-rest for `imports/<batch-id>/documents/` after apply (default: encrypt with `gpg --symmetric` using the same `BACKUP_PASSPHRASE`).
