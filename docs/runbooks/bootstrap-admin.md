# Bootstrap Admin Runbook

## Local/Preproduction Only

Bootstrap exists to create the first Super Admin for local or preproduction testing. It is forbidden in production.

## Configure

Set both values:

```bash
APP_ENV=preproduction
LOCAL_BOOTSTRAP_ADMIN_EMAIL=admin@assurmatch.local
LOCAL_BOOTSTRAP_ADMIN_PASSWORD=<12+ char password>
```

Restart the API. If no Super Admin exists, startup creates one with `mfaStatus=required` and an argon2id password hash.

## Verify

1. Check structured logs for `local_bootstrap_admin.created` or a skipped state.
2. Confirm audit `local_bootstrap_admin.created`.
3. Log in and enroll MFA immediately.

## Production Refusal

If `APP_ENV=production` and any bootstrap env var is present, startup must fail and audit `local_bootstrap_admin.refused_in_production`.

Never log the bootstrap password, MFA secrets, backup codes or reset tokens.
