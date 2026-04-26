# Contract: Runtime PostgreSQL Smoke Tests

This contract defines the expected behavior of the future
`test:runtime:postgres` smoke suite. It is a technical test contract, not a new
public API contract.

## Command Contract

### Script

Recommended root script:

```text
npm run test:runtime:postgres
```

The exact implementation may use a wrapper script, a dedicated Vitest config or
a direct `tsx` runner, but it must execute only the runtime PostgreSQL smoke
suite.

### Required Environment

```text
NODE_ENV=runtime-smoke
ASSURMATCH_RUNTIME_SMOKE=true
DATABASE_URL=postgresql://.../assurmatch_runtime_smoke...
```

Optional environment:

```text
REDIS_URL=redis://localhost:6379
BULLMQ_PREFIX=assurmatch-runtime-smoke
ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA=false
ASSURMATCH_RUNTIME_SMOKE_RUN_ID=<explicit-run-id>
```

### Forbidden Environment

The command must fail before migration or seed when:

- `NODE_ENV=test`;
- `DATABASE_URL` is missing or not PostgreSQL;
- `DATABASE_URL` appears to target production, staging or a shared non-smoke DB;
- `ASSURMATCH_RUNTIME_SMOKE` is not true when required;
- any memory override is true:
  `ASSURMATCH_PRISMA_MEMORY`, `ASSURMATCH_REDIS_MEMORY`,
  `ASSURMATCH_QUEUE_MEMORY`, `ASSURMATCH_AUDIT_MEMORY`.

## Startup Contract

Before scenarios run, the suite must:

1. Validate environment and sanitized database target.
2. Validate Prisma schema.
3. Apply or verify migrations against the smoke DB.
4. Start the NestJS backend through the real runtime wiring.
5. Listen on an ephemeral localhost port.
6. Create a separate verifier `PrismaClient`.
7. Assert critical repositories are Prisma-runtime, not memory-test.

Startup must not print secrets, raw `DATABASE_URL` credentials or real PII.

## HTTP Scenario Contract

All route calls must use real HTTP requests to the started backend.

### Health/runtime

Request:

```text
GET /admin/system/health
```

Auth:

- authorized synthetic super admin actor/token with MFA state when required.

Expected:

- HTTP success;
- runtime dependencies healthy according to existing contract;
- no secrets in response;
- repository runtime guard passes.

### Public catalog

Requests:

```text
GET /countries
GET /countries/:countryCode/products
GET /countries/:countryCode/products/:productKey/offers
```

Expected:

- smoke country, product and offer are visible when active and flagged;
- response values match direct PostgreSQL rows;
- expired/inactive smoke offer is not visible if seeded.

### Quote request with consent

Request:

```text
POST /quote-requests
```

Payload:

- existing `QuoteRequestCreateDto` contract;
- valid smoke country/product/form fields;
- valid consent accepted with expected text/version/scope;
- synthetic visitor PII only;
- smoke correlation id header.

Expected HTTP:

- success according to existing route contract.

Expected DB:

- `Prospect` exists;
- `ConsentRecord` exists;
- `QuoteRequest` exists;
- `LeadAssignment` exists when eligible broker is seeded;
- `RoutingDecision` or equivalent trace exists when modeled;
- `AuditLog` exists for sensitive action.

### Quote request without consent

Request:

```text
POST /quote-requests
```

Payload:

- existing quote payload with consent absent, false or invalid according to
  current validation.

Expected HTTP:

- refusal according to existing route contract.

Expected DB:

- no valid routable quote request;
- no `LeadAssignment`;
- no broker notification for the refused request;
- refusal audit/trace exists if current behavior defines one.

### Broker Starter tenant isolation

Request:

```text
GET /broker/starter/leads
```

Auth:

- broker Starter A actor/token;
- broker Starter B actor/token.

Expected:

- A sees A's assigned smoke lead;
- B does not see A's lead;
- direct DB tenant ownership matches HTTP visibility.

### Broker CRM Pro enabled and disabled

Request:

```text
GET /broker/crm/leads
```

Auth:

- broker Pro actor/token.

Expected with `broker_crm_enabled=true`:

- HTTP success;
- Pro broker sees its assigned smoke lead.

Expected with `broker_crm_enabled=false` or absent:

- HTTP refusal;
- no lead data returned.

### Feature flags

Expected:

- sensitive flags are absent/false by default;
- `broker_crm_enabled` must be persisted true for CRM success;
- payments, e-signature, policy issuance, claims, insurer API and AI-sensitive
  flags remain absent/false throughout the smoke run.

### Durable audit

DB expected:

- `AuditLog` exists for at least one sensitive smoke action by correlation id.

Optional HTTP request if endpoint exists:

```text
GET /admin/audit-logs
```

Expected:

- authorized admin can retrieve smoke audit under existing pagination/contract;
- unauthorized actor is refused.

## Direct Database Verification Contract

The verifier must use `PrismaClient` with the same smoke `DATABASE_URL`.

Assertions must query by one or more smoke identifiers:

- smoke run id;
- correlation id;
- synthetic email;
- synthetic partner legal name;
- synthetic license number;
- country/product/offer IDs;
- IDs returned by HTTP responses.

Assertions must verify relationships, not only row counts:

- quote links to prospect and consent;
- assignment links to intended partner tenant;
- routing decision links to quote request where modeled;
- audit links to action/correlation where available.

## Cleanup Contract

Cleanup must:

- run before seed and after test completion;
- use scoped filters only;
- delete in reverse dependency order;
- never run broad deletes without smoke markers;
- fail the suite on unexpected cleanup errors;
- retain isolated audit rows when audit deletion is not allowed.

When `ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA=true`, cleanup may skip deletion after
the run for debugging, but it must print the smoke run id and must still refuse
non-smoke databases.

## Failure Semantics

The suite must return non-zero when:

- environment safety validation fails;
- migrations/schema validation fails;
- server startup fails;
- repository guard fails;
- any required HTTP scenario fails;
- any required direct DB assertion fails;
- cleanup fails unexpectedly.

Failures must be actionable and sanitized.

