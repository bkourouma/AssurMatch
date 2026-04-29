# Contract: `/auth/*` API

All endpoints under the back-office surface (`api-assurmatch.allianceconsultants.net`). Public app gets none of these.

## `POST /auth/login`

Body: `{ email: string, password: string (12-512 chars) }`

Behavior:

- 401 if user not found OR wrong password OR `status=deleted`. Constant-time response for user-not-found and wrong-password paths.
- 403 if `status=suspended`.
- 423 if `status=locked`.
- 200 on success: `{ accessToken, mfaRequired: boolean, user: { id, email, displayName, roles, mfaStatus } }`. `accessToken` carries `mfaVerified` reflecting current MFA state.
- Audit: `user.login_succeeded` or `user.login_failed`. Lockout transitions audited as `user.locked_after_failed_logins`.
- Rate-limited per IP and per email.

## `POST /auth/logout`

Authenticated. No server-side state to clear; the client deletes the cookie. 204.

## `GET /auth/me`

Authenticated. Returns the actor context (id, roles, MFA state, scopes). 200.

## `POST /auth/activate`

Body: `{ token: string, password: string }` (12-512 chars).

Behavior:

- Looks up user by `passwordResetTokenHash = sha256(token)`. Token must be unexpired and unused.
- On success: hashes password (argon2id), stores `passwordHash`, sets `status=active`, clears `passwordChangeRequired`, clears `passwordResetTokenHash` and expiry.
- Audit: `user.activated` + `user.password_changed`.
- 401 on invalid/expired token.

## `POST /auth/password-change`

Authenticated.

Body: `{ oldPassword: string, newPassword: string }`.

Behavior:

- Verifies `oldPassword`. On failure: 401, audit `user.password_change_failed`.
- Validates `newPassword` against policy. On failure: 422.
- Hashes and stores new password. Updates `passwordChangedAt`.
- Audit `user.password_changed`.

## `POST /auth/password-reset`

Body: `{ token: string, newPassword: string }`.

Behavior:

- Same as `activate` for token consumption + password hashing.
- Resets `failedLoginCount` to 0; clears `lockedAt`.
- Audit `user.password_reset_consumed` (or `user.password_reset_invalid` on failure).

## `POST /auth/mfa/enroll`

Authenticated, MFA not yet verified.

Behavior:

- Generates a fresh 32-byte base32 secret.
- Encrypts it with `ENCRYPTION_KEY`, stores in `mfaSecretEncrypted`. Sets `mfaSecretIssuedAt`.
- Generates 8 backup codes (10 hex chars each), hashes them with argon2id, stores in `mfaBackupCodesHashes`.
- `mfaStatus = enrolled`.
- Returns `{ secret, otpauthUri, backupCodes }` ONCE. The plaintext is never returned again.
- Audit `user.mfa_enrolled`.

## `POST /auth/mfa/verify`

Authenticated.

Body: `{ challengeId?: string, code: string, kind: "totp"|"backup" (default "totp") }`.

Behavior:

- TOTP: verifies with `otplib.authenticator.verify(secret, code)` with +/-1 step skew.
- Backup: matches against `mfaBackupCodesHashes`; on success, clears the matching slot.
- On success: reissues the JWT with `mfaVerified=true`. Sets `mfaStatus=verified`.
- On failure: increments a transient counter using the same lockout columns as login failures. Audit `user.mfa_failed`.
- Audit `user.mfa_verified` on success.

## Errors and status codes

- `400` - validation (zod) failure.
- `401` - auth failure (login, MFA, token).
- `403` - forbidden (suspended, role).
- `409` - conflict (duplicate email at create time).
- `422` - policy failure (password too short, etc.).
- `423` - locked account.
- `429` - rate limit exceeded.

All error responses use the existing `ErrorResponseFilter` envelope. Never echoes secrets.
