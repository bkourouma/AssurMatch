# Data Model: Secure Partner License Offer Import

## PartnerImportPayload

- **Fields**: version, metadata, partners, partnerUsers, licenses, coverage, offers, routingRules.
- **Validation**: `metadata.fakeData` must be true; batch id is required; arrays default to empty.
- **Safety**: All text is scanned for secret-like values and real-looking emails.

## PartnerImportReport

- **Fields**: dryRun, checksum, created, updated, skipped, errors.
- **Validation**: Counts are non-negative; errors contain path/message pairs.

## PartnerTenant

- **Fields used**: legalName, tradeName, registrationNumber, plan, status, primaryEmail, primaryWhatsApp, quotaMonthlyLeads, capacityStatus.
- **Idempotency key**: registrationNumber when provided, otherwise legalName.

## PartnerUser

- **Fields used**: email, displayName, role, partnerRegistrationNumber.
- **Idempotency key**: email.

## PartnerLicense

- **Fields used**: partnerRegistrationNumber, licenseNumber, issuingAuthority, countryIsoCode, productKeys, status, effectiveDate, expirationDate.
- **Idempotency key**: partner, country and licenseNumber.

## CoverageAuthorization

- **Fields used**: partnerRegistrationNumber, countryIsoCode, productKeys, status.
- **Idempotency key**: partner-country and partner-product authorization rows.

## Offer

- **Fields used**: countryIsoCode, productKey, partnerRegistrationNumber, publicKey, name, description, indicative prices, validity, sponsorship, disclaimers.
- **Idempotency key**: country, product and publicKey.

## AuditLog

- **Fields used**: actorId, action, targetType, targetId, scope, result, reason, context, correlationId, retentionUntil.
- **Events**: `partner_import.attempted`, `partner_import.completed`.
