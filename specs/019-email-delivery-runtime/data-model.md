# Data Model: Email Delivery Runtime

No Prisma schema migration is required for this feature.

## EmailDeliveryConfig

Runtime-only configuration resolved from environment variables.

- `serviceType`: `disabled | mailpit | smtp`
- `from`: sender address required for `mailpit` and `smtp`
- `replyTo`: optional reply-to address
- `smtpHost`: required for `mailpit` and `smtp`
- `smtpPort`: required positive integer for `mailpit` and `smtp`
- `smtpUser`: required only for `smtp`
- `smtpPass`: required only for `smtp`, env-only secret
- `smtpSecure`: boolean, recommended `true` for Gmail port 465
- `sendTimeoutMs`: positive integer timeout, default 5000
- `previewMode`: boolean marker for local/preproduction verification

## EmailDeliveryAttempt

Audit/log metadata only. Stored through existing audit infrastructure, not a
new table.

- `purpose`: `auth_activation | auth_password_reset`
- `recipientMasked`: masked recipient email, never raw PII
- `status`: `sent | failed | not_configured`
- `provider`: `disabled | mailpit | smtp`
- `errorClass`: safe class such as `smtp_unavailable`, no provider secret
- `attemptedAt`: runtime timestamp
- `correlationId`: optional request/runtime correlation if available

## AuthTokenEmail

Rendered message passed to transport.

- `to`: raw recipient address, used only for SMTP envelope
- `subject`: constitution-safe transactional subject
- `text`: text body
- `html`: simple HTML body
- `purpose`: auth delivery purpose

## UserAccount

Existing user entity from auth/users persistence. No new fields.

## AuditLog

Existing audit module records delivery attempts using metadata only. Raw tokens,
MFA secrets, email bodies and SMTP credentials are excluded.
