# Quickstart: API HTTP Wiring AssurMatch

This quickstart is for planning and future implementation validation of spec
008. It does not create `tasks.md` and does not implement code.

## Prerequisites

- Node.js >=24.15.0.
- npm workspace install completed.
- PostgreSQL/Prisma, Redis and BullMQ setup from spec 007 quickstart when
  running runtime persistence/integration suites.
- Safe local/test secrets for auth token signing.
- Seed data with at least:
  - one public country;
  - one public product;
  - one published quote form;
  - one published consent text;
  - one active eligible broker with valid license;
  - one Starter actor;
  - one Pro/Enterprise actor;
  - one admin/compliance actor;
  - sensitive flags absent/false by default and explicit true only for tests
    that require it.

## Plan Artifacts

```powershell
Get-ChildItem specs\008-api-http-wiring
Get-Content specs\008-api-http-wiring\plan.md
Get-Content specs\008-api-http-wiring\research.md
Get-Content specs\008-api-http-wiring\data-model.md
Get-Content specs\008-api-http-wiring\contracts\runtime-http-wiring-contract.md
```

`tasks.md` should not exist after `/speckit.plan` for this request.

```powershell
Test-Path specs\008-api-http-wiring\tasks.md
```

Expected result: `False`.

## Baseline Validation Commands

Run these before and after future implementation:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:guardrails
```

Full validation:

```powershell
npm run validate
```

## Runtime HTTP Validation Mode

The existing integration harness can bootstrap `AppModule` directly. Future
spec 008 tests should use the same style or an equivalent real HTTP path:

```powershell
npm run test:integration -- backend/tests/integration/public-runtime-http.spec.ts
npm run test:integration -- backend/tests/integration/runtime-route-inventory.spec.ts
npm run test:integration -- backend/tests/integration/runtime-http-auth-rbac-validation.spec.ts
```

Future implementation should add or strengthen HTTP e2e coverage for:

- real decorated controller ownership for P1 routes;
- `GET /countries`;
- `POST /quote-requests` success with consent and publicReference;
- no-consent refusal with durable audit;
- disabled country/product refusal;
- no eligible broker/offer refusal;
- Starter CRM denial;
- `broker_crm_enabled` false/absent denial;
- cross-broker denial;
- read-only mutation denial;
- admin audit logs read from durable persistence;
- admin feature flag mutation audit/history/cache behavior.

## Local API Startup

The backend entrypoint supports `PORT`:

```powershell
$env:PORT = "3000"
npx tsx backend/src/main.ts
```

For runtime-normal validation, configure the dependencies established by spec
007, especially:

```powershell
$env:DATABASE_URL = "postgresql://user:password@127.0.0.1:5432/assurmatch"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:NODE_ENV = "test"
$env:ASSURMATCH_ALLOW_TEST_AUTH_HEADERS = "true"
```

Do not use test simulation headers in production/runtime-normal validation.

## Playwright Runtime Mode

Existing Playwright config runs `apps/**/*.spec.ts`. Spec 008 requires real
navigation when environment URLs are present. Recommended variables:

```powershell
$env:ASSURMATCH_E2E_API_URL = "http://127.0.0.1:3000"
$env:ASSURMATCH_E2E_PUBLIC_URL = "http://127.0.0.1:3001"
$env:ASSURMATCH_E2E_BROKER_URL = "http://127.0.0.1:3002"
$env:ASSURMATCH_E2E_ADMIN_URL = "http://127.0.0.1:3003"
```

Then run:

```powershell
npm run test:web
```

If these URLs are not configured, Playwright tests may skip runtime navigation,
but must say so explicitly and must not count as P1 runtime acceptance.

## Frontend Validation Expectations

Web Publique Client:

- quote form calls `POST /quote-requests`;
- success displays `publicReference`;
- missing consent is blocked client-side and refused server-side;
- API errors are visible and not hidden behind `[]` or `{}`;
- public app does not import back-office auth/session helpers.

Back-office Partenaires/Plateforme:

- broker app uses `/broker/...` with token/session;
- admin app uses `/admin/...` with token/session;
- unauthenticated, forbidden, MFA required, read-only and unavailable states are
  visible;
- no protected screen uses public API calls to bypass auth.

## Contract Validation Expectations

Future contract/OpenAPI tests should validate:

- route method/path inventory;
- owning decorated controller for migrated routes;
- public/broker/admin auth requirements;
- request/response schemas linked to shared contracts;
- standard status mapping;
- absence of active regulated routes for payments, subscription, policy
  issuance, attestation, e-signature, claims and advanced AI.

## Stop Conditions

Stop planning or implementation if any of these appears:

- public/back-office separation would be weakened;
- lead transmission could occur without consent;
- CRM could open for Starter or without `broker_crm_enabled=true`;
- tenant isolation cannot be proven;
- durable audit cannot be written or explicitly failed for critical actions;
- a regulated module would be activated by default;
- tests would remain structural-only for a P1 runtime acceptance scenario;
- implementation would require new business behavior not present in specs
  001-007.
