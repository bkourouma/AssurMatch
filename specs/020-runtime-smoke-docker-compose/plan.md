# Implementation Plan: Runtime Smoke Docker Compose

**Branch**: `020-runtime-smoke-docker-compose` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-runtime-smoke-docker-compose/spec.md`

**Continuous Workflow Eligibility**: Eligible. The spec is explicitly approved,
contains no `[NEEDS CLARIFICATION]` markers and is a standard runtime hardening
feature. Continue through `/speckit.tasks` and `/speckit.implement` unless a
constitutional, security, compliance, secret-leakage or blocking validation
risk appears. Do not commit automatically.

## Summary

Add a dedicated runtime smoke Docker Compose environment for PostgreSQL and
Redis on non-standard ports, wire npm lifecycle scripts for start/test/down,
harden the existing runtime PostgreSQL smoke guardrails against unsafe
`DATABASE_URL`, `NODE_ENV=test`, query-string schema markers, local `5432` and
memory adapters, and update documentation so local and CI runs use the same
reproducible smoke contract. No business feature, Prisma schema change,
migration, frontend route, regulated module or real secret is introduced.

## Technical Context

**Language/Version**: TypeScript strict on Node >=24.15.0, NestJS backend,
Prisma 7, Vitest 4, Playwright 1.59 and Docker Compose.
**Primary Dependencies**: Existing Node runtime, `tsx`, Prisma CLI,
PostgreSQL Docker image, Redis Docker image, Vitest, npm scripts. No new npm
dependency is required.
**Storage**: Dedicated disposable PostgreSQL database
`assurmatch_runtime_smoke` and dedicated Redis smoke service. No Prisma schema
change and no migration file are created.
**Testing**: Vitest guardrail/unit tests for smoke configuration, existing
runtime PostgreSQL smoke, Prisma schema validation, standard typecheck/lint/test
suite, Playwright suite when available, npm audit, diff check and secret scan.
**Target Platform**: Local Windows PowerShell developer machines and GitHub
Actions/CI runners with Docker, plus the existing AssurMatch backend runtime.
**Impacted Application(s)**: Backend API runtime smoke tooling, repository root
scripts/configuration, documentation and Spec Kit artifacts. Web Publique Client
and Back-office Partenaires/Plateforme have no functional changes.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Docker smoke services should become healthy within a
bounded operator wait, and the lifecycle scripts should fail fast on unsafe
configuration before migrations, seed or HTTP smoke execution.
**Constraints**: No `NODE_ENV=test`; no `?schema=runtime_smoke`; database name
must contain `smoke`; default PostgreSQL port is `55432`; default Redis port is
`56379`; `localhost:5432` and `127.0.0.1:5432` are refused by default; production
or production-like targets are refused; `ASSURMATCH_*_MEMORY=true` is refused;
no real secrets are committed or logged.
**Scale/Scope**: Single dedicated smoke environment and scripts for local/CI
runtime verification. No CI/CD refactor beyond documented commands.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The feature only hardens technical runtime
  smoke execution and does not introduce direct insurance sale, subscription,
  premium collection, policy issuance, attestation or binding advice.
- **Regulatory and consent**: Pass/N/A. The environment does not change lead
  collection or transmission. Existing runtime smoke scenarios that exercise
  quote requests must keep ConsentRecord requirements from spec 011.
- **Feature flags and activation**: Pass. No regulated feature flag is modified
  or activated. Existing smoke feature-flag checks remain within their current
  test scope.
- **Frontend application separation**: Pass. No Web Publique Client or
  Back-office route, layout, policy or auth state is changed.
- **Security and RBAC**: Pass. The plan adds guardrails against unsafe database
  targets, memory adapters, production-like names and secret leakage. Existing
  RBAC behavior is only exercised by the runtime smoke.
- **Data and auditability**: Pass. Disposable smoke data remains synthetic and
  isolated. No durable business data model is changed.
- **Routing integrity**: Pass/N/A. Routing logic is unchanged; existing runtime
  smoke scenarios keep the routing constraints they already validate.
- **AI control**: N/A. No AI module, model call, prompt or AI flag is added.
- **UX and content safety**: N/A. No public UI or content wording is changed.
- **Testing discipline**: Pass. Plan includes guardrail tests for the new unsafe
  cases plus final validation commands requested by the user.
- **Async and reliability**: Pass. Redis smoke is provisioned explicitly for
  runtime services that need Redis/BullMQ; no new async workload is introduced.
- **Continuous workflow safety**: Pass. User explicitly approved continuous
  plan/tasks/implement and no auto-commit; no clarification markers remain.

## Project Structure

### Documentation (this feature)

```text
specs/020-runtime-smoke-docker-compose/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    runtime-smoke-compose.md
  tasks.md
  checklists/
    requirements.md
```

### Source Code (repository root)

```text
docker-compose.runtime-smoke.yml
package.json
docs/
  runtime-postgres-smoke.md
backend/
  tests/
    runtime-postgres/
      runtime-postgres-smoke-env.ts
      run-runtime-postgres-smoke.ts
    unit/
      runtime-postgres/
        runtime-postgres-smoke-env.spec.ts
scripts/
  runtime-smoke/
    runtime-smoke-env.mjs
    runtime-smoke-up.mjs
    runtime-smoke-down.mjs
    runtime-smoke-run.mjs
```

**Structure Decision**: Keep runtime smoke validation close to the existing
`backend/tests/runtime-postgres/` suite, and put cross-platform operator
lifecycle commands under `scripts/runtime-smoke/`. Root npm scripts expose the
operator workflow. Frontend applications remain untouched.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Post-Design Constitution Check

- **Security/data leakage**: Pass. The design masks `DATABASE_URL` in script
  output, uses non-sensitive smoke credentials only, refuses production-like
  targets and avoids real secrets.
- **Frontend separation**: Pass. No frontend files are in scope.
- **Regulated activation**: Pass. No regulated flags, modules or product flows
  are enabled.
- **Testing**: Pass. The plan creates targeted unit tests for guardrails and
  uses the existing runtime smoke for end-to-end validation when Docker is
  available.
