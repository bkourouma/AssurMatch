# Feature Specification: Auth and Users Persistence AssurMatch

**Feature Branch**: `014-auth-users-persistence`
**Created**: 2026-04-28
**Status**: Approved for task generation
**Input**: User description: "Persist users and auth in Prisma — replace in-memory UsersService with Prisma-runtime repository, real password hashing, real MFA TOTP, admin user creation endpoint, account lockout, audit. The current implementation has a placeholder AuthService and an in-memory UsersService; the back-office cannot be used end-to-end locally because users do not survive container restarts and login does not verify passwords. This feature closes that gap without activating any forbidden module."
**Validation State**: Approved for `/speckit.tasks` on 2026-04-28 after audit and required-test review. `/speckit.implement` remains gated by explicit human approval because this feature is sensitive (authentication, password hashing, MFA, persisted PII for users).
**Continuous Workflow Eligible**: Approved through `/speckit.tasks`. This feature is sensitive (authentication, password hashing, MFA, persisted PII for users), so implementation requires explicit human review of the generated `tasks.md`, test matrix and audit coverage.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Pass. This feature persists internal AssurMatch user accounts (admins, broker advisors). It does NOT introduce external customer accounts, public sign-up, direct sale, subscription, premium collection, contract issuance, attestation, signature, claims, or advanced AI. Public visitors continue to interact with the platform without an account.
- **Impacted application(s)**: Backend API (auth + users modules become Prisma-runtime), Back-office Partenaires/Plateforme (login flow becomes functional, MFA enrolment screen, eventual admin "create user" page), shared packages (DTOs for password change, MFA, admin user create). Web Publique Client is NOT impacted (no public sign-up).
- **Affected scopes**: All admin roles (Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin, Content Admin, AI Admin) and all broker roles (Owner Starter, Owner Pro, Manager, Agent, Read-only). The `User` Prisma model already exists with `email`, `phone`, `displayName`, `status`, `mfaStatus`, `partnerTenantId`, `countryScopes`, `productScopes`. This spec adds password and MFA secret material.
- **Frontend separation**: Pass. Login UI remains under the Back-office app. The public app gets no new auth surface. Cookies are scoped to the back-office sub-domain only.
- **Required feature flags**: No new flag required. The auth module is always on (it has been since spec 001). MFA enforcement remains gated by the existing `MfaRequiredHttpGuard`. Password reset flow stays admin-driven (no public reset link in V1).
- **Consent and transmission**: N/A. No lead transmission introduced.
- **Partner license controls**: N/A.
- **Audit and data history**: All sensitive auth actions DOIVENT etre auditees: `user.created`, `user.updated`, `user.activated`, `user.suspended`, `user.unsuspended`, `user.locked`, `user.unlocked`, `user.deleted`, `user.role_changed`, `user.password_changed` (no password value), `user.password_change_failed`, `user.password_change_required`, `user.password_reset_issued`, `user.password_reset_consumed`, `user.password_reset_invalid`, `user.mfa_enrolled`, `user.mfa_reset`, `user.mfa_verified`, `user.mfa_failed`, `user.login_succeeded`, `user.login_failed`, `user.login_refused_suspended`, `user.locked_after_failed_logins`, `local_bootstrap_admin.created`, `local_bootstrap_admin.refused_in_production`. PII is masked: passwords NEVER logged, MFA secrets NEVER logged, tokens NEVER logged, only the user id, masked email, outcome, hashed IP and correlation id when available.
- **Security and RBAC**: Passwords hashed with **argon2id** (memory-hard, modern KDF). MFA secrets stored either encrypted at rest (with `ENCRYPTION_KEY`) or hashed (one-way) — final choice in plan; default = encrypted to keep TOTP working. Account lockout after N failed login attempts within a window. Rate limiting on `/auth/login`. RBAC: `super_admin` may create users with any role; `admin_pays` only within authorized country scope; `compliance_admin` may suspend/lock; broker roles cannot create users. MFA admin remains obligatoire. Sessions remain JWT-signed via the existing `signActorToken`.
- **Routing impact**: N/A.
- **AI impact**: N/A.
- **UX/content restrictions**: Login forms keep technical-platform language. No marketing copy. Forbidden phrases not introduced.
- **Workflow continuity**: Approved for `/speckit.tasks`. Stops apply before implementation: any deviation from password hashing standard, any silent reduction of MFA enforcement, any storage of passwords or MFA seeds in plain text, any public sign-up endpoint, any audit gap, any lockfile drift after `npm install`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Persist users in PostgreSQL via Prisma-runtime (Priority: P1)

The `UsersService` becomes Prisma-backed. User accounts, their roles, scopes, statuses and MFA state survive backend restarts.

**Why this priority**: Without persisted users, no admin can log in across restarts and the back-office is unusable in any real environment. This is the foundational change.

**Independent Test**: Create a user via the new admin endpoint, restart the API container, and confirm the user is still listable and can log in.

**Acceptance Scenarios**:

1. **Given** a Super Admin authenticated and MFA-verified, **When** they create a user via the admin endpoint, **Then** the user is persisted in the `User` table with status `invited`, `mfaStatus=required`, `passwordChangeRequired=true`, and an `AuditLog` `user.created` is durable.
2. **Given** a Super Admin reuses an email that already exists, **When** they call the create endpoint, **Then** the request is refused 409, no row is created, and the refusal is audited.
3. **Given** a created user, **When** the API container restarts, **Then** the user is still present in the database and listable by an authorized admin.
4. **Given** an `Admin Pays` scoped to country X, **When** they create a user with country scopes outside X, **Then** the request is refused 403 with audit.
5. **Given** a Broker Owner Pro, **When** they call the user creation endpoint, **Then** the request is refused 403 with audit.

---

### User Story 2 — Real password hashing and login (Priority: P1)

`AuthService.login` verifies a hashed password using **argon2id**. The password is set during user activation (first login flow) or via a self-service change.

**Why this priority**: The current `AuthService.login` ignores the password entirely. Anyone with a valid email could impersonate. This is a security gap that blocks production.

**Independent Test**: Create a user, set their password via the activation flow, log in with the correct password, log in with a wrong password, observe lockout after N failures.

**Acceptance Scenarios**:

1. **Given** a user with status `invited` and a one-time activation token issued by the admin endpoint, **When** they call `POST /auth/activate` with token + new password (>= 12 chars), **Then** their password is hashed with argon2id, stored as `passwordHash`, status moves to `active`, and `passwordChangeRequired` is cleared. Audit `user.activated` and `user.password_changed`.
2. **Given** an active user, **When** they `POST /auth/login` with a valid password, **Then** the response includes a JWT and `mfaRequired: true` (if MFA not yet verified for this session). Audit `user.login_succeeded`.
3. **Given** an active user, **When** they `POST /auth/login` with an invalid password, **Then** the response is 401, the `failedLoginCount` is incremented, the response time is constant (timing-safe compare), and audit `user.login_failed` is created.
4. **Given** `failedLoginCount` reaches the configured threshold (default 5) within the configured window (default 15 minutes), **When** the next attempt arrives, **Then** the user is `locked`, login is refused with explicit lockout message, and audit `user.locked_after_failed_logins` is created. Lockout auto-clears after a configured cooldown (default 30 minutes) OR a Compliance Admin manually unlocks.
5. **Given** a user with status `suspended` or `locked` or `deleted`, **When** they attempt to log in, **Then** login is refused regardless of password validity.

---

### User Story 3 — Real MFA TOTP enrolment and verification (Priority: P1)

Users enrol a TOTP secret (RFC 6238) via an authenticator app and verify a 6-digit code on each session. MFA secrets stored encrypted at rest with `ENCRYPTION_KEY`.

**Why this priority**: The current `MfaService` is a placeholder. Production demands real MFA for admin and broker Owner/Manager roles.

**Independent Test**: Activate a user, enrol MFA via `POST /auth/mfa/enroll`, scan QR code in an authenticator, verify the code via `POST /auth/mfa/verify`, log in fresh and confirm MFA is required.

**Acceptance Scenarios**:

1. **Given** an authenticated active user with `mfaStatus=required`, **When** they call `POST /auth/mfa/enroll`, **Then** a TOTP secret is generated (32-byte base32), persisted encrypted, and a `MfaChallenge` payload returned with `otpauth://` URI for QR display. Audit `user.mfa_enrolled`. The plain secret is returned ONCE in the response and never logged.
2. **Given** a user with an enrolled secret, **When** they `POST /auth/mfa/verify` with a valid 6-digit code, **Then** the session token is reissued with `mfaVerified=true`, `mfaStatus` becomes `verified`, and audit `user.mfa_verified` is created.
3. **Given** an invalid TOTP code, **When** verification is attempted, **Then** the response is 401 and audit `user.mfa_failed` is created. Three consecutive failures within 5 minutes lock the user (same lockout policy as password).
4. **Given** an admin role connecting from a fresh session, **When** they call any `/admin/...` endpoint without MFA verified, **Then** the request is refused by `MfaRequiredHttpGuard`.
5. **Given** a Compliance Admin, **When** they reset another user's MFA (`POST /admin/users/:id/mfa-reset`), **Then** the target user's `mfaStatus` becomes `required`, the prior secret is invalidated, and `user.mfa_reset` is audited with the actor and the reason.
6. **Given** backup codes are issued at enrolment time (8 single-use codes), **When** a user submits a backup code via `POST /auth/mfa/verify` with `kind=backup`, **Then** verification succeeds, that code is marked used, and audit records the usage.

---

### User Story 4 — Self-service password change (Priority: P2)

Authenticated users may change their own password via `POST /auth/password-change`.

**Why this priority**: Standard hygiene. Avoids requiring admin intervention for routine rotation.

**Independent Test**: Log in as user, change password to a new valid value, log out, log in with the new password.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they call `POST /auth/password-change` with `oldPassword` and `newPassword`, **Then** the old password is verified, the new is hashed and stored, `passwordChangedAt` is updated, and audit `user.password_changed` is created.
2. **Given** an invalid `oldPassword`, **When** the call is made, **Then** the request is refused 401 and audit `user.password_change_failed` is created.
3. **Given** a `newPassword` that fails policy (length < 12, equal to old, identical to email, etc.), **When** the call is made, **Then** the request is refused 422 with a clear message and no audit on the failure side beyond rate-limiting.

---

### User Story 5 — Admin-driven password reset (Priority: P2)

Compliance Admin or Super Admin can issue a one-time password reset token for a user who lost access. The user receives the token via the configured email channel and uses it to set a new password.

**Why this priority**: Operational completeness. Lockout recovery should not require deleting and recreating the user.

**Independent Test**: Lock a user, admin issues a reset, user redeems the token and sets a new password.

**Acceptance Scenarios**:

1. **Given** a Super Admin authenticated, **When** they call `POST /admin/users/:id/password-reset`, **Then** a one-time `passwordResetToken` is generated, hashed, stored with `passwordResetTokenExpiresAt`, the prior token (if any) is invalidated, the email is dispatched (preview mode in preprod), audit `user.password_reset_issued` is created.
2. **Given** a user holds a valid reset token, **When** they `POST /auth/password-reset` with `token` and `newPassword`, **Then** the token is consumed, the password is hashed and stored, `failedLoginCount` is reset, lockout cleared, audit `user.password_reset_consumed` is created.
3. **Given** an expired or already-consumed token, **When** the user submits it, **Then** the request is refused 401 and audit `user.password_reset_invalid` is created. Tokens expire after 30 minutes by default.

---

### User Story 6 — Account lifecycle (suspend, lock, unlock, delete) (Priority: P2)

Compliance Admin can suspend or lock users; Super Admin can delete (soft-delete). All actions audited.

**Why this priority**: Required for offboarding, security incidents, GDPR-style deletions.

**Independent Test**: Suspend a user, attempt login (refused), unsuspend, login succeeds.

**Acceptance Scenarios**:

1. **Given** a Compliance Admin, **When** they `POST /admin/users/:id/suspend` with a reason, **Then** the user moves to `status=suspended`, the reason is required (>= 8 chars), the active sessions are not extended (token still valid until expiry — short JWT TTL recommended), audit `user.suspended` is created.
2. **Given** a suspended user attempting login, **When** the request arrives, **Then** the response is 403 with a message "Account suspended" and audit `user.login_refused_suspended` is created.
3. **Given** an unsuspend action by Super Admin or Compliance Admin, **When** `POST /admin/users/:id/unsuspend` is called with reason, **Then** the user returns to `active`, audit `user.unsuspended` is created.
4. **Given** a Super Admin deletion request, **When** `DELETE /admin/users/:id` is called with reason, **Then** the user is soft-deleted (status=`deleted`, `deletedAt` set, email rotated to a tombstone like `<id>@deleted.assurmatch.local`), audit `user.deleted` is created. The row is retained for audit purposes; physical deletion is out of V1 scope.

---

### User Story 7 — Local bootstrap admin (Priority: P2)

In local dev or preproduction, the API can be bootstrapped with an initial Super Admin via env vars to enable first login. NEVER active in production.

**Why this priority**: Closes the local-test gap noted at the start of this spec. Permits hands-on testing of the back-office without manual database injection.

**Independent Test**: Set `LOCAL_BOOTSTRAP_ADMIN_EMAIL` and `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` in the env file, restart the container, log in with those credentials.

**Acceptance Scenarios**:

1. **Given** `APP_ENV=preproduction` AND `LOCAL_BOOTSTRAP_ADMIN_EMAIL` set AND no Super Admin exists in the database, **When** the API starts, **Then** it creates a Super Admin with that email and the hashed password from `LOCAL_BOOTSTRAP_ADMIN_PASSWORD`, `mfaStatus=required`, no MFA secret logged, and audit `user.created` with `reason="local-bootstrap"`.
2. **Given** any Super Admin exists already, **When** the API starts with the bootstrap vars set, **Then** no action is taken and a structured log line indicates the bootstrap was skipped.
3. **Given** `APP_ENV=production`, **When** the bootstrap vars are set, **Then** the API logs a fatal startup error and refuses to serve. This is a safety guarantee.

---

### Edge Cases

- Password equal to email or to displayName → refused at policy step.
- Password length < 12 chars → refused at zod schema step.
- Password longer than 512 chars → refused (DoS protection on argon2 cost).
- Concurrent login attempts on the same account → race-safe; both attempts see the same lockout state via DB-side increment.
- Clock skew on TOTP verification → ±1 step (30s) tolerance, no more.
- Backup code reuse → second usage refused, audited.
- Reset token race (two admins issue resets simultaneously) → second issuance invalidates the first; audit captures both.
- API restarted mid-login (between password verify and JWT signing) → no half-state; verify is read-only against DB, signing is local.
- Soft-deleted user trying to log in → refused, no information disclosure (response is identical to "wrong credentials" timing-wise).
- MFA secret stored encrypted; `ENCRYPTION_KEY` rotated → V1 keeps the same key indefinitely; rotation is a separate spec.
- Bootstrap collision: multiple replicas of the API container racing the bootstrap → only one creates the user (db unique constraint on email).
- Passwords are NEVER part of any response, log, audit context, or error message.
- MFA secrets are NEVER part of any response after initial enrolment.
- Failed login does NOT distinguish "user not found" vs "wrong password" externally.
- Admin endpoints reject requests without MFA verified, regardless of role.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist `User` rows in PostgreSQL via Prisma-runtime, replacing the in-memory `UsersService` array.
- **FR-002**: The system MUST add a Prisma migration extending the `User` model with: `passwordHash` (string nullable), `passwordChangedAt` (DateTime nullable), `passwordChangeRequired` (boolean default true), `failedLoginCount` (int default 0), `lastFailedLoginAt` (DateTime nullable), `lockedAt` (DateTime nullable), `lockedReason` (string nullable), `mfaSecretEncrypted` (string nullable), `mfaSecretIssuedAt` (DateTime nullable), `mfaBackupCodesHashes` (string array), `passwordResetTokenHash` (string nullable), `passwordResetTokenExpiresAt` (DateTime nullable), `deletedAt` (DateTime nullable), `lastLoginAt` (DateTime nullable), `lastLoginIpHash` (string nullable, never plain IP).
- **FR-003**: Passwords MUST be hashed with `argon2id` using parameters: memory ≥ 64 MiB, time cost ≥ 3, parallelism ≥ 1. The chosen implementation MUST be a maintained Node.js library audited by the team.
- **FR-004**: The system MUST verify passwords using a timing-safe comparison.
- **FR-005**: The system MUST enforce a password policy: length 12–512, not equal to email or displayName, not common-password (a small built-in deny-list MAY apply).
- **FR-006**: The system MUST maintain `failedLoginCount` per user; lockout activates at 5 failures within 15 minutes; cooldown 30 minutes; unlock requires admin or cooldown.
- **FR-007**: MFA MUST use TOTP (RFC 6238) with a 32-byte base32 secret, 30-second step, ±1 step skew tolerance, 6-digit code.
- **FR-008**: MFA secrets MUST be encrypted at rest using a symmetric scheme keyed by `ENCRYPTION_KEY` (>= 32 bytes). Backup codes MUST be hashed with argon2id (single-use).
- **FR-009**: The system MUST expose `POST /admin/users` (create), `PATCH /admin/users/:id` (update), `POST /admin/users/:id/suspend|unsuspend|lock|unlock|password-reset|mfa-reset`, `DELETE /admin/users/:id` (soft delete). RBAC: super_admin and compliance_admin per matrix; admin_pays scoped to country.
- **FR-010**: The system MUST expose `POST /auth/login`, `POST /auth/logout`, `POST /auth/activate`, `POST /auth/password-change`, `POST /auth/password-reset`, `POST /auth/mfa/enroll`, `POST /auth/mfa/verify`, `GET /auth/me`. Rate limiting applies to `/auth/login`, `/auth/password-reset`, `/auth/mfa/verify`.
- **FR-011**: All sensitive auth events MUST produce a durable `AuditLog` entry with action, actor (when known), target user, result, and PII-masked context. Passwords and secrets MUST never appear in audit context.
- **FR-012**: JWT access tokens issued by `signActorToken` MUST carry `mfaVerified` strictly reflecting MFA state. JWT TTL SHOULD be short (15 minutes by default); a refresh-token mechanism is OUT of V1 scope (re-login required at expiry).
- **FR-013**: The system MUST NOT log password values, MFA secrets, bootstrap MFA seeds, JWT tokens, or reset tokens at any log level.
- **FR-014**: The system MUST NOT introduce a public sign-up endpoint. Users are created exclusively by authorized admins.
- **FR-015**: The Web Publique Client MUST NOT gain any auth surface or session pathway.
- **FR-016**: When `APP_ENV=preproduction` AND `LOCAL_BOOTSTRAP_ADMIN_EMAIL` and `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` are present AND no Super Admin exists, the API MUST create a single Super Admin at startup. When `APP_ENV=production`, the presence of these env vars MUST be a fatal error refusing to serve.
- **FR-017**: The system MUST audit a successful login with the IP address (masked or hashed if PII policy demands), user-agent class (browser family only, no full UA string), and correlation id.
- **FR-018**: A new email per `EMAIL_DELIVERY_MODE` policy: activation invitations, password reset, MFA reset notice. In `preview` mode they go to Mailpit. In `send` mode (real Gmail SMTP) they go to the user. The flow MUST handle SMTP failure gracefully (reset token still issued, retry path documented).
- **FR-019**: The system MUST NOT activate any forbidden module (paiement, signature, emission, sinistres, IA recommendation, API assureur). This spec is auth-only.
- **FR-020**: Tests MUST cover: persistence across restart, password verify happy/sad paths, lockout, MFA enroll/verify/skew/backup, password change, password reset, role-based access on admin endpoints, tenant isolation, refusal of bootstrap in production.

### Configuration Requirements

- **CFG-001**: `ENCRYPTION_KEY` becomes mandatory in `preproduction` and `production` (was optional). The runtime refuses to start without it.
- **CFG-002**: `LOCAL_BOOTSTRAP_ADMIN_EMAIL` and `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` are documented in `.env.preproduction.example` as commented placeholders.
- **CFG-003**: Lockout thresholds and JWT TTL are configurable via env vars (`AUTH_LOCKOUT_THRESHOLD`, `AUTH_LOCKOUT_WINDOW_MINUTES`, `AUTH_LOCKOUT_COOLDOWN_MINUTES`, `AUTH_JWT_TTL_MINUTES`) with safe defaults.

### Security Requirements

- **SEC-001**: Passwords stored as argon2id hashes only. Never plaintext, never reversible cipher.
- **SEC-002**: MFA secrets encrypted at rest. Backup codes hashed.
- **SEC-003**: Login uses constant-time comparison; user-not-found and wrong-password paths take comparable time (do at least one bogus argon2 verify on user-not-found to neutralize timing).
- **SEC-004**: `/auth/login` rate-limited per IP and per email (separately) to mitigate credential stuffing.
- **SEC-005**: Reset tokens are 32-byte URL-safe random; only their hash is stored; expiry = 30 minutes; one-time use.
- **SEC-006**: JWT secret rotation invalidates all sessions; documented in runbook (extends spec 013's secret-rotation runbook).
- **SEC-007**: Admin endpoints reject unauthenticated and non-MFA-verified actors.
- **SEC-008**: Bootstrap admin path is forbidden in production.
- **SEC-009**: Cookies remain HttpOnly + Secure + SameSite (existing pattern).
- **SEC-010**: PII masking in logs: never email in plain (mask the local-part), never IP without hashing.

### Compliance Requirements

- **COMP-001**: All sensitive auth events audited.
- **COMP-002**: Soft-delete preserves audit trail; physical deletion forbidden in V1.
- **COMP-003**: Password reset email content avoids forbidden marketing wording.
- **COMP-004**: User account creation by admin includes a `reason` (>= 8 chars) recorded in audit.
- **COMP-005**: Suspending or locking a user includes a `reason`.

### Key Entities

- **User**: extended with password hash, MFA secret encrypted, backup codes hashes, password reset token hash + expiry, failed-login counter, lockedAt, deletedAt, lastLoginIpHash.
- **AuditLog**: receives all auth events.
- **PasswordResetToken** (logical, stored on User): one active token at a time.
- **MfaBackupCode** (logical, array on User): hashed, single-use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of created users persist across container restart.
- **SC-002**: 100% of valid logins succeed; 100% of invalid logins fail with constant-time response.
- **SC-003**: 100% of accounts lock after the configured threshold; auto-unlock after cooldown.
- **SC-004**: 100% of MFA enrolments produce a TOTP secret that an authenticator app accepts.
- **SC-005**: 100% of admin user-creation requests by non-permitted roles are refused 403 with audit.
- **SC-006**: 0 plaintext passwords or secrets in logs, audit context, error messages, response bodies, repository content.
- **SC-007**: 0 public sign-up endpoint exposed.
- **SC-008**: 0 sensitive flag activated by this spec (paiement, signature, emission, claims, ia recommendation, insurer api).
- **SC-009**: 100% of bootstrap-admin attempts in production refused with fatal startup error.
- **SC-010**: 100% of password reset tokens single-use, expired by default in 30 minutes, hashed at rest.

## Assumptions

- The chosen argon2 library is a well-maintained Node.js package the team approves.
- The Email module from spec 013 (Gmail SMTP, preview by default) is used for activation/reset emails.
- TOTP library: a maintained Node.js TOTP library (e.g. `otplib` or equivalent) selected during plan; same audit bar.
- Refresh tokens are out of V1 scope; users re-login after JWT expiry.
- WebAuthn is out of scope; TOTP only for V1.
- Multi-device session management is out of V1 scope.
- Public sign-up is out of scope; users are created internally only.
- Migration applied via the existing `prisma migrate deploy` flow in the deploy pipeline.
- `ENCRYPTION_KEY` rotation is a separate spec.
- The runtime smoke (spec 011) extension to cover auth flows is desired but optional in V1.

## Risks

- A bug in password hashing parameters → either too weak (security risk) or too slow (DoS-on-self). Mitigation: dedicated unit tests measuring the chosen parameters within target timing.
- Encryption key loss → MFA secrets become unverifiable. Mitigation: documented backup procedure for `ENCRYPTION_KEY`; user can reset MFA via Compliance Admin path.
- Argon2 native binding fails to install in CI or in Docker. Mitigation: pin the argon2 version, verify cross-platform binding during CI.
- Lockfile drift on `npm install` for the new dependency. Mitigation: commit the regenerated lockfile and verify `npm ci` works in Docker.
- Migration applied without a backup → loss of user state during rollout. Mitigation: standard backup procedure (spec 013 backup-restore runbook) executed before migrate deploy in production.
- Bootstrap admin leaks into production. Mitigation: hard refusal at startup when `APP_ENV=production`.
- Password reset email failing silently. Mitigation: retry queue (BullMQ existing infra) with audit on persistent failure.
- Race condition on lockout counter under concurrent failures. Mitigation: atomic increment via Prisma `update({ data: { failedLoginCount: { increment: 1 } } })`.
- Token reuse attack on reset tokens. Mitigation: single-use enforcement + immediate invalidation on consumption.

## Resolved Plan Questions

1. Argon2 library: `argon2` native binding by default; `@node-rs/argon2` remains an escape hatch only if install or CI issues appear.
2. TOTP library: `otplib`.
3. Email templates: activation, password reset and MFA reset notices use the existing notifications module and constitution-safe operational wording.
4. JWT TTL: 15 minutes by default, configurable via `AUTH_JWT_TTL_MINUTES`.
5. MFA reset: require the user to re-enrol from scratch; do not auto-issue a secret from the admin action.
6. Backup codes: 8 codes of 10 hex characters, hashed and single-use.
7. Login IP storage: store `lastLoginIpHash` only; never plain IP.
8. Refresh tokens: out of V1.
9. Activation invitation email: send via configured email channel; when unavailable, return the activation token once to the authorized admin caller.
10. Password history: out of V1, future hardening.
11. WebAuthn/passkeys: out of V1, future spec.

## Out Of Scope

- Public sign-up.
- Customer accounts (visitors remain anonymous).
- Refresh tokens.
- WebAuthn / passkeys.
- Multi-device session management.
- Password history.
- Encryption key rotation flow.
- SCIM provisioning.
- SSO / OIDC integration (separate future spec).
- Activation of any forbidden module.
- Web Publique Client auth surfaces.
