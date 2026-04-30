# Research: Email Delivery Runtime

## Decisions

### Email delivery modes

**Decision**: Support `EMAIL_SERVICE_TYPE=disabled|mailpit|smtp`.

**Rationale**: `disabled` keeps new environments safe and preserves existing
one-time token preview behavior for admin flows. `mailpit` gives local and
preproduction verification without sending to the Internet. `smtp` enables an
explicit production-like channel once operators provide secrets through runtime
environment variables.

**Alternatives considered**:
- Reusing legacy `SMTP_HOST` detection was rejected because it does not express
  disabled vs local inbox vs real SMTP and can accidentally treat placeholders
  as production config.
- Adding a third-party mail library was rejected for this narrow scope because
  the repo already has enough runtime dependencies and a minimal SMTP client can
  be covered by focused tests.

### SMTP configuration boundaries

**Decision**: SMTP startup validation requires `EMAIL_FROM`,
`EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER` and
`EMAIL_SMTP_PASS` when `EMAIL_SERVICE_TYPE=smtp`. `EMAIL_SMTP_PASS` must come
from env only. Mailpit is refused in production.

**Rationale**: This prevents silent production use of local Mailpit or partial
Gmail configuration. Gmail is documented as requiring an app password, but the
app password must never be stored in Git.

### Templates

**Decision**: Implement simple text and HTML templates for activation and
password reset. They identify AssurMatch as a technical platform, include a
one-time token/link, state expiry and avoid regulated commercial wording.

**Rationale**: Auth/security emails are transactional and should not introduce
insurance promises, broker eligibility claims or marketing language.

### Delivery evidence

**Decision**: Use existing AuditLog writer for safe delivery attempt metadata:
purpose, masked recipient, provider mode, status, error class and timestamp.
Do not persist raw email body, token, SMTP username/password or full recipient.

**Rationale**: The feature needs support observability without adding a new
persistent data model or leaking sensitive values.

### Rate limiting / accidental send protection

**Decision**: This feature does not add a global mail queue or campaign sender.
It relies on existing auth token issuance controls and adds bounded send
timeouts. SMTP is opt-in and Mailpit is production-refused.

**Rationale**: Scope is one transactional email per existing token issuance
action. Mass sending and marketing campaigns are excluded.

## Risks and Mitigations

- **Secret leakage**: mitigated by env-only SMTP pass, REDACTED examples,
  sanitized error classes, no credential logging and secret-scan tests.
- **Production using Mailpit**: mitigated by config validation failure when
  `APP_ENV=production` and `EMAIL_SERVICE_TYPE=mailpit`.
- **Token exposure in logs/audit**: mitigated by only auditing metadata and
  tests that inspect audit payloads.
- **SMTP interoperability**: Gmail is documented with port 465 and
  `EMAIL_SMTP_SECURE=true`; broader STARTTLS/provider work can be future scope
  if needed.
