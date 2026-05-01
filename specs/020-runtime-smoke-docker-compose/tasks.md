# Tasks: Runtime Smoke Docker Compose

**Input**: Design documents from `/specs/020-runtime-smoke-docker-compose/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible. The spec is explicitly approved, contains no
`[NEEDS CLARIFICATION]` markers and may continue through implementation and
final validations. Stop on constitutional conflict, security/data leakage risk,
forbidden activation or blocking validation failure. Do not commit
automatically.

**Tests**: Guardrail tests are required for unsafe `DATABASE_URL`, `NODE_ENV`,
memory adapters and port behavior. The existing runtime PostgreSQL smoke is the
end-to-end validation when Docker is available.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the dedicated smoke infrastructure and command surface.

- [X] T001 Add dedicated runtime smoke Compose services in docker-compose.runtime-smoke.yml
- [X] T002 [P] Add runtime smoke lifecycle constants and safe environment builder in scripts/runtime-smoke/runtime-smoke-env.mjs
- [X] T003 [P] Update package.json with runtime smoke start, run, down, clean and full lifecycle npm scripts

---

## Phase 2: Foundational (Safety Guardrails)

**Purpose**: Harden configuration checks before any smoke user story can execute.

- [X] T004 Harden DATABASE_URL and NODE_ENV validation in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [X] T005 Add ASSURMATCH_*_MEMORY=true detection in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [X] T006 Add targeted guardrail unit tests in backend/tests/unit/runtime-postgres/runtime-postgres-smoke-env.spec.ts
- [X] T007 Verify no Prisma schema or migration files are changed

**Checkpoint**: Unsafe configurations are refused before migrations, seed or runtime startup.

---

## Phase 3: User Story 1 - Demarrer un environnement smoke dedie (Priority: P1)

**Goal**: Start PostgreSQL smoke on 55432 and Redis smoke on 56379 without using local default ports.

**Independent Test**: Run `npm run test:runtime:postgres:up` and inspect Docker Compose services/ports.

- [X] T008 [US1] Implement smoke Compose up command in scripts/runtime-smoke/runtime-smoke-up.mjs
- [X] T009 [US1] Ensure Docker Compose up uses docker-compose.runtime-smoke.yml and smoke project naming in scripts/runtime-smoke/runtime-smoke-up.mjs
- [X] T010 [US1] Document port conflict behavior in specs/020-runtime-smoke-docker-compose/quickstart.md

---

## Phase 4: User Story 2 - Executer le smoke PostgreSQL avec une URL sure (Priority: P1)

**Goal**: Run the existing runtime PostgreSQL smoke against the dedicated smoke database and Redis.

**Independent Test**: Run `npm run test:runtime:postgres` after `up` and verify the sanitized target is `localhost:55432/assurmatch_runtime_smoke`.

- [X] T011 [US2] Implement runtime smoke run wrapper in scripts/runtime-smoke/runtime-smoke-run.mjs
- [X] T012 [US2] Wire npm run test:runtime:postgres to the wrapper while preserving the existing TypeScript smoke runner
- [X] T013 [US2] Ensure wrapper sets DATABASE_URL, REDIS_URL, NODE_ENV and ASSURMATCH_RUNTIME_SMOKE safe defaults in scripts/runtime-smoke/runtime-smoke-env.mjs

---

## Phase 5: User Story 3 - Refuser les environnements dangereux (Priority: P1)

**Goal**: Refuse `NODE_ENV=test`, `?schema=runtime_smoke`, non-smoke database names, production-like names, local 5432 by default and memory adapters.

**Independent Test**: Run the guardrail Vitest file and verify each unsafe configuration throws before runtime startup.

- [X] T014 [US3] Reject database names without smoke in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [X] T015 [US3] Reject schema=runtime_smoke query strings in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [X] T016 [US3] Reject localhost:5432 and 127.0.0.1:5432 by default in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [X] T017 [US3] Reject production-like targets and ASSURMATCH_*_MEMORY=true in backend/tests/unit/runtime-postgres/runtime-postgres-smoke-env.spec.ts

---

## Phase 6: User Story 4 - Arreter et nettoyer proprement l'environnement smoke (Priority: P2)

**Goal**: Stop smoke containers and optionally remove only smoke-scoped volumes.

**Independent Test**: Run `npm run test:runtime:postgres:down` and `npm run test:runtime:postgres:clean` idempotently.

- [X] T018 [US4] Implement smoke Compose down and clean command in scripts/runtime-smoke/runtime-smoke-down.mjs
- [X] T019 [US4] Add full lifecycle command behavior in scripts/runtime-smoke/runtime-smoke-run.mjs
- [X] T020 [US4] Document down versus clean behavior in docs/runtime-postgres-smoke.md

---

## Phase 7: User Story 5 - Documenter le quickstart local et CI (Priority: P2)

**Goal**: Make the local and CI operator workflow reproducible without implicit PostgreSQL Windows/local usage.

**Independent Test**: Follow docs commands and verify they reference 55432/56379 and the guardrails.

- [X] T021 [US5] Update docs/runtime-postgres-smoke.md with dedicated Compose workflow and guardrails
- [X] T022 [US5] Update specs/020-runtime-smoke-docker-compose/quickstart.md with final npm commands and CI notes
- [X] T023 [US5] Ensure documentation does not include real secrets or full sensitive URLs

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate implementation and task accounting.

- [X] T024 [P] Run targeted guardrail tests with npm run test -- backend/tests/unit/runtime-postgres/runtime-postgres-smoke-env.spec.ts
- [X] T025 [P] Run npm run test:runtime:postgres:up if Docker is available
- [X] T026 [P] Run npm run test:runtime:postgres if Docker is available
- [X] T027 [P] Run npm run test:runtime:postgres:down if Docker is available
- [X] T028 Run required final validation suite and record results
- [X] T029 Check off completed tasks in specs/020-runtime-smoke-docker-compose/tasks.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on setup and blocks user stories.
- **US1/US2/US3 (P1)**: depend on foundational guardrails.
- **US4/US5 (P2)**: depend on scripts and guardrails.
- **Polish**: depends on all implementation phases.

### User Story Dependencies

- **US1** can be validated independently with Docker Compose up.
- **US2** depends on US1 for an available database, but the wrapper remains independently testable via guardrails.
- **US3** is foundational safety and must pass before treating US1/US2 as complete.
- **US4** depends on Compose project naming from US1.
- **US5** depends on final command names.

### Parallel Opportunities

- T002 and T003 can run in parallel with T001.
- Documentation updates can be drafted while scripts are implemented, then reconciled.
- Final validation commands can be run independently where they do not mutate shared Docker state.

## Implementation Strategy

1. Add Compose and lifecycle scripts.
2. Harden the existing smoke environment validation.
3. Add focused guardrail tests.
4. Update npm scripts and docs.
5. Run targeted tests, Docker smoke when available and final validation suite.
6. Mark all completed tasks and report residual risks.
