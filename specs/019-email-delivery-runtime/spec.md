# Feature Specification: Email Delivery Runtime

**Feature Branch**: `019-email-delivery-runtime`
**Created**: 2026-04-29
**Status**: Draft
**Input**: User description: "019-email-delivery-runtime"
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes - standard runtime hardening feature with no clarification markers

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: This feature supports transactional platform communications only. It does not sell insurance, enable subscription, collect premiums, issue contracts, issue attestations or provide binding advice.
- **Impacted application(s)**: Backend API, runtime operations, shared configuration/contracts if needed, and local/preproduction tooling. Web Publique Client and back-office UI are not primary surfaces except where existing auth flows consume email tokens.
- **Affected scopes**: Authentication emails, admin-created user activation, password reset, future notification delivery foundations, local/preproduction runtime operations and production-safe SMTP configuration.
- **Frontend separation**: No new public visitor route, layout, privilege or authenticated back-office surface is introduced. Existing public and back-office apps remain separated.
- **Required feature flags**: No production feature flag is activated. Email delivery must be configurable by environment and must fail safely when disabled or not configured.
- **Consent and transmission**: ConsentRecord is not required for auth/security transactional emails. For future lead or marketing emails, the feature must not bypass consent requirements and must preserve recipient purpose and scope.
- **Partner license controls**: N/A for auth transactional email delivery. Future lead/broker notifications must not imply broker eligibility without existing license/routing controls.
- **Audit and data history**: Sensitive email delivery attempts must be traceable with target user, purpose, delivery status, error class and timestamps while masking PII and excluding tokens/secrets from logs.
- **Security and RBAC**: Email token generation and user lifecycle triggers remain protected by existing RBAC/MFA/tenant isolation. Runtime configuration must not expose SMTP credentials, reset tokens, activation tokens or MFA secrets in logs, scripts or browser output.
- **Routing impact**: No lead routing behavior changes. The feature must not notify brokers of leads unless existing routing eligibility has already succeeded.
- **AI impact**: N/A. No AI prompt, model call, recommendation or automated decision is introduced.
- **UX/content restrictions**: Transactional email content must avoid regulated sales wording and must identify AssurMatch as a technical platform. Emails must not promise coverage, subscription, contract validation or best-market recommendation.
- **Workflow continuity**: After this spec is reviewed with no clarification markers, the feature may proceed through `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` -> final validations without intermediate confirmation unless a security, privacy, compliance or validation blocker appears.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deliver auth security emails (Priority: P1)

As an invited or resetting back-office user, I need activation and password reset emails to be delivered through the configured runtime mail channel so I can complete secure account setup without relying on manual token copying.

**Why this priority**: Activation and password reset are core security workflows introduced by auth persistence. They must work in local, preproduction and production-like runtimes.

**Independent Test**: Configure the runtime mail channel, create an invited user or issue a password reset, and verify that a single email reaches the configured mailbox or Mailpit inbox without exposing tokens in logs.

**Acceptance Scenarios**:

1. **Given** SMTP delivery is configured and an admin creates a user, **When** the activation token is issued, **Then** the recipient receives one activation email containing the activation path and no password material.
2. **Given** SMTP delivery is unavailable, **When** an activation or password reset is requested, **Then** the system records a failed or not-configured delivery state without leaking the token to logs.
3. **Given** the user is unauthorized to issue resets, **When** they attempt to trigger an email, **Then** RBAC blocks the action before email delivery is attempted.

---

### User Story 2 - Verify local and preproduction delivery (Priority: P2)

As a developer or operator, I need Mailpit-backed local/preproduction email verification so auth emails can be checked end-to-end before production SMTP credentials are introduced.

**Why this priority**: It reduces release risk and lets operators validate token emails without using real external recipients.

**Independent Test**: Start the local/preproduction stack, issue activation and password reset emails, and confirm both appear in Mailpit with expected subject, recipient and safe body content.

**Acceptance Scenarios**:

1. **Given** the local/preproduction stack is running with Mailpit, **When** an auth email is sent, **Then** Mailpit shows the message with the expected recipient, subject and security copy.
2. **Given** production environment settings are used, **When** the runtime starts, **Then** Mailpit placeholder settings are not silently used as production SMTP credentials.
3. **Given** a local/preproduction operator has not configured bootstrap credentials, **When** the stack starts, **Then** no real secret is printed or persisted by launch scripts.

---

### User Story 3 - Observe delivery failures safely (Priority: P3)

As a platform operator, I need delivery outcomes and failures to be observable without exposing PII, tokens or SMTP secrets so support can diagnose account access issues safely.

**Why this priority**: Email failures affect user access and support workflows, but logs and diagnostics must stay privacy-safe.

**Independent Test**: Force delivery success, not-configured and failure states and inspect audit/runtime output for masked recipient data, status and no token or credential leakage.

**Acceptance Scenarios**:

1. **Given** SMTP authentication fails, **When** an auth email is attempted, **Then** the operator sees a safe failure class and correlation context without credential values.
2. **Given** an email contains an activation or reset token, **When** logs, audit records or error messages are inspected, **Then** the raw token is absent.
3. **Given** support needs to verify whether an email was attempted, **When** they inspect delivery history, **Then** they can see purpose, status and timestamp without seeing sensitive token content.

---

### Edge Cases

- Country disabled or waitlist-only: N/A for auth/security email delivery; future lead emails must not bypass country feature flags.
- Product disabled, quote-disabled or manual-review-only: N/A for auth/security emails; future product notifications must honor product flags.
- Consent missing, expired or not scoped: N/A for account security emails; marketing or lead transmission emails remain blocked without valid consent.
- Broker inactive, unauthorized or over quota: N/A for auth emails; lead notification emails must only occur after routing eligibility succeeds.
- Broker license expired, suspended or invalid: N/A for auth emails; broker lead notifications must be blocked by existing license/routing controls.
- Offer expired, sponsored or indicative: N/A for auth emails; any future offer email must preserve indicative and sponsorship wording.
- AI disabled by scope: N/A because no AI is used.
- User lacks permission to view, mutate or export resource: protected email-triggering actions must be blocked by RBAC before delivery.
- Public route tries to load partner/admin authentication or back-office UI: no new public route is added.
- Unauthenticated or unauthorized visitor reaches back-office functionality: existing auth middleware continues to block access.
- Public input is spammy, rate-limited, malformed or duplicate: token-consuming endpoints keep existing validation/rate limiting and email triggers must be idempotent enough to avoid accidental duplicate bursts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deliver activation and password reset transactional emails through an environment-configured mail channel when configured.
- **FR-002**: System MUST support a local/preproduction inbox workflow for delivery verification without using real external recipients.
- **FR-003**: System MUST report delivery status as sent, failed or not configured to the caller or audit context without exposing SMTP credentials.
- **FR-004**: System MUST prevent raw activation tokens, password reset tokens, MFA secrets and SMTP credentials from appearing in logs, errors, audit entries or scripts.
- **FR-005**: System MUST keep existing RBAC, MFA and tenant isolation checks as the authority for user lifecycle actions that trigger emails.
- **FR-006**: System MUST avoid using local placeholder SMTP/Mailpit settings as production configuration.
- **FR-007**: System MUST provide operator documentation for local/preproduction email verification and production SMTP configuration boundaries.
- **FR-008**: System MUST avoid duplicate email bursts for the same token issuance action under normal retry or refresh behavior.
- **FR-009**: System MUST keep Web Publique Client routes, layouts and auth policy untouched unless a future spec explicitly scopes public email capture.
- **FR-010**: System MUST keep transactional email content compliant with AssurMatch technical-platform positioning and avoid forbidden sales/subscription wording.
- **FR-011**: System MUST expose enough delivery evidence for support to confirm attempt status, purpose and timestamp without seeing sensitive token content.
- **FR-012**: System MUST include tests for configured delivery, not-configured delivery, failed delivery, PII/token masking and local/preproduction Mailpit verification.

### Key Entities *(include if feature involves data)*

- **EmailDeliveryConfig**: Environment-specific sender host, port, security mode, sender identity and credential presence.
- **EmailDeliveryAttempt**: Purpose, recipient reference, masked recipient, status, provider response class, timestamp and correlation context.
- **AuthTokenEmail**: Activation or password reset email content carrying a one-time token or link.
- **UserAccount**: Recipient user and lifecycle state that determines whether activation or reset delivery is valid.
- **AuditLog**: Existing audit evidence for sensitive user lifecycle and auth actions, enriched only with safe delivery status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of activation and password reset requests in configured local/preproduction runtime produce exactly one visible Mailpit message per token issuance.
- **SC-002**: 100% of configured delivery, not-configured delivery and failed delivery states are distinguishable in tests without inspecting provider internals.
- **SC-003**: 0 raw activation tokens, reset tokens, MFA secrets or SMTP credentials appear in logs, audit entries, terminal output, scripts or test snapshots.
- **SC-004**: 100% of email-triggering user lifecycle actions remain covered by RBAC/MFA/tenant-isolation tests or existing integration tests.
- **SC-005**: 0 Web Publique Client files or routes are modified for this feature unless explicitly re-scoped in a later approved spec.
- **SC-006**: Operators can complete a documented local/preproduction activation or password reset email verification flow in under 10 minutes after dependencies are installed.

## Assumptions

- Auth activation and password reset are the first delivery use cases; marketing, lead notifications, broker notifications and public contact email capture are out of scope for this feature.
- Mailpit is the local/preproduction verification inbox and must not be treated as a production SMTP substitute.
- Production SMTP credentials are provided by deployment environment or secret manager, not committed files or batch scripts.
- Existing auth/user controllers remain responsible for authorization and token issuance; email delivery adds transport/runtime reliability rather than new account permissions.
- No new database migration is assumed unless planning determines persistent delivery history is required beyond existing audit/log evidence.

