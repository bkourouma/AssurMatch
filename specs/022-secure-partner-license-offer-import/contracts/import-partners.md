# Contract: Partner License Offer Import

## CLI

```powershell
node --import tsx scripts/import-partners.ts --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256>
node --import tsx scripts/import-partners.ts --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256> --apply
```

## Arguments

- `--file`: required JSON file path.
- `--checksum-sha256`: required SHA256 hex digest for the exact file bytes.
- `--apply`: optional; without this flag the import is dry-run.
- `--actor-id`: optional actor id for audit context; defaults to `partner-import-operator`.

## Report

The command prints JSON:

```json
{
  "dryRun": true,
  "checksum": "hex",
  "created": 0,
  "updated": 0,
  "skipped": 5,
  "errors": []
}
```

## Safety Refusals

- Missing or mismatched checksum.
- `metadata.fakeData` absent or false.
- Secret-like tokens, private keys or production-like URLs.
- Emails outside `.example`, `.test` or `assurmatch.local` domains.
- Write attempt without `--apply`.
