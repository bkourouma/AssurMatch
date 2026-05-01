# Quickstart: Secure Partner License Offer Import

Generate the checksum:

```powershell
Get-FileHash docs/samples/partner-offer-import.fake.json -Algorithm SHA256
```

Dry-run by default:

```powershell
node --import tsx scripts/import-partners.ts --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256>
```

Apply explicitly:

```powershell
node --import tsx scripts/import-partners.ts --file docs/samples/partner-offer-import.fake.json --checksum-sha256 <sha256> --apply --actor-id local-operator
```

Never commit real partner, license, contact or offer data. Use fake sample data only.
