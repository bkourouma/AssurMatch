# Implementation Plan: Auth and Users Persistence AssurMatch

**Branch**: `014-auth-users-persistence` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-auth-users-persistence/spec.md`

**Continuous Workflow Eligibility**: Approved for `/speckit.tasks` after human review on 2026-04-28, given the security sensitivity (passwords, MFA, persisted PII). `/speckit.implement` remains gated by explicit human approval of `tasks.md`, the test matrix and audit coverage. Stop conditions: any deviation from argon2id, weakening MFA, plaintext storage, public sign-up surface, audit gap, lockfile drift, missing migration, missing test of forbidden bootstrap path in production. No auto-commit.

## Summary

Replace the in-memory `UsersService` with a Prisma-runtime repository, add real password hashing (argon2id), real TOTP MFA with encrypted secrets and hashed backup codes, account-lockout, admin user lifecycle endpoints, self-service password change, admin-driven password reset, and a guarded `LOCAL_BOOTSTRAP_ADMIN_*` path that refuses to run in production. One Prisma migration. No new business logic outside auth. No public sign-up. No forbidden module activated.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1; Next.js 16.2.4; React 19.2.5.
**New dependencies (production)**: `argon2` (recommended) or `@node-rs/argon2`; `otplib` (recommended) for TOTP. Decision finalized in research.md.
**Primary Dependencies**: existing `AssurMatchRuntime`, `RuntimeHttpWiringModule`, `PrismaService`, `AuditLogWriter`, `ConfigModule`, `signActorToken` / verify, `@prisma/client`, `@prisma/adapter-pg`.
**Storage**: PostgreSQL via Prisma-runtime. New columns on `User`. No new model. `mfaSecretEncrypted` stored as base64-of-AES-GCM ciphertext keyed by `ENCRYPTION_KEY`.
**Testing**: Vitest unit + integration tests under `backend/tests/unit/auth`, `backend/tests/integration/auth`. Playwright source-marker checks on the back-office login UI. Optional `npm run test:runtime:postgres` extension (deferred to a future task) to validate the auth flow end-to-end on real Postgres.
**Target Platform**: Backend API + Back-office Partenaires/Plateforme. Web Publique Client untouched.
**Impacted Application(s)**: Backend API (auth + users + audit + email send), Back-office (login flow becomes functional, optional admin user-management page in V1.1), shared package (DTOs).
**Project Type**: Internal auth feature.
**Performance Goals**: argon2id verify <= 300 ms p95 on the deployed VPS (target memory 64 MiB, time cost 3). TOTP verify well under 10 ms.
**Constraints**: HTTPS only; no plaintext password anywhere; no MFA reduction; admin endpoints require MFA-verified actor; bootstrap forbidden in production; existing CI must remain green.
**Scale/Scope**: Internal users for AssurMatch admins and broker advisors — modest scale (hundreds of accounts initially). Lockout counters atomic via `prisma.user.update({ data: { failedLoginCount: { increment: 1 } } })`.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design.*

- **Technical platform role**: Pass. Internal auth only. No external customer accounts. No public sign-up. No regulated module activated.
- **Regulatory and consent**: Pass. No new lead transmission flow.
- **Feature flags and activation**: Pass. No new flag. MFA enforcement remains gated by the existing guard.
- **Frontend application separation**: Pass. Login UI on back-office only. Public app gets no auth surface. Cookies scoped to back-office sub-domain.
- **Security and RBAC**: Pass. argon2id; TOTP RFC 6238; encrypted MFA secrets; rate limiting on `/auth/login`; account lockout; admin endpoints require MFA; super_admin/compliance_admin/admin_pays scoped per matrix; broker roles cannot create users.
- **Data and auditability**: Pass. All sensitive auth events audited. Passwords and secrets never appear in audit context.
- **Routing integrity**: Pass. Routing rules unchanged.
- **AI control**: Pass. No AI.
- **UX and content safety**: Pass. Login forms internal vocabulary; no marketing copy.
- **Testing discipline**: Pass. Plan adds unit + integration + RBAC + tenant + lockout + MFA + bootstrap-refusal-in-production tests.
- **Async and reliability**: Pass. Email send via existing BullMQ-backed notifications module if available; synchronous failure does not block password reset issuance.
- **Continuous workflow safety**: Pass with stop condition. Plan is approved for `/speckit.tasks`; `/speckit.implement` requires explicit human approval of the generated tasks, test matrix and audit coverage.

## Project Structure

### Documentation

```text
specs/014-auth-users-persistence/
  spec.md
  plan.md                              # this file
  research.md
  data-model.md
  contracts/
    auth-api.md
    admin-users-api.md
  quickstart.md
```

### Source code (target paths for implementation)

```text
backend/
  prisma/
    migrations/
      0005_auth_users_persistence/
        migration.sql                 # extends User with auth fields
  src/
    modules/
      users/
        users.module.ts                # rewires service to Prisma repository
        users.repository.ts            # NEW: PrismaUsersRepository + memory-test repo
        users.service.ts               # promoted: separates module wiring from service logic
      auth/
        auth.module.ts                 # extended
        auth.service.ts                # rewritten: real password verify, lockout, JWT TTL
        password-hashing.service.ts    # NEW: argon2id wrapper
        password-policy.service.ts     # NEW: length / equality / deny-list
        password-reset.service.ts      # NEW: token issuance, consumption, expiry
        mfa.service.ts                 # rewritten: real TOTP, backup codes
        encryption.service.ts          # NEW: AES-GCM wrapper for MFA secret
        rate-limit.guard.ts            # NEW or extend existing
      common/
        runtime/local-bootstrap-admin.ts  # NEW: env-gated startup hook
      audit-logs/
        auth-audit-actions.ts             # NEW: namespace constants
    runtime/
      assurmatch-runtime.ts            # wires new repository, encryption service, bootstrap
  tests/
    unit/auth/
      password-hashing.spec.ts
      password-policy.spec.ts
      mfa-totp.spec.ts
      mfa-backup-codes.spec.ts
      lockout-counter.spec.ts
      encryption.spec.ts
      local-bootstrap-admin.spec.ts
    integration/auth/
      auth-login-runtime-http.spec.ts
      auth-mfa-runtime-http.spec.ts
      auth-password-change-runtime-http.spec.ts
      auth-password-reset-runtime-http.spec.ts
      admin-users-runtime-http.spec.ts
      auth-rate-limit.spec.ts
      auth-bootstrap-production-refusal.spec.ts
packages/
  shared/
    contracts/
      auth.contracts.ts                # extended: activation, password change/reset, MFA enroll/verify
      user.contracts.ts                # NEW: admin user lifecycle DTOs
apps/
  admin/
    app/
      login/                           # already exists
      users/                           # NEW (V1.1): admin user-management screens; gated to a follow-up task
  broker/
    app/
      login/                           # already exists
.env.example                           # extended: AUTH_*, ENCRYPTION_KEY, LOCAL_BOOTSTRAP_ADMIN_*
.env.preproduction.example             # extended same way
docs/
  runbooks/
    user-create.md                     # NEW
    user-suspend-unsuspend.md          # NEW
    user-lock-unlock.md                # NEW
    password-reset.md                  # NEW
    mfa-reset.md                       # NEW
    bootstrap-admin.md                 # NEW
```

**Structure Decision**: Keep modules separated by responsibility (`password-hashing`, `password-policy`, `password-reset`, `mfa`, `encryption`, `rate-limit`) so the auth surface area is auditable. The `users.service.ts` becomes a thin facade over the Prisma repository, mirroring the dashboards 012 pattern. Reuse the `AuditLogWriter`, `signActorToken`, and existing guards. No new endpoint outside `/auth/*` and `/admin/users/*`.

## Phase 0 Research Decisions

See [research.md](./research.md). Headlines:

1. **argon2 library**: `argon2` (npm) — native binding, widely audited, parameters configurable. `@node-rs/argon2` is the alternative; default is `argon2` because it's the most-used and has long-term support.
2. **TOTP library**: `otplib` — stable, RFC 6238 compliant, supports authenticator URIs and backup codes patterns.
3. **MFA secret storage**: AES-256-GCM ciphertext, base64-encoded, keyed by `ENCRYPTION_KEY` (≥ 32 bytes). Library: Node `crypto` (no extra dep). MFA backup codes hashed with argon2id (single-use).
4. **JWT TTL**: 15 minutes default. No refresh token in V1.
5. **Lockout**: 5 failures within 15 minutes → `locked` for 30 minutes. Atomic counter via Prisma update.
6. **Bootstrap admin**: env-gated. Hard refusal in production (`APP_ENV=production` plus the env vars => fatal startup).
7. **Email channel**: existing notifications module + Gmail SMTP from spec 013. Activation invitations and password reset use `EMAIL_DELIVERY_MODE=preview` by default (Mailpit in preprod).
8. **No public sign-up**.
9. **No refresh token**.
10. **No password history** in V1; document as future hardening.
11. **No SSO** in V1; future spec.
12. **No webauthn** in V1; future spec.

## Phase 1 Design Outputs

- [research.md](./research.md): library choices, parameters, defenses, rejected options.
- [data-model.md](./data-model.md): User column additions, lifecycle states, audit action codes, lockout/throttle state machine.
- [contracts/auth-api.md](./contracts/auth-api.md): public auth endpoints (`/auth/*`).
- [contracts/admin-users-api.md](./contracts/admin-users-api.md): admin user-lifecycle endpoints (`/admin/users/*`).
- [quickstart.md](./quickstart.md): how to apply migration, set env, bootstrap, log in, enrol MFA, reset password locally.

## Technical Plan (high level)

### 1. Migration `0005_auth_users_persistence`

`prisma migrate dev --name auth_users_persistence` produces a single migration file that adds to `User`:

```
passwordHash               String?
passwordChangedAt          DateTime?
passwordChangeRequired     Boolean   @default(true)
failedLoginCount           Int       @default(0)
lastFailedLoginAt          DateTime?
lockedAt                   DateTime?
lockedReason               String?
mfaSecretEncrypted         String?
mfaSecretIssuedAt          DateTime?
mfaBackupCodesHashes       String[]
passwordResetTokenHash     String?
passwordResetTokenExpiresAt DateTime?
deletedAt                  DateTime?
lastLoginAt                DateTime?
lastLoginIpHash            String?
```

Indexes added: `User(email)` already unique, plus `User(deletedAt)` partial.

### 2. UsersRepository + UsersService

- `UsersRepository` interface with `MemoryUsersRepository` (test-only, guarded by `assertRuntimeRepository`) and `PrismaUsersRepository` (runtime).
- `UsersService` wraps the repository; methods: `create`, `getByEmail`, `require(id)`, `update`, `setPassword`, `setMfaSecret`, `setMfaBackupCodes`, `incrementFailedLogin`, `clearFailedLogin`, `lock`, `unlock`, `suspend`, `unsuspend`, `softDelete`, `setPasswordResetToken`, `consumePasswordResetToken`, `recordSuccessfulLogin`.

### 3. Password hashing & policy

- `password-hashing.service.ts`: thin wrapper over `argon2.hash()` and `argon2.verify()`. Static parameters constants. A self-test at startup measures one verify and warns if > 1 second (sign of misconfiguration).
- `password-policy.service.ts`: zod-based + custom checks (length, equality with email/displayName, common-password deny-list).
- All password operations through these services. Never `bcrypt`, never `crypto.createHash('sha256', ...)` for passwords.

### 4. Encryption service (for MFA secrets)

- `encryption.service.ts`: AES-256-GCM. `encrypt(plain)` returns `iv:tag:ciphertext` base64-joined. `decrypt(token)` reverses. Throws on wrong key or tampered data.
- Strictly used for MFA secrets. Future field-level encryption uses the same primitive.

### 5. MFA TOTP

- `mfa.service.ts`: enrol generates a 32-byte base32 secret (using `crypto.randomBytes(20)` + base32 encoding from `otplib`), persists encrypted, returns `otpauth://` URI for QR.
- Verify: tolerates ±1 step (30s) skew. Three failures within 5 minutes lock the user (same lockout policy as password).
- Backup codes: 8 codes of 10 hex chars at enrolment; argon2id-hashed; single-use.

### 6. Lockout

- Atomic increment via Prisma update. Threshold 5 within 15 minutes. Lock auto-clears after 30-minute cooldown OR via admin unlock. The check uses `failedLoginCount` and `lastFailedLoginAt`; if `lastFailedLoginAt` is older than the window, the counter resets on next failure.

### 7. JWT TTL & sessions

- `signActorToken` extended to honor `AUTH_JWT_TTL_MINUTES` (default 15). Existing `mfaVerified` claim semantics retained.
- Logout has no server-side state to clear; the client drops the cookie/token.

### 8. Endpoints

`/auth/*` (per [contracts/auth-api.md](./contracts/auth-api.md)):
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` — extend existing.
- `POST /auth/activate` — NEW.
- `POST /auth/password-change` — NEW.
- `POST /auth/password-reset` — NEW (consume token).
- `POST /auth/mfa/enroll` — promote existing.
- `POST /auth/mfa/verify` — promote existing.

`/admin/users/*` (per [contracts/admin-users-api.md](./contracts/admin-users-api.md)):
- `POST /admin/users` (create + invite).
- `PATCH /admin/users/:id` (update profile, scopes).
- `POST /admin/users/:id/suspend`, `unsuspend`, `lock`, `unlock`.
- `POST /admin/users/:id/password-reset` (issue token + email).
- `POST /admin/users/:id/mfa-reset` (invalidate secret + require re-enrol).
- `DELETE /admin/users/:id` (soft delete).
- `GET /admin/users` and `GET /admin/users/:id` (list + detail with RBAC).

### 9. RBAC matrix (per role)

| Action | super_admin | compliance_admin | admin_pays | support_admin | broker roles |
|---|---|---|---|---|---|
| List users | all | all | scoped to country | scoped to country | tenant only |
| Create user | yes | yes | scoped | no | no |
| Suspend/unsuspend | yes | yes | scoped | no | no |
| Lock/unlock | yes | yes | scoped | no | no |
| Password reset | yes | yes | no | no | no |
| MFA reset | yes | yes | no | no | no |
| Soft delete | yes | no | no | no | no |
| Self password change | yes | yes | yes | yes | yes (own only) |

### 10. Local bootstrap admin

`backend/src/runtime/local-bootstrap-admin.ts`:

```typescript
async function maybeBootstrapAdmin(runtime: AssurMatchRuntime): Promise<void> {
  const email = process.env.LOCAL_BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.LOCAL_BOOTSTRAP_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (process.env.APP_ENV === "production") {
    throw new Error("LOCAL_BOOTSTRAP_ADMIN_* refused in production");
  }
  if (process.env.APP_ENV !== "preproduction" && process.env.APP_ENV !== "local") return;
  if (!email || !password) throw new Error("Both LOCAL_BOOTSTRAP_ADMIN_EMAIL and _PASSWORD required");
  const existing = await runtime.users.service.findByEmail(email);
  if (existing) return; // skip silently
  const anySuperAdmin = await runtime.users.service.firstWithRole("super_admin");
  if (anySuperAdmin) return;
  await runtime.users.service.createSuperAdmin({ email, password, audit: { reason: "local-bootstrap" } });
}
```

Called from `AssurMatchRuntime.onModuleInit` AFTER `featureFlags.hydrateFromRepository`.

### 11. Audit actions added

`auth-audit-actions.ts` exports a namespace `AuthAuditActions` with the constants: `userCreated`, `userUpdated`, `userActivated`, `userPasswordChanged`, `userPasswordChangeFailed`, `userPasswordChangeRequired`, `userPasswordResetIssued`, `userPasswordResetConsumed`, `userPasswordResetInvalid`, `userMfaEnrolled`, `userMfaReset`, `userMfaVerified`, `userMfaFailed`, `userLoginSucceeded`, `userLoginFailed`, `userLoginRefusedSuspended`, `userLockedAfterFailedLogins`, `userSuspended`, `userUnsuspended`, `userLocked`, `userUnlocked`, `userDeleted`, `userRoleChanged`, `localBootstrapAdminCreated`, `localBootstrapAdminRefusedInProduction`.

### 12. Configuration changes

- `backend/src/config/config.module.ts` extends env validation: `ENCRYPTION_KEY` becomes mandatory in `preproduction` and `production`. `AUTH_JWT_TTL_MINUTES`, `AUTH_LOCKOUT_THRESHOLD`, `AUTH_LOCKOUT_WINDOW_MINUTES`, `AUTH_LOCKOUT_COOLDOWN_MINUTES` get safe defaults.
- `.env.example` and `.env.preproduction.example` extended with new vars (REDACTED for secrets).

### 13. Frontend changes

- Login pages already exist (`apps/admin/app/login`, `apps/broker/app/login`). Reuse them.
- Add `apps/admin/app/users/page.tsx` (list) and `apps/admin/app/users/[id]/page.tsx` (detail) — simple list view, lifecycle action buttons. Considered a follow-up task that may slip to V1.1 if the implementation budget is tight.
- Public app: no change.

### 14. Tests required

Critical (Phase 1 of implementation):
- Password hashing self-test runs in unit suite with chosen parameters; documents argon2 cost.
- Password policy unit tests cover length, equality, common deny-list.
- TOTP unit tests cover skew tolerance and reject-replay.
- Backup codes single-use behaviour.
- Lockout transitions and atomic increment under concurrent failures.
- Encryption service round-trip + tamper detection.
- Local bootstrap admin: refuses in production, succeeds in preprod when no admin exists, no-op otherwise.
- Auth integration: login happy/sad/lockout/MFA flow, activation, password change, password reset issuance + consumption, admin user lifecycle, RBAC denial paths, audit assertions for every auth action constant, and secret/PII masking assertions.
- Source-marker Playwright on the back-office login forms (no plaintext password leakage).

### 15. Validations at end

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npx prisma validate`, `npm audit --audit-level=high`, `git diff --check`, `npm run test:runtime:postgres` (recommended given the migration), secret-scan grep.

## Risks

- argon2 parameters too low → security risk. Mitigation: self-test at startup, configurable lower bound enforced.
- argon2 parameters too high → request slowness. Mitigation: target p95 verification time documented and benchmarked.
- TOTP clock skew on the VPS → false negatives. Mitigation: ±1 step tolerance, document NTP sync as a deployment requirement.
- Encryption key loss → MFA recovery via Compliance Admin reset only. Mitigation: documented backup of `ENCRYPTION_KEY`.
- Migration applied without backup → historic User rows lose `passwordHash` (which is `null` post-migration anyway since we add the column nullable). Mitigation: standard backup before migrate deploy.
- Bootstrap admin leaks into production. Mitigation: hard fail at startup.
- Email send fails silently → password reset broken. Mitigation: retry queue + admin sees the token in the response if SMTP is offline.

## Rollback And Cleanup Strategy

- The migration adds nullable columns + indexes; rollback drops them. `prisma migrate diff` produces the down SQL on demand. A clean rollback path exists.
- Reverting code while keeping the migration applied is safe (the columns simply remain unused).
- Reverting both code and migration: standard Prisma migration revert procedure documented in spec 013 runbook.

## Recommended Implementation Order

1. New deps: `argon2`, `otplib` → `npm install` → commit lockfile (as a single PR-prep step).
2. Migration `0005_auth_users_persistence`.
3. `encryption.service.ts` + `password-hashing.service.ts` + `password-policy.service.ts` + tests.
4. `users.repository.ts` (memory + Prisma) + `users.service.ts` rewrite + tests.
5. `auth.service.ts` rewrite (login/lockout) + tests.
6. `mfa.service.ts` rewrite (TOTP + backup codes) + tests.
7. `password-reset.service.ts` + tests.
8. Auth endpoints + admin user endpoints in `runtime-http-wiring.module.ts` + integration tests.
9. `local-bootstrap-admin.ts` + tests for bootstrap and refusal-in-production.
10. ConfigModule env validation + `.env.*.example` updates.
11. Audit actions constants and uses.
12. Optional: admin users back-office pages.
13. Runbooks (`docs/runbooks/user-*.md`).
14. Validations.

## Complexity Tracking

No constitutional violations. No exception requested.

## Post-Design Constitution Re-Check

- Technical platform role: Pass.
- Regulatory and consent: Pass.
- Feature flags and activation: Pass.
- Frontend application separation: Pass.
- Security and RBAC: Pass.
- Data and auditability: Pass.
- Routing integrity: Pass.
- AI control: Pass.
- UX and content safety: Pass.
- Testing discipline: Pass.
- Async and reliability: Pass.
- Continuous workflow safety: Pass with stop condition (approved for `/speckit.tasks`; implementation still gated by human review of `tasks.md`, test matrix and audit coverage).

## Final Constitution Evidence

- Technical platform role: Pass. The implementation stays on Backend API plus Back-office Partenaires/Plateforme auth surfaces; Web Publique Client has source-marker guardrails proving no back-office auth routes, session cookies, layouts or public sign-up were introduced.
- Security and RBAC: Pass. Passwords use argon2id, MFA secrets are encrypted, reset/MFA backup tokens are hashed, admin user endpoints require MFA-verified roles, and scoped role/lifecycle tests cover super admin, compliance admin, admin pays and broker refusals.
- Data and auditability: Pass. `UsersRepository` and `AuditLogRepository` are durable Prisma runtime repositories outside tests; runtime PostgreSQL smoke validates persisted users, migrations, HTTP flows and durable audit writes.
- Testing discipline: Pass. Final validation completed on Node v24.15.0: typecheck, lint, full Vitest, Playwright web tests, build, Prisma validate, migration-from-empty diff generation, npm audit high, git diff check, focused auth/user suite, runtime PostgreSQL smoke, and secret/public-surface scan.
- Continuous workflow safety: Pass. No auto-commit or merge performed. The default shell still resolves Node v24.12.0, so operators must keep the Node v24.15.0 path active or update the machine PATH before CI-style reruns.
