# Data Model: Auth Frontend Session Integration

No new database entities are introduced.

## BackOfficeSession

Frontend server-side session state.

- `accessToken`: signed Bearer token stored only in HTTP-only cookie.
- `profile`: current user profile returned by `/auth/me`.
- `status`: `unknown`, `unauthenticated`, `mfa_required`, `authenticated`, `expired`, `forbidden`, `error`.
- `returnTo`: relative back-office path used after successful login.

Validation rules:
- Token must never be placed in URL, logs, browser localStorage or rendered HTML.
- Missing, expired or invalid token redirects to login before protected data is rendered.
- 403 produces access denied without clearing a still-valid session.

## AccessToken

Signed runtime credential issued by `/auth/login` and verified by the Backend
API.

- Carries actor id, roles, MFA state, tenant, plan and scopes as claims.
- Must be sent as `Authorization: Bearer <token>` to protected broker/admin APIs.
- Must not be replaced by `x-assurmatch-*` headers in runtime frontend clients.

## CurrentUserProfile

Profile returned by `/auth/me`.

- `actorId`
- `roles`
- `partnerTenantId`
- `partnerPlan`
- `countryScopes`
- `productScopes`
- `mfaVerified`
- `correlationId`

Validation rules:
- Broker app accepts broker roles and denies admin-only surfaces.
- Admin app accepts admin roles and denies broker-only identities.
- Starter plan cannot open CRM routes.

## ApiAuthState

Result wrapper used by broker/admin API clients.

- `data`
- `error`
- `unauthenticated`
- `forbidden`
- `mfaRequired`

State transitions:
- `authenticated` -> `expired`: protected API returns 401.
- `authenticated` -> `forbidden`: protected API returns 403.
- `mfa_required` -> `authenticated`: API returns a token with MFA verified.
- any state -> `unauthenticated`: logout or cookie deletion.

## TestAuthSimulationHeaders

Test-only representation of legacy `x-assurmatch-*` headers.

Validation rules:
- Allowed only in backend test helpers, mocks, fixtures or explicit test mode.
- Forbidden in `apps/broker/app/lib/*`, `apps/admin/app/lib/*`, middleware and
  runtime page code.
