# User Suspend/Unsuspend Runbook

## Suspend

1. Confirm the actor is Super Admin or Compliance Admin and MFA verified.
2. Submit `POST /admin/users/:id/suspend` with a reason of at least 8 characters.
3. Confirm `status=suspended`.
4. Confirm login is refused and audit `user.login_refused_suspended` appears on attempted login.
5. Confirm audit `user.suspended`.

## Unsuspend

1. Confirm the business reason and actor authorization.
2. Submit `POST /admin/users/:id/unsuspend` with reason.
3. Confirm `status=active`.
4. Confirm audit `user.unsuspended`.
