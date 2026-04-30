# Tasks: Email Delivery Runtime

**Input**: Design documents from `/specs/019-email-delivery-runtime/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible. Proceed through implementation and final
validations without intermediate confirmation unless constitutional, security,
compliance, secret-leakage or blocking validation risk appears. Do not commit
automatically.

**Tests**: Unit and integration tests are required for runtime config,
templates, SMTP/Mailpit transport, auth notification integration, secret
masking and public/back-office separation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare feature docs and working context.

- [X] T001 [P] Create `specs/019-email-delivery-runtime/plan.md` with constitution gates and technical approach.
- [X] T002 [P] Create `specs/019-email-delivery-runtime/research.md`, `data-model.md`, `contracts/email-runtime.md` and `quickstart.md`.
- [X] T003 Update `AGENTS.md` current plan pointer to `specs/019-email-delivery-runtime/plan.md`.

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Define configuration, boundaries and safety controls before story work.

- [X] T004 [P] Add email runtime configuration parsing and validation in `backend/src/modules/notifications/email/email-config.ts`.
- [X] T005 [P] Add email delivery types/port and safe recipient masking in `backend/src/modules/notifications/email/email-delivery.service.ts`.
- [X] T006 [P] Add activation/password-reset template rendering in `backend/src/modules/notifications/email/email-template.service.ts`.
- [X] T007 Update `backend/src/config/config.module.ts` to validate and expose email config with production Mailpit refusal and SMTP required env checks.
- [X] T008 Document safe env examples in `.env.example` and `.env.preproduction.example` using REDACTED placeholders only.

---

## Phase 3: User Story 1 - Deliver auth security emails (Priority: P1)

**Goal**: Activation and password reset messages are delivered through configured runtime email.

**Independent Test**: Configure SMTP/Mailpit sender, issue activation/reset, and verify sent status without token leakage in audit/log metadata.

### Tests for User Story 1

- [X] T009 [P] [US1] Add config validation tests in `backend/tests/unit/notifications/email-config.spec.ts`.
- [X] T010 [P] [US1] Add template wording tests in `backend/tests/unit/notifications/email-template.service.spec.ts`.
- [X] T011 [P] [US1] Add SMTP mock sender tests in `backend/tests/unit/notifications/smtp-email-sender.spec.ts`.
- [X] T012 [P] [US1] Update auth notification integration tests in `backend/tests/integration/auth/auth-password-reset-email.spec.ts`.

### Implementation for User Story 1

- [X] T013 [US1] Add SMTP/Mailpit transport in `backend/src/modules/notifications/email/smtp-email-sender.ts`.
- [X] T014 [US1] Add runtime email delivery service with disabled, mailpit and smtp behavior plus safe audit metadata in `backend/src/modules/notifications/email/email-delivery.service.ts`.
- [X] T015 [US1] Update `backend/src/modules/notifications/user-auth-notification.service.ts` to use text/html templates, delivery statuses and admin-only token fallback on failed/not-configured delivery.
- [X] T016 [US1] Wire runtime email delivery into `backend/src/runtime/assurmatch-runtime.ts`.
- [X] T017 [US1] Wire admin user controllers to runtime notification sender in `backend/src/runtime/runtime-http.controller.ts` and `backend/src/modules/http-wiring/runtime-http-wiring.module.ts`.
- [X] T018 [US1] Update `backend/src/modules/auth/auth.module.ts` to expose runtime notification service for admin lifecycle wiring.

---

## Phase 4: User Story 2 - Verify local and preproduction delivery (Priority: P2)

**Goal**: Operators can verify auth emails through Mailpit without external sends or secrets in scripts.

**Independent Test**: Launch local/preprod config and confirm Mailpit env uses safe placeholders and production refuses Mailpit.

### Tests for User Story 2

- [X] T019 [P] [US2] Add Mailpit/local config tests to `backend/tests/unit/notifications/email-config.spec.ts`.
- [X] T020 [P] [US2] Add script/env secret guardrail test in `backend/tests/guardrails/email-secret-scan.spec.ts`.

### Implementation for User Story 2

- [X] T021 [US2] Update `launch-local.bat` and `launch-preprod.bat` with safe `EMAIL_SERVICE_TYPE` defaults and no secrets.
- [X] T022 [US2] Update `stop-local.bat`/`stop-preprod.bat` documentation references only if needed.
- [X] T023 [US2] Update `specs/019-email-delivery-runtime/quickstart.md` with Mailpit and Gmail app-password operator guidance.

---

## Phase 5: User Story 3 - Observe delivery failures safely (Priority: P3)

**Goal**: Delivery attempts and failures are observable without exposing PII, tokens or SMTP secrets.

**Independent Test**: Force sent, failed and not-configured paths and inspect audit metadata for status, purpose and masked recipient only.

### Tests for User Story 3

- [X] T024 [P] [US3] Add email delivery audit/masking tests in `backend/tests/unit/notifications/email-delivery.service.spec.ts`.
- [X] T025 [P] [US3] Add integration coverage that delivery failures return token preview without logging secrets in `backend/tests/integration/auth/auth-password-reset-email.spec.ts`.
- [X] T026 [P] [US3] Add public app separation guardrail that no email/back-office route is exposed in Web Publique Client.

### Implementation for User Story 3

- [X] T027 [US3] Ensure delivery service audits `email.delivery.sent`, `email.delivery.failed` and `email.delivery.not_configured` with masked recipient metadata only.
- [X] T028 [US3] Ensure SMTP errors are mapped to safe error classes without provider responses containing credentials.
- [X] T029 [US3] Ensure no Web Publique Client code is modified for runtime email delivery.

---

## Phase 6: Polish & Validation

**Purpose**: Finish docs, task status and validation.

- [X] T030 [P] Run focused email tests and fix issues.
- [X] T031 Run `npm run typecheck`.
- [X] T032 Run `npm run lint`.
- [X] T033 Run `npm run test`.
- [X] T034 Run `npm run test:web`.
- [X] T035 Run `npm run build`.
- [X] T036 Run `npx prisma validate --schema backend/prisma/schema.prisma`.
- [X] T037 Confirm no migration/base-fresh validation is required because schema is untouched.
- [X] T038 Run `npm audit --audit-level=high`.
- [X] T039 Run `git diff --check`.
- [X] T040 Run secret scan confirming no real `EMAIL_SMTP_PASS` or Gmail app password is present.
- [X] T041 Run `npm run test:runtime:postgres` or document precise blocker/justification.
- [X] T042 Mark completed tasks in `specs/019-email-delivery-runtime/tasks.md`.
- [X] T043 Produce final implementation report with files, tests, validation results, secret scan, risks and commit recommendation.

---

## Dependencies & Execution Order

- Phase 1 before all implementation.
- Phase 2 blocks all user stories.
- US1 delivers runtime transport and auth wiring.
- US2 depends on Phase 2 and can use US1 config contracts.
- US3 depends on delivery service statuses from US1.
- Phase 6 runs after all stories.

## Parallel Opportunities

- T001-T002 can run in parallel.
- T004-T006 and T009-T011 can run in parallel by different owners.
- Guardrail/doc tests in US2/US3 can run independently after config contracts exist.

## Notes

- Do not add a Prisma migration unless implementation discovers a mandatory
  persistent delivery-history requirement.
- Do not commit automatically.
- Keep SMTP secrets out of Git, examples, logs, audit metadata and terminal output.
