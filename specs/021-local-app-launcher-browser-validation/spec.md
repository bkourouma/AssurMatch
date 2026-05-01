# Feature Specification: Local App Launcher Browser Validation

**Feature Branch**: `021-local-app-launcher-browser-validation`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "Make the full app visible and testable locally with Windows launch/stop scripts, API on 3600, Web Public Client on 3601, Back-office on 3602, Mailpit on 8025, local PostgreSQL/Redis, health checks, local reference seed, safe bootstrap admin flow or documented operator command, browser smoke tests, and quickstart updates."
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes - the user explicitly approved continuing through specify, plan, tasks, implementation, validations and local commit for this standard local-dev hardening feature; no `[NEEDS CLARIFICATION]` markers are present.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: This feature only improves local developer and operator visibility. It does not add direct sale, direct subscription, V1 premium collection, contract issuance, attestation issuance, claims, insurer APIs, e-signature or binding personalized advice.
- **Impacted application(s)**: Multiple scopes: Backend API runtime launcher, Web Publique Client local launch, Back-office Partenaires/Plateforme local launch, local Docker infrastructure, browser smoke tests and documentation.
- **Affected scopes**: Local ports, launch/stop scripts, local health checks, Mailpit, local PostgreSQL/Redis, Prisma seed, browser smoke validation and bootstrap-admin runbook. Countries, products, partners, plans and regulated modules remain disabled by default unless existing local seed data already marks them internal.
- **Frontend separation**: The public app remains on its own local port and does not import or load back-office routes, layouts, auth state or privileged clients. Back-office surfaces remain on separate local ports and require authentication for protected pages.
- **Required feature flags**: No regulated feature flag is activated. Existing local seed keeps commercial, payment, e-signature, policy issuance, claims, insurer API and AI recommendation flags disabled.
- **Consent and transmission**: No lead transmission behavior changes. Any public quote path loaded by browser smoke remains non-transmissive unless existing consent and routing rules pass.
- **Partner license controls**: No license-control behavior changes. Browser smoke must not bypass inactive, unauthorized or expired-license broker controls.
- **Audit and data history**: Local bootstrap admin remains audited through the existing runtime flow; the launcher documents operator-provided bootstrap variables and does not log passwords.
- **Security and RBAC**: Back-office protected routes redirect unauthenticated users. Admin and broker sessions remain cookie-backed with role/MFA checks. No real secrets, partner data, license data or offer data are committed.
- **Routing impact**: No routing rules change. Local reference data stays synthetic and internal; no lead is routed by the launcher itself.
- **AI impact**: N/A. No AI module, prompt, model call, scoring or recommendation is introduced or activated.
- **UX/content restrictions**: Public pages keep indicative comparison wording and avoid forbidden direct-sale or subscription promises.
- **Workflow continuity**: Eligible. This is a standard local runtime hardening feature with explicit user approval; continue unless a constitutional, security, data leakage, forbidden activation or blocking validation issue appears.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch The Local Stack (Priority: P1)

As a developer, I want one Windows-friendly launch command so I can see the API, public app, back-office and Mailpit locally without manually wiring ports and env vars.

**Why this priority**: The full app cannot be evaluated reliably if the launch process still uses outdated ports or test-mode runtime adapters.

**Independent Test**: Run the local launcher on a machine with Docker and Node, then verify API `3600`, public `3601`, back-office `3602`, broker back-office auxiliary `3603`, and Mailpit `8025` respond.

**Acceptance Scenarios**:

1. **Given** Docker and Node are available, **When** the operator runs the local launch script, **Then** PostgreSQL, Redis and Mailpit start locally and the API/public/back-office apps start on the documented ports.
2. **Given** a required local port is already occupied, **When** the launch script runs, **Then** the operator receives a clear failure before ambiguous app startup continues.
3. **Given** the local stack is launched, **When** the public app is opened, **Then** it stays in the Web Publique Client surface and does not require a back-office session.

---

### User Story 2 - Stop And Inspect The Local Stack (Priority: P1)

As a developer, I want a stop command and health check so I can shut down local processes safely and verify what is running.

**Why this priority**: A launcher that leaves hidden processes or ambiguous ports behind makes later validation unreliable.

**Independent Test**: Run the health check after launch, then run the stop script and confirm the local app ports are no longer listening.

**Acceptance Scenarios**:

1. **Given** the local stack is running, **When** the operator runs the health command, **Then** API, public app, back-office login pages, protected-route redirects and Mailpit are checked.
2. **Given** the local stack is running, **When** the operator runs the stop script, **Then** local app processes stop without deleting non-local data.
3. **Given** the stop script runs twice, **When** no local process remains, **Then** it exits safely and reports no active listeners.

---

### User Story 3 - Validate Browser Visibility (Priority: P1)

As a maintainer, I want browser smoke tests for the locally launched app so I can prove the public and back-office entry points render in a real browser.

**Why this priority**: Static tests do not prove the full app is visible on the expected local URLs.

**Independent Test**: Launch the stack and run the local browser smoke command. The test visits public home, public quote form, admin login, broker login, unauthenticated protected routes and Mailpit.

**Acceptance Scenarios**:

1. **Given** the local stack is running, **When** local browser smoke runs, **Then** the public home and quote form render.
2. **Given** no back-office session exists, **When** protected admin or broker pages are opened, **Then** they redirect to their login pages without exposing protected data.
3. **Given** Mailpit is running, **When** browser smoke opens Mailpit, **Then** the Mailpit UI is reachable.

---

### User Story 4 - Seed And Bootstrap Safely (Priority: P2)

As an operator, I want local reference data and a safe admin bootstrap command so I can inspect authenticated screens without real operational data or committed passwords.

**Why this priority**: Local visibility needs sample internal data, but real partner/license/contact/offer data and hard-coded admin passwords are forbidden.

**Independent Test**: Run the launcher, confirm Prisma seed completes, and follow the documented bootstrap-admin command with operator-provided local credentials.

**Acceptance Scenarios**:

1. **Given** the local launcher runs, **When** migrations and seed execute, **Then** only synthetic internal reference data is loaded.
2. **Given** an operator wants a local admin, **When** they provide `LOCAL_BOOTSTRAP_ADMIN_EMAIL` and `LOCAL_BOOTSTRAP_ADMIN_PASSWORD`, **Then** the existing audited bootstrap flow can create or skip the admin safely.
3. **Given** `APP_ENV=production`, **When** bootstrap variables are present, **Then** startup refuses bootstrap and no local admin is created.

### Edge Cases

- Disabled country/product flags remain disabled by default; browser smoke may render unavailable states but must not activate public quote or comparison flags.
- Missing consent never transmits a lead; browser smoke does not submit quote data.
- Inactive, unauthorized or expired-license brokers are not bypassed by launcher or browser smoke.
- AI remains disabled and no model call is made.
- Unauthenticated visitors to back-office protected routes are redirected to login.
- Public routes must not import partner/admin authentication, privileges or protected clients.
- Mailpit is local-only and never configures SMTP production delivery.
- Bootstrap admin uses operator-provided local credentials and never commits or logs a password.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide Windows-friendly local launch and stop scripts.
- **FR-002**: The local launcher MUST start the Backend API on `http://localhost:3600`.
- **FR-003**: The local launcher MUST start the Web Publique Client on `http://localhost:3601`.
- **FR-004**: The local launcher MUST start the platform/admin back-office on `http://localhost:3602`.
- **FR-005**: The local launcher SHOULD expose the broker back-office on an auxiliary local URL so broker login flows can be browser-smoked without merging apps.
- **FR-006**: The local launcher MUST make Mailpit reachable on `http://localhost:8025`.
- **FR-007**: The local launcher MUST start or reuse local/dev PostgreSQL and Redis services without production, staging, preproduction or live-like targets.
- **FR-008**: The local launcher MUST run Prisma migrations and seed local reference data before starting browser-facing apps.
- **FR-009**: Local reference data MUST be synthetic/internal and MUST NOT include real partner, license, contact or offer data.
- **FR-010**: The launcher MUST use a non-test runtime environment for the API so local visibility exercises real runtime adapters.
- **FR-011**: The stop script MUST terminate local app listeners on the documented ports and stop local Docker services without deleting volumes by default.
- **FR-012**: The repository MUST provide an executable local health check for API, public app, back-office, protected-route redirects and Mailpit.
- **FR-013**: The repository MUST document the safe local bootstrap admin command using operator-provided credentials and existing production refusal guardrails.
- **FR-014**: Browser smoke tests MUST cover public app load, quote form load, back-office login load, protected-route unauthenticated redirect, admin login render, broker login render and Mailpit reachability.
- **FR-015**: Browser smoke tests MUST be opt-in for live local servers so the default web test suite does not fail when the local stack is not running.
- **FR-016**: The quickstart MUST include "How to see the app locally" and the URLs `http://localhost:3600`, `http://localhost:3601`, `http://localhost:3602` and `http://localhost:8025`.
- **FR-017**: Public and back-office routes, layouts, env vars and access policies MUST remain applicatively separated.
- **FR-018**: The feature MUST NOT enable payment, policy issuance, e-signature, claims, insurer API or AI recommendation.

### Key Entities *(include if feature involves data)*

- **LocalAppStack**: The local runtime made of API, public app, admin back-office, broker back-office auxiliary surface, PostgreSQL, Redis and Mailpit.
- **LocalLaunchCommand**: Windows-friendly command that validates ports, starts infrastructure, migrates/seeds data and starts app processes.
- **LocalStopCommand**: Windows-friendly command that stops local app processes and Docker services safely.
- **LocalHealthCheck**: Executable validation of local URLs, protected redirects and Mailpit reachability.
- **BrowserSmokeScenario**: Opt-in Playwright scenario that proves browser visibility of public and back-office entry points.
- **BootstrapAdminCommand**: Documented local operator flow using existing audited bootstrap logic and no committed password.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful local launches expose API `3600`, public `3601`, admin back-office `3602`, broker auxiliary `3603` and Mailpit `8025`, or fail with a clear prerequisite error.
- **SC-002**: 100% of health-check runs against a launched stack verify API, public page, quote form, back-office login pages, protected-route redirects and Mailpit.
- **SC-003**: 100% of local browser smoke tests are skipped by default unless explicitly enabled for running local servers.
- **SC-004**: 0 real secrets, real partner data, real license data, real contact data or real offer data are committed.
- **SC-005**: 0 public browser routes load back-office auth state or protected clients.
- **SC-006**: 0 payment, policy issuance, e-signature, claims, insurer API or AI recommendation modules are activated.

## Assumptions

- The current codebase intentionally has separate admin and broker Next.js apps; the launcher may use an auxiliary broker port while keeping `3602` as the documented primary back-office URL.
- Docker Compose remains the local/dev infrastructure entry point for PostgreSQL, Redis and Mailpit.
- The existing Prisma seed is the source of local synthetic reference data and keeps regulated features disabled.
- The existing bootstrap-admin implementation is safe if the operator supplies credentials through environment variables and `APP_ENV` is not production.
