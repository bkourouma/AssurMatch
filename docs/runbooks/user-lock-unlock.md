# User Lock/Unlock Runbook

## Automatic Lockout

Repeated failed login or MFA attempts increment `failedLoginCount`. When the configured threshold is reached, the user is set to `status=locked` with `lockedReason`.

## Manual Lock

1. Confirm Super Admin or Compliance Admin with MFA.
2. Submit `POST /admin/users/:id/lock` with reason.
3. Confirm audit `user.locked`.

## Unlock

1. Validate the user recovery request through the approved support process.
2. Submit `POST /admin/users/:id/unlock` with reason.
3. Confirm `status=active`, `failedLoginCount=0`, and no `lockedAt`.
4. Confirm audit `user.unlocked`.
