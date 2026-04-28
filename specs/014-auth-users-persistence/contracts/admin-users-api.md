# Contract: `/admin/users/*` API

All endpoints require an authenticated, MFA-verified actor whose role is permitted per the matrix in
`plan.md` §9. Audit on every action with `reason` field (>= 8 chars when applicable).

## `POST /admin/users` — create

Body:

```json
{
  "email": "alice@example.com",
  "displayName": "Alice Example",
  "phone": "+22501020304",
  "roles": ["super_admin"],
  "partnerTenantId": null,
  "scopes": { "countryIds": [], "productIds": [] },
  "reason": "onboarding alice for ops"
}
```

Behavior:

- Validates per `adminUserCreateRequestSchema`.
- Refuses if email already exists (409).
- Creates user with `status=invited`, `mfaStatus=required`, `passwordChangeRequired=true`.
- Issues a one-time `passwordResetToken` for activation (sha256 hashed, 30-min expiry).
- Sends activation email if SMTP configured; else returns the token in the response payload (admin sees once).
- Audit `user.created`.

Response: `{ user: { id, email, displayName, status, mfaStatus, roles, scopes }, activationToken? }` (token present only when no email channel).

## `PATCH /admin/users/:id` — update profile / scopes

Body: `{ displayName?, phone?, scopes?, reason }`.

Behavior:

- Updates allowed fields. Roles change is a separate endpoint.
- Audit `user.updated` with diff.

## `POST /admin/users/:id/role-update` — change roles

Body: `{ roles: string[], reason: string }`.

Behavior:

- Validates roles against `assurmatch-role-matrix`.
- RBAC check on the actor: super_admin and compliance_admin only; admin_pays only within scope.
- Audit `user.role_changed` with old/new roles + reason.

## `POST /admin/users/:id/suspend`

Body: `{ reason: string }`.

Behavior: sets `status=suspended`. Audit `user.suspended`.

## `POST /admin/users/:id/unsuspend`

Body: `{ reason: string }`. Returns user to `status=active`. Audit `user.unsuspended`.

## `POST /admin/users/:id/lock`

Body: `{ reason: string }`. Sets `status=locked`, `lockedAt=now`. Audit `user.locked`.

## `POST /admin/users/:id/unlock`

Body: `{ reason: string }`. Clears `lockedAt`, resets `failedLoginCount`. Sets status back to `active` (or previous if known). Audit `user.unlocked`.

## `POST /admin/users/:id/password-reset`

Body: `{ reason: string }`.

Behavior:

- Generates new token (32-byte URL-safe random); stores sha256 hash and 30-min expiry. Invalidates prior token.
- Sends email if SMTP configured; else returns the plain token in the response.
- Audit `user.password_reset_issued`.

## `POST /admin/users/:id/mfa-reset`

Body: `{ reason: string }`.

Behavior:

- Clears `mfaSecretEncrypted`, `mfaSecretIssuedAt`, `mfaBackupCodesHashes`.
- Sets `mfaStatus=required`.
- Audit `user.mfa_reset`.
- Notifies the user via email if SMTP configured.

## `DELETE /admin/users/:id` — soft delete

Body: `{ reason: string }`.

Behavior:

- Super Admin only.
- Sets `status=deleted`, `deletedAt=now`. Rotates email to a tombstone (`<id>@deleted.assurmatch.local`) to free the unique constraint.
- Audit `user.deleted`.
- Physical deletion is forbidden in V1.

## `GET /admin/users` — list

Query: `?role=...&status=...&page=1&pageSize=25`.

Behavior:

- RBAC scoped per matrix (super_admin sees all; admin_pays scoped to country; broker roles only their tenant).
- Returns paginated list of `userListItemSchema`. No password material.

## `GET /admin/users/:id` — detail

Returns `userDetailSchema`. No password material. Includes audit summary (last login, last password change, MFA status, lockout status).

## Errors

Same envelope as `/auth/*`. Common codes: 400 validation, 401 auth, 403 RBAC/MFA, 404 user not found, 409 conflict, 422 policy.
