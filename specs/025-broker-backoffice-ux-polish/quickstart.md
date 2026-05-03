# Quickstart: Broker Back-office UX Polish

## Static Validation

From the repository root:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
npm run build
npm audit --audit-level=high
git diff --check
```

Run a secret scan or equivalent repository check before commit.

## Local UX Review

If the local stack is available:

```powershell
.\launch-local.bat
npm run local:health
npm run test:web:local
```

Open the broker back-office at the local broker URL, expected default:

```text
http://127.0.0.1:3603
```

Review:

- Dashboard shell, sidebar, header and logout.
- Leads list and Starter lead detail.
- CRM page for Starter gating.
- CRM page for Pro/Enterprise gating when a dev account exists.
- Account page.
- Team page if available.
- Notifications if available.
- Responsive desktop and mobile widths.
- Unauthenticated redirect to login.

Use only local/dev broker accounts. Do not commit credentials, activation tokens or reset passwords.

## Guardrail Review

Confirm:

- No Web Publique Client route loads broker or admin UI.
- No broker navigation links to admin routes.
- No forbidden regulatory phrase appears in changed files.
- No Prisma migration or backend business logic change is present.
- No production feature flag default changes are present.

## Expected Outcome

The broker back-office feels like a professional operational tool while preserving all existing AssurMatch constitutional constraints, plan/flag gating and tenant isolation.
