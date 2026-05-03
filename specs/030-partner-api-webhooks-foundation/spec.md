# Feature Specification: Partner API And Webhooks Foundation

**Feature Branch**: `030-partner-api-webhooks-foundation`
**Created**: 2026-05-03
**Status**: Specified only - no implementation in this slice

## Constitutional Scope

- **Impacted future surfaces**: Backend API, shared packages, runtime configuration, audit logs and partner integration documentation.
- **Not impacted now**: Web Publique Client, Broker Back-office, Back-office UI implementation, database migrations, deployment, production configuration and secrets.
- **Role**: Define a future scoped Partner API and outbound webhook foundation for partner-owned operational data.
- **Forbidden behavior**: No insurer API activation, no public lead export, no payment/premium flow, no policy issuance, no claims handling, no production webhook delivery, no secret creation, no deployment.
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
   - Disabled by default.
   - First event candidates: `lead.assigned`, `lead.status_changed`, `notification.failed`.
   - HMAC signatures with timestamp and replay window.
   - Idempotency key per delivery.
   - Delivery log with status, attempt count, next retry, response class, and redacted payload metadata.

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

## Stop Conditions For Implementation

- Product decision needed for first public event set.
- API key storage migration design.
- Secret management and rotation policy.
- Webhook retry/backoff and dead-letter policy.
- Consent/legal basis for any PII payload.
- Production endpoint allow-listing or deployment.
