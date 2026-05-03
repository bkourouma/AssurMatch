# Feature Specification: Partner API And Webhooks Foundation

**Feature Branch**: `030-partner-api-webhooks-foundation`
**Created**: 2026-05-03
**Status**: Approved for implementation by user instruction on 2026-05-03 after explicit decisions on API key storage, migrations, event set, retry policy, secrets, allow-listing and delivery activation.

## Constitutional Scope

- **Impacted surfaces**: Backend API, shared packages, runtime configuration, audit logs, database / Prisma / migrations, admin read surface and partner webhook delivery worker.
- **Not impacted now**: Web Publique Client, Broker Back-office and insurer/payment/policy/claims surfaces.
- **Role**: Define a future scoped Partner API and outbound webhook foundation for partner-owned operational data.
- **Approved implementation decisions**: additive Prisma tables/migrations only; Partner API keys use an opaque key id plus Argon2id secret hash with raw key shown once; webhook signing secrets are generated once, returned once, stored encrypted for V1 delivery signing, and never logged; event set is exactly `lead.assigned`, `lead.status_changed`, `notification.failed`; retry policy is max five attempts with bounded backoff and dead-letter; webhook URL storage rejects non-HTTPS, credentialed, query/fragment, localhost, private/link-local, CGNAT, multicast, documentation and metadata hosts; tenant exact origin/path allow-list is mandatory; DNS/IP is checked at registration and delivery; redirects are not followed; delivery requires both `partner_webhooks_enabled` and `ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=true`.
- **Forbidden behavior**: No insurer API activation, no public lead export, no payment/premium flow, no policy issuance, no claims handling, no raw secret persistence, no synchronous outbound HTTP from public/admin/partner request handlers.
- **Tenant isolation**: Every API key, event and webhook endpoint is tenant-scoped. Cross-tenant access must fail closed and be audited.
- **Activation**: Any future implementation must remain disabled by default behind explicit flags and scoped credentials.

## Proposed Capabilities

1. **Partner API keys**
   - Scoped to `partnerTenantId`.
   - Carry explicit scopes such as `leads:read_assigned`, `notifications:read`, `webhooks:manage`.
   - Hash-at-rest only; raw key shown once.
   - Revocation and rotation audited.

2. **Partner API read endpoints**
   - Read-only first.
   - No public visitor route exposure.
   - No bulk export in V1 unless a separate export policy approves it.
   - Rate-limited and paginated.

3. **Outbound webhooks**
   - Disabled by default and fail closed without both feature flag and worker env gate.
   - First event candidates: `lead.assigned`, `lead.status_changed`, `notification.failed`.
   - HMAC signatures with timestamp and replay window.
   - Idempotency key per delivery.
   - Delivery log with status, attempt count, next retry, response class, and redacted payload metadata.
   - Tenant allow-list requires exact HTTPS origin and optional exact path before endpoint activation.
   - Worker revalidates DNS/IP at delivery time and blocks redirects.

4. **Payload minimization**
   - No raw PII unless a dedicated consent/legal basis is present.
   - Prefer references, statuses, timestamps, country/product keys and partner tenant IDs.
   - Never include secrets, tokens, payment data, policy documents, claims data or AI prompts.

## Acceptance Criteria

- Given webhooks are not explicitly enabled, when a partner config exists, then no outbound HTTP delivery is attempted.
- Given an API key for tenant A, when it requests tenant B data, then the API returns 403/404 without confirming the resource and writes an audit refusal.
- Given a webhook delivery is prepared, then the payload is signed, timestamped and idempotent, and the delivery log excludes secrets.
- Given replayed webhook signatures outside the tolerance window, then verification fails.
- Given rate limits are exceeded, then Partner API returns a standard rate-limit response and audits the event.
- Given the feature flag is enabled but the worker env gate is false, then no outbound HTTP delivery is attempted.
- Given a webhook endpoint host resolves to a private/link-local/metadata IP at delivery time, then delivery is not attempted and the attempt is retryable/dead-letter according to policy.
- Given a webhook endpoint responds with a redirect, then the redirect is not followed and the attempt is recorded without exposing signatures or secrets.

## Former Stop Conditions Resolved By User Approval

- First event set: `lead.assigned`, `lead.status_changed`, `notification.failed`.
- API key storage: key id plus Argon2id hash-at-rest; raw key shown once.
- Secret management: webhook signing secrets encrypted at rest; raw signing secret shown once.
- Retry/backoff: max five attempts, bounded backoff, dead-letter terminal state.
- PII payload: no raw PII in V1 payloads; allowlisted metadata only.
- Production endpoint allow-listing, encrypted DB secrets and delivery worker activation were explicitly approved by the user on 2026-05-03; actual remote environment mutation still depends on available deployment commands, environment secrets and target confirmation.
