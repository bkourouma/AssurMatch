# User Create Runbook

## Scope

Use this runbook for admin-created AssurMatch users only. Public visitor journeys must not create accounts.

## Steps

1. Confirm the actor is MFA verified and authorized for `users:create`.
2. Create the user from the back-office or `POST /admin/users` with email, display name, roles and scopes.
3. Confirm the user starts as `status=invited`, `mfaStatus=required` and `passwordChangeRequired=true`.
4. If email delivery is unavailable, give the one-time activation token to the user through an approved internal channel.
5. Verify audit entries for `user.created` and activation-token issuance.

## Safety Checks

- Never send passwords, MFA secrets, backup codes or reset tokens in logs.
- Broker roles must not create users.
- Public app routes must remain unauthenticated and account-free.
