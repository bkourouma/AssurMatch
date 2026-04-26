# Research: Auth Frontend Session Integration

## Decision: Store the back-office access token in an HTTP-only same-site cookie

**Rationale**: Broker and admin pages are Next.js App Router server components.
Server-side cookie access lets the API clients attach `Authorization: Bearer
<token>` without exposing the token to browser JavaScript, localStorage or URLs.
It also keeps logout and redirects inside the back-office apps.

**Alternatives considered**:
- `localStorage`: rejected because it exposes the token to browser scripts.
- Non-HTTP-only cookie read by client components: rejected because the token
  would be script-readable.
- Full backend session store/refresh-token rotation: rejected as outside scope.

## Decision: Use one back-office cookie name in broker and admin apps

**Rationale**: Both apps are part of the Back-office Partenaires/Plateforme and
share the same token format. Each app still has its own middleware and role
gate, so a broker token cannot open admin pages.

**Alternatives considered**:
- Separate broker/admin cookie names: workable, but duplicates login state and
  does not improve API authorization because the backend still validates roles.
- Public app cookie reuse: rejected; public routes must not depend on
  back-office auth.

## Decision: Validate protected navigation through app middleware and `/auth/me`

**Rationale**: Middleware can redirect absent, expired or invalid tokens before
protected pages render. Calling `/auth/me` verifies signatures using the backend
instead of duplicating token verification in the frontend.

**Alternatives considered**:
- Decode JWT in the frontend: rejected because the backend remains the trusted
  source of token validity and secrets.
- Page-only checks: weaker for static admin pages and can render protected UI
  before validation.

## Decision: Keep `x-assurmatch-*` only in explicit tests

**Rationale**: Spec 005 made these headers ignored in normal runtime. Keeping
them in frontend runtime clients would create false confidence and break real
auth. Backend integration helpers may still use them only when
`ASSURMATCH_ALLOW_TEST_AUTH_HEADERS=true`.

**Alternatives considered**:
- Conditional runtime fallback to dev headers: rejected because it would
  reintroduce forbidden auth behavior.

## Decision: Surface MFA-required UI without implementing a new MFA lifecycle

**Rationale**: The API already exposes MFA-related endpoints, but the current
login response does not include a complete challenge flow. This feature shows a
clear MFA-required state and keeps protected routes blocked until the API
returns a verified token.

**Alternatives considered**:
- Build a full MFA enrollment/challenge product flow: rejected as outside scope.
