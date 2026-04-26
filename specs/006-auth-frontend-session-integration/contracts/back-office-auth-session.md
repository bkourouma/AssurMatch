# Contract: Back-office Auth Session

## Login

`POST /auth/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "very-secure-pass"
}
```

Success response:

```json
{
  "accessToken": "<signed bearer token>",
  "mfaRequired": false,
  "user": {
    "id": "<user id>",
    "email": "admin@example.com",
    "displayName": "Admin",
    "roles": ["super_admin"],
    "partnerTenantId": null,
    "mfaStatus": "verified"
  }
}
```

Client obligations:
- Store `accessToken` only in the HTTP-only back-office cookie.
- Call `/auth/me` before rendering protected pages.
- If `mfaRequired` is true, show MFA-required state and keep protected pages blocked.

## Current Profile

`GET /auth/me`

Required header:

```text
Authorization: Bearer <signed bearer token>
```

Success response:

```json
{
  "actorId": "<actor id>",
  "roles": ["broker_owner_starter"],
  "partnerTenantId": "<broker tenant id>",
  "partnerPlan": "starter",
  "mfaVerified": true
}
```

Client obligations:
- Treat 401 as expired/invalid session and redirect to login.
- Treat `mfaVerified: false` as MFA-required.
- Do not derive role, tenant, plan or MFA from environment variables.

## Logout

`POST /auth/logout`

Required header:

```text
Authorization: Bearer <signed bearer token>
```

Client obligations:
- Attempt the API call when a token exists.
- Always delete local back-office session cookie after logout, even if the API is temporarily unavailable.

## Protected Broker/Admin Calls

Required header:

```text
Authorization: Bearer <signed bearer token>
```

Forbidden runtime headers:

```text
x-assurmatch-actor-id
x-assurmatch-roles
x-assurmatch-partner-tenant-id
x-assurmatch-partner-plan
x-assurmatch-country-scopes
x-assurmatch-product-scopes
x-assurmatch-mfa-verified
```

Response handling:
- 401: clear session/redirect to login.
- 403: show access denied and remove protected data from visible state.
- 5xx/network: show non-sensitive recoverable error.
