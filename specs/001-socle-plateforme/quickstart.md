# Quickstart: Socle plateforme AssurMatch

This quickstart validates the Phase 1 foundation once implementation tasks exist. It is intentionally focused on constitutional readiness rather than commercial activation.

## Prerequisites

- Node.js 24.15.0 LTS available locally.
- PostgreSQL available for the backend test database.
- Redis available for cache, rate limiting, locks and BullMQ queues.
- S3-compatible document storage configured for local/test or mocked with equivalent semantics.
- WhatsApp and email providers configured in test mode; every WhatsApp technical/compliance notification must also create an email delivery attempt.
- Secrets provided through local environment files or secret manager, never committed.

## Environment Safety Check

1. Confirm all public/commercial flags default to disabled:
   - `public_comparator_enabled`
   - `quote_request_enabled`
   - `payments_enabled`
   - `e_signature_enabled`
   - `policy_issuance_enabled`
   - `claims_enabled`
   - `insurer_api_enabled`
   - `sponsored_offers_enabled`
   - `multi_broker_routing_enabled`
2. Confirm technical notification delivery can use WhatsApp and email in test mode.
3. Confirm no exposed environment runs without HTTPS.

## Local Validation Commands

These commands are expected after implementation creates the monorepo package scripts.

```powershell
npm install
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:guardrails
npm run test:e2e
```

## Scenario 1: Country and Product Foundation

1. Sign in as a Super Admin with MFA.
2. Create one regulatory regime.
3. Create one pilot country with public flags disabled.
4. Create two products and associate them to the country with product public/quote flags disabled.
5. Verify public `/countries` and `/products?country=...` responses do not expose disabled scopes.
6. Verify AuditLog entries exist for created/updated entities.

Expected result: Admin data exists; public exposure remains disabled by default.

## Scenario 2: Partner and License Compliance

1. Sign in as Compliance Admin.
2. Create a partner broker in `pending_compliance`.
3. Attach an accreditation document.
4. Add a valid license scoped to one country and product.
5. Activate the partner as a scoped authorized admin with a reason.
6. Change the license to `expired`.
7. Verify the partner becomes ineligible for activation/routing in the affected scope.

Expected result: Valid license allows scoped activation; invalid license blocks scope and creates compliance evidence.

## Scenario 3: RBAC and Tenant Isolation

1. Create users for Super Admin, Admin Pays, Compliance Admin, Support Admin, Broker Owner Starter, Broker Owner Pro, Broker Manager, Broker Agent, Broker Read-only, Finance Admin, Content Admin and AI Admin.
2. Verify admin and broker users cannot perform sensitive actions before MFA verification.
3. Attempt cross-partner reads and mutations from a broker user.
4. Attempt export from a Support Admin without export permission.

Expected result: Unauthorized access and export attempts are refused, return no sensitive data and create AuditLog evidence.

## Scenario 4: Feature Flag and Rapid Disable

1. Enable a pilot country and product only after legal text and consent text exist.
2. Disable `country_public_enabled`.
3. Verify public access is blocked or waitlist-only according to configuration.
4. Disable an AI flag at global, country, product, partner or plan level.
5. Verify zero AI model calls occur for that scope.

Expected result: Disable actions become effective within 2 minutes and fail closed when cache coherence is uncertain.

## Scenario 5: Consent and Audit Evidence

1. Publish a ConsentText version for lead transmission.
2. Create a simulated ConsentRecord for future lead transmission.
3. Attempt a simulated future lead transmission without a valid ConsentRecord.
4. Search AuditLog by action, target, country/product scope and result.

Expected result: Missing consent blocks transmission and produces a refused AuditLog; valid consent evidence includes text version, purpose, channel, country, product and recipient scope.

## Scenario 6: Notifications, Queues, Routing Precheck and AI Foundation

1. Trigger a license-expiration warning.
2. Verify paired WhatsApp and email notification jobs are queued.
3. Verify each delivery status becomes visible as queued, delivered, failed or retryable within 5 minutes.
4. Run a routing pre-check for a partner with invalid license.
5. Verify result is `not_eligible`, reasons include license blocker and no broker lead notification is sent.
6. Configure an AI module as disabled and attempt an AI-assisted action.

Expected result: Async work is observable, routing pre-checks are non-transmissive and disabled AI makes no model call.

## Enterprise-Readiness Acceptance Dataset

Acceptance tests must be able to seed and query:

- 50 countries.
- 500 products.
- 5,000 partners.
- 100,000 users.
- Public catalog-read assumptions up to 50 million per month.

Expected result: Pagination, filtering, flag resolution, cache invalidation and public-read paths satisfy the SLOs defined in `plan.md`.

## Implementation Notes

- Workspace scripts now live in `package.json`: `typecheck`, `lint`, `test`, `test:unit`, `test:integration`, `test:contract`, `test:guardrails`, `test:web` and `validate`.
- Local dependencies are described by `docker-compose.yml` for PostgreSQL, Redis and S3-compatible object storage.
- The foundation modules are intentionally non-commercial: comparator, quote creation, policy issuance, payment, claims, advanced AI and advanced routing remain disabled or out of scope.
- Public/commercial feature flags remain disabled by default in `.env.example` and `backend/src/modules/feature-flags/default-flags.ts`.
