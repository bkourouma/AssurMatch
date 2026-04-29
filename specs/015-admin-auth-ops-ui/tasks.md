# Tasks: Admin/Auth Operations UI Batch

**Input**: 015-018 follow-up request approved for continuous implementation

## Phase 1: Setup & Tracking

- [X] T001 Create consolidated Spec Kit artifacts for admin/auth/ops follow-up.
- [X] T002 Verify existing backend API and frontend session contracts.

## Phase 2: Admin Users UI V1.1

- [X] T003 Extend admin API client for user list/detail/create/update/role/lifecycle endpoints.
- [X] T004 Add admin user server actions with required reason handling.
- [X] T005 Replace `/users` placeholder with searchable/filterable admin user list and create form.
- [X] T006 Add `/users/[id]` detail page with profile, roles/scopes and lifecycle actions.
- [X] T007 Add admin user UI source coverage for filters, actions and detail route.

## Phase 3: Auth UX Completion

- [X] T008 Add shared admin auth API helpers for activation, reset, change and MFA redirects.
- [X] T009 Add admin activation, MFA, password change and password reset screens.
- [X] T010 Add broker activation, MFA, password change and password reset screens.
- [X] T011 Improve admin and broker login transitions after MFA/activation required.
- [X] T012 Add auth UX source coverage.

## Phase 4: Preproduction Runtime Setup

- [X] T013 Add one-command preproduction launch/stop scripts integrated with Docker/Postgres and Prisma migrate deploy.
- [X] T014 Add quickstart/runbook for bootstrap admin, Mailpit verification and Node v24.15.0+.
- [X] T015 Ensure local launch/stop scripts remain documented.

## Phase 5: Partner/Broker Account Operations

- [X] T016 Extend broker API client for account/team user operations.
- [X] T017 Add broker account page for password and MFA management.
- [X] T018 Add broker tenant-safe team/users listing page.
- [X] T019 Add broker account/team source coverage.

## Phase 6: Validation

- [X] T020 Run typecheck.
- [X] T021 Run lint.
- [X] T022 Run Vitest suite.
- [X] T023 Run Playwright web tests.
- [X] T024 Run build.
- [X] T025 Run Prisma schema validation.
- [X] T026 Run npm audit high threshold.
- [X] T027 Run git diff whitespace check.
- [X] T028 Run final secret scan.
- [X] T029 Run focused auth/user suite or document blocker.
