# Tasks: Auth and Users Persistence AssurMatch

**Input**: Design documents from `/specs/014-auth-users-persistence/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/auth-api.md, contracts/admin-users-api.md, quickstart.md

**Continuous Workflow**: The plan is reviewed and approved for `/speckit.tasks` on 2026-04-28. Because this feature touches authentication, password hashes, MFA secrets and persisted PII, `/speckit.implement` remains gated by explicit human approval of this task list, test matrix and audit coverage. Stop on any deviation from argon2id, weakened MFA, plaintext secret storage, public sign-up exposure, audit gap, lockfile drift, missing migration, or missing bootstrap-production-refusal test. Do not commit automatically.

**Tests**: Required. Unit, integration, RBAC, tenant isolation, audit, PII/secret masking, rate-limit, migration, production-bootstrap-refusal and back-office source-marker tests must be added or adapted before implementation of each story.

**Organization**: Tasks are grouped by user story to keep the persistence, login, MFA, password-change, reset, lifecycle and bootstrap increments independently testable.

## Phase 1: Setup And Dependency Decisions

**Purpose**: Establish dependencies, generated contracts and config surface before implementation.

- [X] T001 Install production dependencies `argon2` and `otplib`, then update `package.json` and `package-lock.json`.
- [X] T002 [P] Add auth DTO schemas in `packages/shared/contracts/auth.contracts.ts` for activate, password-change, password-reset, MFA enroll response and MFA verify kind.
- [X] T003 [P] Add admin user lifecycle DTO schemas in `packages/shared/contracts/user.contracts.ts` for create, update, role update, action reason, list item and detail responses.
- [X] T004 [P] Export auth and user contracts from `packages/shared/contracts/index.ts`.
- [X] T005 [P] Add auth environment variables to `.env.example` and `.env.preproduction.example` (`ENCRYPTION_KEY`, `AUTH_JWT_TTL_MINUTES`, lockout settings, deny-list path, `LOCAL_BOOTSTRAP_ADMIN_*` commented placeholders).
- [X] T006 [P] Add password deny-list seed file in `backend/src/modules/auth/password-deny-list.ts` with a small built-in common-password set.

---

## Phase 2: Foundational Security, Data And Audit Prerequisites

**Purpose**: Blocking controls required before any user story endpoint becomes usable.

**CRITICAL**: Complete this phase before user-story implementation.

- [X] T007 Create Prisma migration `backend/prisma/migrations/0005_auth_users_persistence/migration.sql` extending `User` with password, lockout, MFA, reset-token, soft-delete and login-hash fields from `data-model.md`.
- [X] T008 Update `backend/prisma/schema.prisma` with the new `User` fields and `deletedAt` index.
- [X] T009 [P] Add migration/schema validation tests in `backend/tests/integration/prisma-schema.spec.ts` covering nullable/default auth fields and hash-only IP storage.
- [X] T010 Implement env validation in `backend/src/config/config.module.ts` requiring `ENCRYPTION_KEY` in preproduction/production and validating auth lockout/JWT TTL settings.
- [X] T011 [P] Add config tests in `backend/tests/unit/config/auth-config.spec.ts` for missing `ENCRYPTION_KEY`, safe defaults and invalid lockout values.
- [X] T012 Create audit action constants in `backend/src/modules/audit-logs/auth-audit-actions.ts` for every action listed in `data-model.md`.
- [X] T013 [P] Add audit action coverage tests in `backend/tests/unit/audit-logs/auth-audit-actions.spec.ts` proving all spec-required action strings are present.
- [X] T014 Implement `backend/src/modules/auth/encryption.service.ts` with AES-256-GCM encrypt/decrypt for MFA secrets only.
- [X] T015 [P] Add encryption unit tests in `backend/tests/unit/auth/encryption.spec.ts` for round-trip, tamper detection, wrong-key failure and no plaintext output.
- [X] T016 Implement `backend/src/modules/auth/password-hashing.service.ts` wrapping argon2id with memory >= 64 MiB, time cost >= 3 and startup self-test.
- [X] T017 [P] Add password hashing unit tests in `backend/tests/unit/auth/password-hashing.spec.ts` for argon2id parameters, verify success/failure and bogus verify path.
- [X] T018 Implement `backend/src/modules/auth/password-policy.service.ts` enforcing 12-512 chars, email/displayName inequality and deny-list checks.
- [X] T019 [P] Add password policy unit tests in `backend/tests/unit/auth/password-policy.spec.ts` for length, equality, deny-list and accepted examples.
- [X] T020 Add PII/secret masking helpers in `backend/src/modules/common/pii-masking.ts` for email local-part hashing, IP hashing and browser-family extraction.
- [X] T021 [P] Add masking tests in `backend/tests/unit/common/pii-masking.spec.ts` proving no plain email local-part, IP, UA, token, password or MFA secret is returned.
- [X] T022 Implement auth rate-limit key helpers in `backend/src/modules/auth/rate-limit.guard.ts` or extend the existing rate-limit middleware for IP and email buckets.
- [X] T023 [P] Add rate-limit tests in `backend/tests/integration/auth/auth-rate-limit.spec.ts` for `/auth/login`, `/auth/password-reset` and `/auth/mfa/verify`.
- [X] T024 Update `backend/src/modules/auth/auth.module.ts` and `backend/src/modules/users/users.module.ts` to provide foundational auth services without exposing new routes yet.

**Checkpoint**: Security primitives, migration, config and audit constants are ready.

---

## Phase 3: US1 - Persist Users In PostgreSQL Via Prisma Runtime (P1)

**Goal**: Replace in-memory user storage with a Prisma-backed repository so users, roles, scopes, statuses and MFA state survive restarts.

**Independent Test**: Create a user via the admin endpoint, restart the API container, then confirm the user is still listable and can log in after activation.

### Tests for US1

- [X] T025 [P] [US1] Add repository contract tests in `backend/tests/unit/users/users-repository-contract.spec.ts` for create, duplicate email, scoped list, update, soft-delete filtering and auth-field persistence.
- [X] T026 [P] [US1] Add admin create/list integration tests in `backend/tests/integration/auth/admin-users-runtime-http.spec.ts` for Super Admin create, duplicate 409 audit, Admin Pays out-of-scope 403 audit and broker-role 403 audit.
- [X] T027 [P] [US1] Add persistence smoke test in `backend/tests/integration/auth/auth-users-persistence.spec.ts` proving a created user survives runtime recreation against Prisma.
- [X] T028 [P] [US1] Add tenant/scope isolation tests in `backend/tests/integration/auth/admin-users-tenant-isolation.spec.ts` for Admin Pays country scopes and broker tenant-only list access.

### Implementation for US1

- [X] T029 [US1] Implement `backend/src/modules/users/users.repository.ts` with `UsersRepository`, `MemoryUsersRepository` for tests and `PrismaUsersRepository` for runtime.
- [X] T030 [US1] Implement `backend/src/modules/users/users.service.ts` methods for create, find by email/id, scoped list, update, auth-field mutations, lock/unlock, suspend/unsuspend, soft delete and login metadata.
- [X] T031 [US1] Wire `PrismaUsersRepository` into `backend/src/modules/users/users.module.ts` and runtime wiring in `backend/src/runtime/assurmatch-runtime.ts`.
- [X] T032 [US1] Update `backend/src/modules/users/admin-users.controller.ts` with `GET /admin/users`, `GET /admin/users/:id`, `POST /admin/users` and `PATCH /admin/users/:id` using shared DTOs, MFA guard and RBAC scope checks.
- [X] T033 [US1] Update `backend/src/modules/users/admin-user-roles.controller.ts` with `POST /admin/users/:id/role-update` guarded by Super Admin/Compliance/Admin Pays scope rules.
- [X] T034 [US1] Add durable audit writes in user create, duplicate refusal, profile update, role update and RBAC refusal paths using `backend/src/modules/audit-logs/auth-audit-actions.ts`.

**Checkpoint**: US1 is functional and independently testable.

---

## Phase 4: US2 - Real Password Hashing, Activation And Login (P1)

**Goal**: `AuthService.login` verifies argon2id hashes, supports activation tokens and locks accounts after configured failures.

**Independent Test**: Create a user, activate with a new password, log in with correct and wrong passwords, then observe lockout after the threshold.

### Tests for US2

- [X] T035 [P] [US2] Add activation integration tests in `backend/tests/integration/auth/auth-activation-runtime-http.spec.ts` for valid token, expired token, consumed token, policy failure and audit.
- [X] T036 [P] [US2] Add login integration tests in `backend/tests/integration/auth/auth-login-runtime-http.spec.ts` for valid password, invalid password, user-not-found timing mitigation, suspended/locked/deleted refusal and JWT `mfaVerified` claim.
- [X] T037 [P] [US2] Add lockout tests in `backend/tests/unit/auth/lockout-counter.spec.ts` for threshold, window reset, cooldown auto-clear and concurrent failure atomicity.
- [X] T038 [P] [US2] Add secret/PII leak regression tests in `backend/tests/integration/auth/auth-secret-masking.spec.ts` for logs, audit context, errors and responses.

### Implementation for US2

- [X] T039 [US2] Implement activation-token issuance helpers in `backend/src/modules/auth/password-reset.service.ts` for one-time SHA-256 token hashes and 30-minute expiry.
- [X] T040 [US2] Rewrite `backend/src/modules/auth/auth.service.ts` login and activation flows to use `UsersService`, argon2id verification, bogus verify for unknown users, lockout state and JWT TTL.
- [X] T041 [US2] Update `backend/src/modules/auth/http-auth-token.service.ts` or token helper wiring so `AUTH_JWT_TTL_MINUTES` controls issued access-token TTL and `mfaVerified` is strict.
- [X] T042 [US2] Update `backend/src/modules/auth/auth.controller.ts` with `POST /auth/login`, `POST /auth/activate`, `POST /auth/logout` and `GET /auth/me` contract behavior and error envelopes.
- [X] T043 [US2] Add audit writes for `user.activated`, `user.password_changed`, `user.login_succeeded`, `user.login_failed`, `user.login_refused_suspended` and `user.locked_after_failed_logins`.

**Checkpoint**: US2 is functional and independently testable after US1 user creation.

---

## Phase 5: US3 - Real MFA TOTP Enrolment And Verification (P1)

**Goal**: Users enrol encrypted TOTP secrets, verify 6-digit codes or backup codes, and receive MFA-verified tokens.

**Independent Test**: Activate a user, enrol MFA, verify a TOTP code, verify a backup code once, and confirm admin routes reject non-MFA sessions.

### Tests for US3

- [X] T044 [P] [US3] Add TOTP unit tests in `backend/tests/unit/auth/mfa-totp.spec.ts` for RFC 6238 generation, +/-1 step skew and invalid-code refusal.
- [X] T045 [P] [US3] Add backup-code unit tests in `backend/tests/unit/auth/mfa-backup-codes.spec.ts` for 8 generated codes, argon2id hashes and single-use consumption.
- [X] T046 [P] [US3] Add MFA integration tests in `backend/tests/integration/auth/auth-mfa-runtime-http.spec.ts` for enroll, verify TOTP, verify backup, failure lockout, audit and no secret returned after enroll.
- [X] T047 [P] [US3] Add MFA guard tests in `backend/tests/integration/auth/admin-mfa-required.spec.ts` proving `/admin/...` endpoints reject authenticated but non-MFA-verified actors.

### Implementation for US3

- [X] T048 [US3] Rewrite `backend/src/modules/auth/mfa.service.ts` to generate otplib TOTP secrets, encrypt them, issue otpauth URIs and hash backup codes.
- [X] T049 [US3] Implement MFA verification in `backend/src/modules/auth/mfa.service.ts` for TOTP and backup codes with failure lockout using `failedLoginCount`, `lastFailedLoginAt`, `lockedAt` and `lockedReason`.
- [X] T050 [US3] Update `backend/src/modules/auth/auth.controller.ts` with `POST /auth/mfa/enroll` and `POST /auth/mfa/verify` contract behavior.
- [X] T051 [US3] Ensure `backend/src/modules/auth/guards/mfa-required.guard.ts` reads the strict JWT `mfaVerified` claim for all admin routes.
- [X] T052 [US3] Add audit writes for `user.mfa_enrolled`, `user.mfa_verified`, `user.mfa_failed`, MFA lockout and backup-code usage without logging secrets or codes.

**Checkpoint**: US3 is functional and independently testable after US2 activation/login.

---

## Phase 6: US4 - Self-Service Password Change (P2)

**Goal**: Authenticated users can rotate their own password after proving the old password.

**Independent Test**: Log in as a user, change password, then log in with the new password and fail with the old password.

### Tests for US4

- [X] T053 [P] [US4] Add password-change integration tests in `backend/tests/integration/auth/auth-password-change-runtime-http.spec.ts` for happy path, wrong old password, policy failure and audit.

### Implementation for US4

- [X] T054 [US4] Implement `POST /auth/password-change` in `backend/src/modules/auth/auth.controller.ts` and `backend/src/modules/auth/auth.service.ts` using old-password verification and password policy.
- [X] T055 [US4] Persist `passwordChangedAt`, clear `passwordChangeRequired` when appropriate and audit `user.password_changed` or `user.password_change_failed` in `backend/src/modules/auth/auth.service.ts`.

**Checkpoint**: US4 is functional and independently testable.

---

## Phase 7: US5 - Admin-Driven Password Reset (P2)

**Goal**: Super Admin or Compliance Admin can issue a one-time password reset, and the user can consume it safely.

**Independent Test**: Lock a user, issue a reset, consume the token, confirm lockout clears and token reuse fails.

### Tests for US5

- [X] T056 [P] [US5] Add password-reset integration tests in `backend/tests/integration/auth/auth-password-reset-runtime-http.spec.ts` for issue, consume, expired token, reused token, prior-token invalidation and audit.
- [X] T057 [P] [US5] Add email fallback tests in `backend/tests/integration/auth/auth-password-reset-email.spec.ts` for preview/send failure handling and one-time token response fallback.

### Implementation for US5

- [X] T058 [US5] Complete `backend/src/modules/auth/password-reset.service.ts` for reset token generation, SHA-256 storage, expiry, consumption, invalidation and lockout clearing.
- [X] T059 [US5] Add `POST /admin/users/:id/password-reset` in `backend/src/modules/users/admin-users.controller.ts` with Super Admin/Compliance RBAC, MFA guard, reason validation and email dispatch.
- [X] T060 [US5] Add `POST /auth/password-reset` in `backend/src/modules/auth/auth.controller.ts` to consume reset tokens, hash new passwords and refuse invalid tokens.
- [X] T061 [US5] Add activation/password-reset email templates or payload builders in `backend/src/modules/notifications/` with constitution-safe wording and graceful SMTP failure behavior.
- [X] T062 [US5] Add audit writes for `user.password_reset_issued`, `user.password_reset_consumed` and `user.password_reset_invalid` without logging tokens.

**Checkpoint**: US5 is functional and independently testable.

---

## Phase 8: US6 - Account Lifecycle Suspend, Lock, Unlock And Delete (P2)

**Goal**: Compliance Admin can suspend/lock/unlock users and Super Admin can soft-delete users with durable audit.

**Independent Test**: Suspend a user, verify login refusal, unsuspend and log in, then soft-delete and verify tombstone behavior.

### Tests for US6

- [X] T063 [P] [US6] Add lifecycle integration tests in `backend/tests/integration/auth/admin-users-lifecycle-runtime-http.spec.ts` for suspend, unsuspend, lock, unlock, delete, reasons, role restrictions and audit.
- [X] T064 [P] [US6] Add soft-delete repository tests in `backend/tests/unit/users/user-soft-delete.spec.ts` for tombstone email, retained row and list filtering.

### Implementation for US6

- [X] T065 [US6] Add lifecycle endpoints in `backend/src/modules/users/admin-users.controller.ts` for suspend, unsuspend, lock, unlock, MFA reset and soft delete with reason validation.
- [X] T066 [US6] Implement lifecycle state mutations in `backend/src/modules/users/users.service.ts`, including tombstone email rotation and lockout counter clearing on unlock.
- [X] T067 [US6] Enforce RBAC matrix in `backend/src/modules/users/admin-users.controller.ts` and `backend/src/modules/auth/guards/rbac.guard.ts` for lifecycle actions.
- [X] T068 [US6] Add audit writes for `user.suspended`, `user.unsuspended`, `user.locked`, `user.unlocked`, `user.deleted` and `user.mfa_reset`.

**Checkpoint**: US6 is functional and independently testable.

---

## Phase 9: US7 - Local Bootstrap Admin (P2)

**Goal**: Local/preproduction environments can create a single initial Super Admin from env vars, while production refuses to start if bootstrap vars are present.

**Independent Test**: Set bootstrap vars in preproduction and verify one admin is created; set the same vars in production and verify fatal startup refusal.

### Tests for US7

- [X] T069 [P] [US7] Add bootstrap unit tests in `backend/tests/unit/auth/local-bootstrap-admin.spec.ts` for local/preproduction create, existing-admin no-op, partial vars error and production refusal.
- [X] T070 [P] [US7] Add production refusal integration test in `backend/tests/integration/auth/auth-bootstrap-production-refusal.spec.ts` proving startup fails with `APP_ENV=production` and bootstrap vars.

### Implementation for US7

- [X] T071 [US7] Implement `backend/src/runtime/local-bootstrap-admin.ts` with env gating, single-admin check, argon2id hash, `mfaStatus=required`, no MFA secret logging and audit.
- [X] T072 [US7] Wire `maybeBootstrapAdmin` into `backend/src/runtime/assurmatch-runtime.ts` after feature flag hydration and before serving requests.
- [X] T073 [US7] Add structured logs for bootstrap created, skipped and refused states in `backend/src/runtime/local-bootstrap-admin.ts` without logging password values, MFA secrets, backup codes or tokens.
- [X] T074 [US7] Add audit writes for `local_bootstrap_admin.created` and `local_bootstrap_admin.refused_in_production`.

**Checkpoint**: US7 is functional and independently testable.

---

## Phase 10: Back-Office Integration And Source Markers

**Purpose**: Confirm the back-office login surface integrates with real auth while the public app remains untouched.

- [X] T075 [P] Add or update back-office auth client calls in `apps/admin/app/lib/admin-api.ts` and `apps/broker/app/lib/broker-api.ts` for login, me, MFA enroll/verify and password change.
- [X] T076 [P] Update `apps/admin/app/login/page.tsx` and `apps/broker/app/login/page.tsx` to handle activation-required, MFA-required, locked/suspended and validation states without forbidden public-sales wording.
- [X] T077 [P] Add Playwright/source-marker tests in `apps/admin/tests/auth.spec.ts` verifying admin login/MFA source markers and no public-app imports.
- [X] T078 [P] Add Playwright/source-marker tests in `apps/broker/tests/auth.spec.ts` verifying broker login/MFA source markers and no public-app imports.
- [X] T079 [P] Add public separation guardrail test in `apps/public/tests/auth-separation.spec.ts` or equivalent source-marker test proving the public app has no auth routes, back-office layouts or partner/admin session state.

---

## Phase 11: Documentation, Runbooks And Final Validation

**Purpose**: Complete operational documentation, task tracking and final evidence.

- [X] T080 [P] Add runbook `docs/runbooks/user-create.md` for admin-created users and activation-token fallback.
- [X] T081 [P] Add runbook `docs/runbooks/user-suspend-unsuspend.md` for suspension, unsuspension and audit review.
- [X] T082 [P] Add runbook `docs/runbooks/user-lock-unlock.md` for automatic/manual lockout and recovery.
- [X] T083 [P] Add runbook `docs/runbooks/password-reset.md` for reset issuance, token expiry, SMTP failure and audit review.
- [X] T084 [P] Add runbook `docs/runbooks/mfa-reset.md` for lost authenticator recovery and backup-code expectations.
- [X] T085 [P] Add runbook `docs/runbooks/bootstrap-admin.md` for local/preproduction bootstrap and production refusal.
- [X] T086 Update `specs/014-auth-users-persistence/quickstart.md` with final command names, migration path, bootstrap verification and validation outputs.
- [X] T087 Run secret scan searches for plaintext password, MFA secret, reset token, JWT token, plain IP and forbidden public sign-up strings across `backend/`, `apps/` and `packages/`.
- [X] T088 Run final validations: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npx prisma validate --schema backend/prisma/schema.prisma`, `npm audit --audit-level=high`, `git diff --check`, `npm run test:runtime:postgres`.
- [X] T089 Re-run Constitution Check evidence in `specs/014-auth-users-persistence/plan.md` and confirm no forbidden modules, public sign-up, plaintext secrets or audit gaps were introduced.
- [X] T090 Check off every completed task in `specs/014-auth-users-persistence/tasks.md`.
- [X] T091 Produce final implementation report with plan created, tasks created, tasks completed, files changed, migration, tests, validation results, unfinished points, residual risks and recommended next step.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies.
- **Phase 2**: Depends on Phase 1 and blocks all user stories.
- **US1**: Depends on Phase 2 and provides persisted users for later auth flows.
- **US2**: Depends on US1 for persisted users and activation token storage.
- **US3**: Depends on US2 for authenticated active users.
- **US4**: Depends on US2.
- **US5**: Depends on US1 and US2.
- **US6**: Depends on US1 and US2.
- **US7**: Depends on Phase 2 and should be integrated after US1/US2 services exist.
- **Back-office integration**: Depends on US2 and US3.
- **Documentation/final validation**: Depends on all selected implementation phases.

### Parallel Opportunities

- T002-T006 can run in parallel after dependency installation is understood.
- T009, T011, T013, T015, T017, T019, T021 and T023 can be written in parallel because they touch separate test files.
- Test tasks inside each user story can be written in parallel before implementation.
- US4, US5 and US6 can proceed in parallel after US2 if owners coordinate edits to `auth.controller.ts`, `auth.service.ts`, `admin-users.controller.ts` and `users.service.ts`.
- Runbooks T080-T085 can be drafted in parallel once endpoint behavior is stable.

### Audit Coverage Matrix

- **User creation/update/roles**: T026, T034 cover `user.created`, `user.updated`, duplicate create refusal and `user.role_changed`.
- **Activation/login/lockout**: T035-T043 cover `user.activated`, `user.password_changed`, `user.login_succeeded`, `user.login_failed`, `user.login_refused_suspended` and `user.locked_after_failed_logins`.
- **MFA**: T044-T052 cover `user.mfa_enrolled`, `user.mfa_verified`, `user.mfa_failed`, backup-code usage and MFA lockout.
- **Password change/reset**: T053-T062 cover `user.password_change_failed`, `user.password_reset_issued`, `user.password_reset_consumed` and `user.password_reset_invalid`.
- **Lifecycle**: T063-T068 cover `user.suspended`, `user.unsuspended`, `user.locked`, `user.unlocked`, `user.deleted` and `user.mfa_reset`.
- **Bootstrap**: T069-T074 cover `local_bootstrap_admin.created` and `local_bootstrap_admin.refused_in_production`.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1, US2 and US3 because persisted users, real password verification and MFA are the minimum secure login loop.
3. Validate with unit/integration tests and secret/PII masking checks before adding P2 account operations.

### Incremental Delivery

1. Add persisted users and admin creation.
2. Add activation, password login and lockout.
3. Add MFA enrollment/verification and admin MFA guard enforcement.
4. Add password change, password reset, lifecycle and bootstrap.
5. Add back-office integration, runbooks and final validations.

### Validation Gate Before Implementation

Implementation may start only after this `tasks.md`, its tests and its audit coverage are explicitly approved. No commit is automatic unless requested.
