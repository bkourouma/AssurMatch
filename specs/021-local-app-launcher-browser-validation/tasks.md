# Tasks: Local App Launcher Browser Validation

**Input**: Design documents from `/specs/021-local-app-launcher-browser-validation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible. The spec is explicitly approved, contains no `[NEEDS CLARIFICATION]` markers and may continue through implementation and final validations. Stop on constitutional conflict, security/data leakage risk, forbidden activation or blocking validation failure.

**Tests**: Local health checks and opt-in Playwright browser smoke are required. Default `npm run test:web` must remain runnable without a launched local stack.

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create Spec Kit artifacts under specs/021-local-app-launcher-browser-validation/
- [X] T002 Add local app scripts directory scripts/local-app/
- [X] T003 Update package.json with local health and browser smoke npm scripts

---

## Phase 2: Foundational (Constitutional Prerequisites)

- [X] T004 Preserve public/back-office route separation in launcher port mapping and docs
- [X] T005 Ensure local launcher uses APP_ENV=local and NODE_ENV=development, not NODE_ENV=test
- [X] T006 Ensure local bootstrap admin remains operator-provided and documented without committed password
- [X] T007 Add Docker health checks for local PostgreSQL, Redis and Mailpit in docker-compose.yml

---

## Phase 3: User Story 1 - Launch The Local Stack (Priority: P1)

**Goal**: Start the full local app on the documented ports with local/dev infrastructure.

**Independent Test**: Run `cmd /c launch-local.bat`, then `npm run local:health`.

- [X] T008 [US1] Replace launch-local.bat with a PowerShell wrapper entry point
- [X] T009 [US1] Implement scripts/local-app/launch-local.ps1 with Docker Compose startup, port checks, migrations and seed
- [X] T010 [US1] Add scripts/local-app/api-runner.mjs for API startup on 3600

---

## Phase 4: User Story 2 - Stop And Inspect The Local Stack (Priority: P1)

**Goal**: Stop local app listeners and verify local service reachability.

**Independent Test**: Run `npm run local:health`, then `cmd /c stop-local.bat` twice.

- [X] T011 [US2] Replace stop-local.bat with a PowerShell wrapper entry point
- [X] T012 [US2] Implement scripts/local-app/stop-local.ps1 with idempotent process and Docker service stop
- [X] T013 [US2] Implement scripts/local-app/local-health.mjs for API, public, back-office, protected redirects and Mailpit checks

---

## Phase 5: User Story 3 - Validate Browser Visibility (Priority: P1)

**Goal**: Prove public, quote, back-office login, protected redirect and Mailpit screens in a real browser.

**Independent Test**: Run `npm run test:web:local` after launching the stack.

- [X] T014 [US3] Add apps/public/tests/local-app-launcher-browser.spec.ts with opt-in browser smoke
- [X] T015 [US3] Add scripts/local-app/local-browser-smoke.mjs wrapper that enables the local smoke environment
- [X] T016 [US3] Keep default npm run test:web passing without launched local servers

---

## Phase 6: User Story 4 - Seed And Bootstrap Safely (Priority: P2)

**Goal**: Seed local synthetic data and document safe bootstrap admin operation.

**Independent Test**: Run launcher migrations/seed and inspect docs for no committed password.

- [X] T017 [US4] Ensure launch-local.ps1 runs Prisma migrate deploy and db seed
- [X] T018 [US4] Document local bootstrap admin command in specs/021-local-app-launcher-browser-validation/quickstart.md
- [X] T019 [US4] Add docs/local-app-quickstart.md with "How to see the app locally" and required URLs

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T020 Run npm run test:web and verify local browser smoke remains opt-in
- [X] T021 Run local health/browser smoke when local stack is available
- [X] T022 Run required final validation suite and record results
- [X] T023 Check off completed tasks in specs/021-local-app-launcher-browser-validation/tasks.md

## Dependencies & Execution Order

- Setup and foundational tasks must complete before launch/browser smoke work.
- US1 and US2 are both P1 and can be validated independently.
- US3 depends on a running stack from US1.
- US4 depends on launch-time migrations and seed.

## Implementation Strategy

1. Add PowerShell-based launch/stop implementation.
2. Add health and browser smoke wrappers.
3. Add docs and Spec Kit artifacts.
4. Validate default suites, then launch local stack and run live checks where possible.
