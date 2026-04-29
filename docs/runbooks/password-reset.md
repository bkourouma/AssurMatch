# Password Reset Runbook

## Issue Reset

1. Confirm Super Admin or Compliance Admin with MFA.
2. Submit `POST /admin/users/:id/password-reset` with reason.
3. If SMTP is configured, confirm delivery status. If SMTP is unavailable or fails, use the one-time token returned in the response through an approved internal channel.
4. Confirm audit `user.password_reset_issued`.

## Consume Reset

1. User submits `POST /auth/password-reset` with the reset token and `newPassword`.
2. Token must be unexpired and unused.
3. On success, token hash is cleared, lockout state is cleared, and audit `user.password_reset_consumed` is written.
4. Invalid, expired or reused tokens audit `user.password_reset_invalid`.

Never log or store the plaintext reset token outside the one-time fallback response.
