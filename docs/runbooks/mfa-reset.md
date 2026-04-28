# MFA Reset Runbook

## When To Use

Use only when a user loses authenticator access and backup codes are unavailable.

## Steps

1. Confirm Super Admin or Compliance Admin with MFA.
2. Validate the user's identity through the approved support process.
3. Submit `POST /admin/users/:id/mfa-reset` with reason.
4. Confirm `mfaStatus=required`, no encrypted secret, and no backup-code hashes.
5. Confirm audit `user.mfa_reset`.
6. User logs in and repeats `/auth/mfa/enroll` and `/auth/mfa/verify`.

Do not ask the user to share TOTP codes except during the live verification flow.
