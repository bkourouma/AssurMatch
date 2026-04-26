# Quickstart: API Runtime Integration AssurMatch

This quickstart is for planning and later implementation validation. It does
not implement the runtime by itself.

## Prerequisites

- Node.js >=24.15.0
- npm workspaces installed
- PostgreSQL available for runtime/e2e validation
- Redis available for runtime/e2e validation
- Environment variables prepared outside committed files:
  - `DATABASE_URL`
  - `REDIS_URL`
  - auth secret/session settings
  - public app API base URL
  - broker/admin app API base URL

## Install

```powershell
npm install
```

## Planned Runtime Validation Flow

1. Validate TypeScript and static checks.

```powershell
npm run typecheck
npm run lint
```

2. Validate Prisma schema and migrations from a fresh database.

```powershell
npx prisma validate --schema backend/prisma/schema.prisma
npx prisma migrate reset --schema backend/prisma/schema.prisma
```

3. Seed minimal runtime/e2e fixtures when the seed script exists.

```powershell
npm run seed:e2e
```

4. Start backend API with real Prisma, Redis and BullMQ configuration.

```powershell
npm run dev:backend
```

5. Start the public and back-office apps separately.

```powershell
npm run dev:public
npm run dev:broker
npm run dev:admin
```

6. Run backend tests.

```powershell
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:guardrails
```

7. Run real browser smoke tests.

```powershell
npm run test:web
```

8. Run full validation.

```powershell
npm run validate
```

## Minimum Acceptance Dataset

- One enabled public country.
- One disabled or waitlist-only country.
- Two products, with one public/quote-enabled and one disabled or quote-disabled.
- One active validated offer and one expired/non-validated offer.
- Published consent text for lead transmission.
- One active eligible broker with valid license.
- One broker with expired/suspended/invalid license.
- One Starter broker user with MFA.
- One Pro broker user with MFA.
- One Broker Read-only user.
- One authorized admin user.
- Feature flags with safe defaults, especially CRM and regulated modules false
  unless explicitly enabled for the test scenario.

## Smoke Scenarios To Prove

- Public app reads countries/products/offers from API.
- Public quote request with consent creates durable state and returns
  confirmation.
- Public quote request without consent is refused and audited.
- Expired license blocks routing.
- Starter broker lists own leads and cannot access CRM.
- Pro broker accesses CRM only when `broker_crm_enabled=true`.
- `broker_crm_enabled=false` denies CRM.
- Read-only actor cannot mutate.
- AuditLog persists after sensitive actions and can be searched by authorized
  admin.
- Public app never calls broker/admin APIs.

## Stop Conditions

- Any route inventory showing zero routes.
- Any public route exposing broker/admin data.
- Any lead transmission without ConsentRecord.
- Any route allowing cross-tenant lead access.
- Any runtime registering memory Prisma/Redis/queue/audit adapters outside test.
- Any default activation of payments, e-signature, policy issuance, attestation,
  claims, advanced insurer API or advanced AI.
