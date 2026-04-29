# Data Model: Auth and Users Persistence

This feature does not introduce a new persistent entity. It extends the existing `User` Prisma
model and uses the existing `AuditLog` for audit. Backup codes, password reset token and MFA
secret are stored as additional columns on `User`.

## `User` model — additions in migration `0005_auth_users_persistence`

```
passwordHash               String?     // argon2id hash; null for invited/bootstrap users until activation
passwordChangedAt          DateTime?   // last successful change
passwordChangeRequired     Boolean   @default(true)
failedLoginCount           Int       @default(0)
lastFailedLoginAt          DateTime?
lockedAt                   DateTime?  // null = unlocked; non-null = lockout in effect
lockedReason               String?    // free text + audit reference
mfaSecretEncrypted         String?    // base64(iv:tag:ciphertext) keyed by ENCRYPTION_KEY
mfaSecretIssuedAt          DateTime?
mfaBackupCodesHashes       String[]   // argon2id hashes; index = code position; consumed code becomes ""
passwordResetTokenHash     String?    // sha256 of the token; the plaintext token is sent via email
passwordResetTokenExpiresAt DateTime?
deletedAt                  DateTime?  // soft-delete marker
lastLoginAt                DateTime?  // already exists in current schema
lastLoginIpHash            String?    // sha256 of IP; never plain
```

Indexes (additions):

```
@@index([deletedAt])     // for fast filtering of active users
```

## State machine — User lifecycle

```
invited → active                     (via /auth/activate)
active → suspended                   (admin)
suspended → active                   (admin unsuspend)
active → locked (auto)               (failed-logins threshold)
active|locked → locked (manual)      (admin lock)
locked → active                      (cooldown OR admin unlock)
active|suspended|locked → deleted    (admin soft-delete; one-way)
```

Failed-logins state:

```
counter < threshold AND lastFailedLoginAt < window  → counter resets to 1 on next failure
counter >= threshold                                  → user.status = locked, lockedAt = now
locked AND now − lockedAt > cooldown                  → unlock on next login attempt with valid creds
```

## Password reset state

```
none                                    (default)
issued                                  (passwordResetTokenHash != null AND expiry in future)
expired/consumed                        (any of: expiry past, hash null after consumption)
```

Single active token per user. Issuing a new one invalidates the previous.

## MFA state

```
required          → user must enrol on first login                         (default for new users)
enrolled          → secret stored, ready to verify                         (after /auth/mfa/enroll)
verified          → JWT issued with mfaVerified=true                       (per session)
```

`mfaStatus` already exists on the User model. The spec adds the encrypted secret + backup codes columns.

## Audit actions added

Stored in `AuditLog.action`:

```
user.created
user.updated
user.activated
user.password_changed
user.password_change_failed
user.password_change_required
user.password_reset_issued
user.password_reset_consumed
user.password_reset_invalid
user.mfa_enrolled
user.mfa_reset
user.mfa_verified
user.mfa_failed
user.login_succeeded
user.login_failed
user.login_refused_suspended
user.locked_after_failed_logins
user.suspended
user.unsuspended
user.locked
user.unlocked
user.deleted
user.role_changed
local_bootstrap_admin.created
local_bootstrap_admin.refused_in_production
```

`AuditLog.context` excludes passwords, secrets, tokens. May contain: `userId`, masked email
(local-part hashed), correlation id, IP hash, browser family.

MFA verification failures use the same lockout columns (`failedLoginCount`,
`lastFailedLoginAt`, `lockedAt`, `lockedReason`) with `lockedReason="mfa_failed"`
so three consecutive MFA failures within five minutes can lock the user and be
audited without introducing a second counter in V1.

## DTOs (in `packages/shared/contracts/`)

```
auth.contracts.ts (extended):
  loginRequestSchema       (existing; password length 12+)
  activateRequestSchema     NEW: { token, password }
  passwordChangeRequestSchema NEW: { oldPassword, newPassword }
  passwordResetRequestSchema  NEW: { token, newPassword }
  mfaEnrollResponseSchema     NEW: { secret, otpauthUri, backupCodes }
  mfaVerifyRequestSchema       (existing; ext'd: kind: "totp"|"backup")

user.contracts.ts (new):
  adminUserCreateRequestSchema NEW: { email, displayName, roles, partnerTenantId?, scopes, reason }
  adminUserUpdateRequestSchema NEW: { displayName?, scopes?, reason }
  adminUserActionRequestSchema NEW (suspend/unsuspend/lock/unlock/password-reset/mfa-reset/delete): { reason }
  userListItemSchema            NEW: list response item (no password material)
  userDetailSchema               NEW: detail response (no password material)
```

## Configuration variables added

```
ENCRYPTION_KEY                     mandatory in preproduction and production
AUTH_JWT_TTL_MINUTES               default 15
AUTH_LOCKOUT_THRESHOLD             default 5
AUTH_LOCKOUT_WINDOW_MINUTES        default 15
AUTH_LOCKOUT_COOLDOWN_MINUTES      default 30
AUTH_PASSWORD_DENYLIST_PATH        optional path to a JSON deny-list
LOCAL_BOOTSTRAP_ADMIN_EMAIL        optional, refused in production
LOCAL_BOOTSTRAP_ADMIN_PASSWORD     optional, refused in production
```

## Constraints

- `passwordHash` length is bounded by the argon2 hash length (~ 100 chars typical).
- `mfaSecretEncrypted` length bounded (~ 200 chars after AES-GCM + base64).
- `passwordResetTokenHash` is exactly 64 chars (sha256 hex).
- `lastLoginIpHash` is 64 chars sha256.

## Migration notes

- All new columns are nullable or have safe defaults so the migration is non-breaking on existing
  rows. Existing users without `passwordHash` cannot log in until they activate.
- The migration is reversible: dropping the new columns reverts to the prior schema.
