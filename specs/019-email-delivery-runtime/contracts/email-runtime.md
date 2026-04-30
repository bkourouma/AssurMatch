# Contract: Email Delivery Runtime

## Environment

```text
EMAIL_SERVICE_TYPE=disabled|mailpit|smtp
EMAIL_FROM=no-reply@example.invalid
EMAIL_SMTP_HOST=smtp.example.invalid
EMAIL_SMTP_PORT=465
EMAIL_SMTP_USER=REDACTED
EMAIL_SMTP_PASS=REDACTED
EMAIL_SMTP_SECURE=true|false
EMAIL_REPLY_TO=support@example.invalid
EMAIL_SEND_TIMEOUT_MS=5000
EMAIL_PREVIEW_MODE=true|false
```

Rules:
- `disabled` performs no network send and returns `not_configured`.
- `mailpit` requires `EMAIL_FROM`; host/port default to
  `127.0.0.1:1025` when omitted. It is refused when `APP_ENV=production`.
- `smtp` requires `EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`,
  `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASS`.
- `EMAIL_SMTP_PASS` must be supplied by runtime env or secret manager only.
- Error messages and logs must never include `EMAIL_SMTP_PASS`, auth/reset
  tokens or MFA secrets.

## Port

```ts
interface AuthEmailDeliveryPort {
  send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult>;
}

interface AuthEmailPayload {
  to: string;
  subject: string;
  body: string;
  html?: string;
  purpose: "auth_activation" | "auth_password_reset";
}

interface AuthEmailDeliveryResult {
  status: "sent" | "failed" | "not_configured";
  provider: "disabled" | "mailpit" | "smtp";
  errorClass?: string;
}
```

## Auth user lifecycle behavior

- Admin create user triggers activation email after existing RBAC/MFA checks.
- Admin password reset triggers reset email after existing RBAC/MFA checks.
- If delivery status is `sent`, the response does not expose a token preview.
- If delivery status is `failed` or `not_configured`, existing admin-only
  fallback may return the one-time token once, but the token is never logged or
  audited.

## Audit metadata

```json
{
  "action": "email.delivery.sent",
  "targetType": "email",
  "metadata": {
    "purpose": "auth_password_reset",
    "recipientMasked": "a***@example.test",
    "provider": "smtp",
    "status": "sent"
  }
}
```

Failure actions use `email.delivery.failed`; disabled/not-configured uses
`email.delivery.not_configured`. Metadata must never include raw tokens,
passwords, SMTP usernames/passwords or full email bodies.
