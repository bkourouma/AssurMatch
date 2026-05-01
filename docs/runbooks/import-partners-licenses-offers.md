# Operational Import: Partners, Licenses And Offers

This runbook is for fake local/operator validation data only. Do not commit real
partner, license, contact, offer, quota, routing or credential data.

## 1. Prepare JSON

Use `docs/samples/partner-offer-import.fake.json` as the structure reference.
The file must include:

- `metadata.fakeData: true`
- fake `.example`, `.test` or `assurmatch.local` emails
- synthetic license numbers and partner references
- indicative offer disclaimers

## 2. Calculate Checksum

```powershell
Get-FileHash docs/samples/partner-offer-import.fake.json -Algorithm SHA256
```

## 3. Dry-Run

```powershell
npm run ops:import:partners -- --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256>
```

Dry-run is the default and writes nothing.

## 4. Apply Locally

Set a local `DATABASE_URL`, then apply explicitly:

```powershell
$env:DATABASE_URL = "postgresql://assurmatch:assurmatch@127.0.0.1:55433/assurmatch"
npm run ops:import:partners -- --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256> --apply --actor-id local-operator
```

Apply mode writes audit entries for `partner_import.attempted` and
`partner_import.completed`.

## Refusals

The importer refuses checksum mismatches, missing fake-data markers,
real-looking email domains, secret-like values and production-like URLs.

## Scope Limits

Routing rules are reported as skipped until a routing-rule configuration model
exists. Payment, policy issuance, e-signature, claims, insurer API and AI
recommendation are not activated by this import.
