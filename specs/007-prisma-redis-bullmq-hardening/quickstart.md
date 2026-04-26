# Quickstart: Prisma Redis BullMQ Hardening

This quickstart describes the target local validation flow for spec 007. It is
planning guidance only until implementation tasks are generated.

## Prerequisites

- Node.js >=24.15.0
- npm workspace install complete
- Local PostgreSQL reachable from `DATABASE_URL`
- Local Redis reachable from `REDIS_URL`
- Safe local secrets in `.env`

## Environment

Start from `.env.example` and keep all regulated modules disabled:

```text
NODE_ENV=local
APP_ENV=local
DATABASE_URL=postgresql://assurmatch:assurmatch@localhost:5432/assurmatch
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-local-secret-only
SESSION_SECRET=replace-with-local-secret-only
BROKER_CRM_ENABLED=false
PAYMENTS_ENABLED=false
E_SIGNATURE_ENABLED=false
POLICY_ISSUANCE_ENABLED=false
CLAIMS_ENABLED=false
INSURER_API_ENABLED=false
AI_LEAD_SCORING_ENABLED=false
AI_SUMMARY_ENABLED=false
AI_DUPLICATE_DETECTION_ENABLED=false
AI_RECOMMENDATION_ENABLED=false
AI_BROKER_ASSISTANT_ENABLED=false
```

Memory overrides such as `ASSURMATCH_PRISMA_MEMORY`,
`ASSURMATCH_REDIS_MEMORY` and `ASSURMATCH_QUEUE_MEMORY` are for explicit tests
only and must not be used in production/runtime-normal validation.

## Local Services

Use the project's accepted local service workflow. If none exists after
planning, add a minimal development-only compose file for PostgreSQL and Redis.
The target service set is:

```text
postgres: local AssurMatch database
redis: cache, locks, rate limits and BullMQ backing store
```

## Fresh Database Validation

Target commands after implementation:

```powershell
npm install
npx prisma validate --schema backend/prisma/schema.prisma
npx prisma migrate reset --schema backend/prisma/schema.prisma
npm run test:integration -- backend/tests/integration/prisma-migrations.spec.ts
```

The reset must apply migrations from zero, run the seed, and require no manual
SQL fixes.

## Runtime Adapter Validation

Target checks after implementation:

```powershell
npm run test:integration -- backend/tests/integration/runtime-adapters.spec.ts
npm run test:integration -- backend/tests/integration/runtime-audit-repository.spec.ts
npm run test:guardrails -- backend/tests/guardrails/content/redis-pii-keys.spec.ts
```

Expected result:

- Prisma runtime mode is real outside tests.
- Redis runtime mode is real outside tests.
- BullMQ queue runtime mode is real outside tests.
- Audit repository is Prisma-backed outside tests.
- Memory adapters are present only in explicit unit tests.

## Critical HTTP Validation

Target checks after implementation:

```powershell
npm run test:integration -- backend/tests/integration/public-quote-runtime-http.spec.ts
npm run test:integration -- backend/tests/integration/runtime-audit-http.spec.ts
npm run test:integration -- backend/tests/integration/auth/tenant-isolation.spec.ts
npm run test:integration -- backend/tests/integration/public-quotes/rate-limit.spec.ts
npm run test:integration -- backend/tests/integration/public-quotes/anti-spam.spec.ts
npm run test:integration -- backend/tests/integration/public-quotes/duplicate-detection.spec.ts
npm run test:integration -- backend/tests/integration/notifications/notification-jobs.spec.ts
```

Expected result:

- Quote request, consent, routing/refusal and audit persist.
- No lead routes without consent.
- Expired or invalid license blocks routing.
- Tenant isolation remains strict.
- Public abuse controls use Redis runtime behavior.
- Visitor and broker notification jobs are enqueued with BullMQ.

## Full Validation

Run the full validation suite before reporting implementation complete:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
```

If any suite requires PostgreSQL or Redis, the test output must make that
dependency explicit and must not silently switch to memory for runtime
acceptance.

## Production Safety Checklist

- `DATABASE_URL` is present and valid.
- `REDIS_URL` is present and valid.
- Memory override variables are absent.
- Regulated feature flags are false unless explicitly approved elsewhere.
- `broker_crm_enabled` is false unless explicitly persisted true for the allowed
  scope.
- Health checks expose database, Redis, BullMQ, feature flag and audit status.
- Logs do not include raw PII, Redis credentials, JWT/session secrets or full
  notification payloads.
