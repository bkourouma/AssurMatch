# Quickstart: Back-office Admin UX Polish

## Local Services

Expected local URLs:

- Backend API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Admin: `http://localhost:3602`
- Mailpit: `http://localhost:8025`

## Manual Verification

1. Start the local stack using the existing project workflow.
2. Open `http://localhost:3602`.
3. Sign in as an admin test user.
4. Verify the admin shell has a sidebar, header, content area, visible user/logout access and readable spacing.
5. Visit Dashboard, Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité and Opérations from the sidebar.
6. Verify dashboard KPI cards, empty/error/loading states where applicable and disabled/read-only sensitive feature flags.
7. Resize to desktop, tablet and mobile widths and verify content remains readable.
8. Open `http://localhost:3601` and verify no admin shell or admin routes appear in the public app.

## Implementation Notes

- Admin UI primitives live in `apps/admin/app/lib/ui/`.
- The admin shell is applied from `apps/admin/app/layout.tsx` and keeps auth routes in a simplified presentation.
- The local screenshot captured during implementation is `output/playwright/admin-local-3602.png`.

## Automated Validations

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
npm run build
npm audit --audit-level=high
git diff --check
```

If local services are available, also run the existing local web/browser validation workflow.

## Compliance Checks

Confirm:

- No business logic, routing rules, security rules, Prisma schema or API routes changed.
- No production feature flag was activated.
- Sensitive flags remain disabled/read-only when disabled.
- Forbidden phrases are absent:
  - `Souscrire maintenant`
  - `Contrat validé`
  - `Garantie acceptée`
  - `Acheter maintenant`
