# Phase 0 Research: Auth and Users Persistence

## Hashing library choice

- **Decision**: `argon2` (native Node binding) for password hashing. Argon2id variant. Parameters: memory ≥ 64 MiB, time cost ≥ 3, parallelism ≥ 1.
- **Reason**: argon2 is the OWASP-recommended modern KDF, resistant to GPU/ASIC attacks, memory-hard. The `argon2` npm package is widely audited and matches the implementation used by other production stacks. The native binding installs cleanly on Linux Alpine via prebuilt binaries.
- **Alternative considered**: `@node-rs/argon2` (Rust binding). Equivalent security; rejected as the default to favor the more battle-tested option, but the plan keeps it as an escape hatch if the native binding has cross-platform issues.
- **Self-test**: at process start, perform one verify against a known hash and assert the timing window. If outside [50ms, 1s], log a structured warning. This catches misconfiguration early.

## TOTP library choice

- **Decision**: `otplib`. RFC 6238 compliant. Provides `authenticator.generate`, `verify`, `keyuri`, secret encoder helpers.
- **Reason**: stable, well-maintained, supports skew tolerance and authenticator URIs out of the box.
- **Alternative considered**: `speakeasy` (less actively maintained), `@otplib/preset-default` (newer subset). Default choice favors the established API surface.

## MFA secret storage

- **Decision**: AES-256-GCM ciphertext keyed by `ENCRYPTION_KEY`, stored as base64 string in `User.mfaSecretEncrypted`.
- **Reason**: MFA verification requires the plaintext secret on each verify; one-way hashing is not viable. AES-GCM provides authenticated encryption; the IV is randomly generated per encryption and prepended to the ciphertext.
- **Implementation**: Node built-in `crypto`. No extra dep.
- **Key rotation**: out of V1 scope. Documented as future spec.

## Backup codes

- **Decision**: 8 codes of 10 hex characters at enrolment time. Each code hashed with argon2id (cheap parameters since they're random). Single-use enforced at verification.
- **Reason**: gives users an offline recovery path if their authenticator is lost. Hashing avoids the same concern as plaintext passwords.

## JWT TTL

- **Decision**: 15 minutes by default, configurable via `AUTH_JWT_TTL_MINUTES`.
- **Reason**: short TTL limits damage if a token is leaked. Refresh tokens are explicitly OUT of V1; users re-authenticate at expiry. UX cost is acceptable for an admin-only surface in V1.
- **Future evolution**: a separate spec may add refresh tokens with rotation, plus session revocation when WebAuthn or SSO is introduced.

## Account lockout

- **Decision**: 5 failed logins within 15 minutes → `locked` for 30 minutes (or admin unlock). Counters atomic via Prisma `update({ data: { failedLoginCount: { increment: 1 } } })`.
- **Reason**: deters credential-stuffing while keeping legit users from being permanently locked out by a typo.
- **Configurable**: `AUTH_LOCKOUT_THRESHOLD`, `AUTH_LOCKOUT_WINDOW_MINUTES`, `AUTH_LOCKOUT_COOLDOWN_MINUTES`.

## Rate limiting

- **Decision**: Per-IP and per-email rate limits on `/auth/login`, `/auth/password-reset`, `/auth/mfa/verify`. Reuse the existing public rate-limit middleware where applicable; if it doesn't currently support per-key composite buckets, add a thin wrapper.
- **Reason**: defense in depth alongside lockout.

## Bootstrap admin

- **Decision**: env-gated path, refused at startup in production.
- **Why a hard fail rather than a silent skip**: an operator misconfiguring production with the bootstrap vars would otherwise silently create a Super Admin in production. A fatal startup error surfaces the misconfiguration immediately.
- **Allowed APP_ENV values**: `local` and `preproduction`. Anything else makes the bootstrap a no-op (without fatal error) except `production` which fatals.

## Email channel for activation / reset

- **Decision**: Reuse the notifications module + Gmail SMTP from spec 013. Emails go through `EMAIL_DELIVERY_MODE`. In preprod default `preview`, emails land in Mailpit. Switch to `send` is operator-driven.
- **Fallback**: if SMTP is unconfigured (`EMAIL_DELIVERY_MODE=preview` and no Mailpit either), the activation/reset endpoint returns the token to the caller (Super Admin) ONCE in the response. This matters for first-deploy when no email infra is wired yet.

## Public sign-up

- **Decision**: NOT in V1. Users are created exclusively by authorized admins.
- **Reason**: AssurMatch's positioning is technical platform; visitors do not have customer accounts.

## Refresh tokens

- **Decision**: NOT in V1. Re-login required at JWT expiry.
- **Reason**: complexity vs. value tradeoff. The admin surface is small; 15-minute TTL is acceptable.

## Password history

- **Decision**: NOT in V1. Documented as a future hardening (forbid the last N passwords).

## WebAuthn / SSO

- **Decision**: NOT in V1. Both will be future specs.

## Inputs still needed before /speckit.tasks

1. Confirmation of argon2 parameters after a benchmark on the production-like VPS (the plan defaults are conservative; tasks may tune).
2. Confirmation of email templates and sender display name (currently `EMAIL_FROM=rotaryabidjan2plateaux@gmail.com` from spec 013).
3. Confirmation of password deny-list source (top-N common-password list from a reputable source, vendored as JSON).
4. Decision: are admin user-management back-office pages in V1 or V1.1? The spec lists them as V1.1; the plan keeps them as a follow-up task that may be split into a separate spec if budget tightens.

## Rejected options

- bcrypt for passwords (older KDF, weaker defenses; argon2id is the modern choice).
- Plaintext or reversible cipher MFA secrets (security gap).
- HOTP instead of TOTP (less convenient for users).
- Long JWT TTL with no refresh (poor leak posture).
- Public sign-up endpoint (out of mission).
- Auto-deletion of locked accounts (would lose audit history).
