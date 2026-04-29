# Feature Specification: Admin/Auth Operations UI Batch

**Feature Branch**: `014-auth-users-persistence`
**Created**: 2026-04-28
**Status**: Approved by user for continuous implementation
**Surfaces**: Back-office Plateforme, Back-office Partenaires, Backend API client wiring, operations scripts/docs

## User Scenarios & Tests

### User Story 1 - Admin manages persisted users
Given an authenticated MFA-verified platform admin, When they open `/users`, Then they can search/filter users by text, status and role, inspect user state, create a user, and open a detail page.

Given an authenticated MFA-verified platform admin on `/users/[id]`, When they update identity data, roles/scopes, or perform suspend, unsuspend, lock, unlock, MFA reset, or password reset actions, Then every sensitive action requires a reason and presents an audit-friendly confirmation state without exposing password material.

### User Story 2 - Back-office users complete auth UX
Given an invited user with an activation token, When they open the activation screen and set a compliant password, Then they receive a session and are guided to MFA verification before protected back-office access.

Given a user with an MFA-required session, When they open the MFA screen, Then they can enroll MFA, view backup codes once, verify a TOTP/backup code, and proceed to their intended back-office route.

Given an authenticated user, When they open password change, Then they can rotate the password with old-password proof.

Given a user with a password reset token, When they open the reset consumption screen, Then they can set a new compliant password without an existing session.

### User Story 3 - Local/preprod runtime operations are smoother
Given a developer/operator on Windows, When they run the local launch/stop scripts or the preproduction launch script, Then Docker/Postgres, Prisma migrate deploy, admin bootstrap notes, Mailpit verification, and app URLs are documented or automated enough for repeatable local/preprod checks.

### User Story 4 - Broker account operations are available
Given a broker owner/manager/agent, When they open account operations, Then they can change password and manage MFA.

Given a tenant-bound broker owner/manager, When they open team users, Then user listing is tenant-safe and does not expose other tenants.

## Requirements

- **FR-001** Admin `/users` MUST list persisted users with filters/search/status/role controls and page links.
- **FR-002** Admin `/users/[id]` MUST show detail fields, role/scope editing, and lifecycle actions with required reasons.
- **FR-003** Admin create user MUST call persisted `/admin/users` APIs and surface activation delivery state without real password disclosure.
- **FR-004** Auth UX MUST include activation, MFA, password change, and password reset consumption screens for admin and broker apps.
- **FR-005** Login transitions MUST redirect MFA-required sessions to a MFA screen and activation-required sessions to activation guidance.
- **FR-006** Broker account UI MUST include password and MFA management.
- **FR-007** Broker team UI MUST rely on backend tenant isolation and clearly handle forbidden/error states.
- **FR-008** Runtime scripts/docs MUST keep local secrets non-production and require Node v24.15.0+.
- **FR-009** All sensitive actions MUST require reasons and keep audit/RBAC responsibilities on backend APIs.

## Constitutional Notes

- Public app remains untouched by authenticated back-office routes.
- MFA remains required for protected admin/broker data paths.
- User lifecycle operations stay backend-authoritative and audited.
- No regulated sale, subscription, policy issuance, payment, e-signature, insurer API, or AI recommendation is activated.
