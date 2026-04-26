# Quickstart: Auth Frontend Session Integration

## Local setup

1. Ensure the backend auth token secret is configured outside test mode:

   ```powershell
   $env:ASSURMATCH_AUTH_TOKEN_SECRET = "replace-with-at-least-32-characters-secret"
   ```

2. Start the backend and the relevant back-office app using the repo's existing
   local workflow.

3. Open the broker or admin back-office login route:

   ```text
   /login
   ```

## Manual validation path

1. Submit valid back-office credentials.
2. Confirm the login action calls `/auth/login`.
3. Confirm a protected page calls `/auth/me` with `Authorization: Bearer <token>`.
4. Confirm broker/admin API calls include `Authorization: Bearer <token>`.
5. Confirm no runtime frontend request includes `x-assurmatch-*`.
6. Delete or corrupt the cookie and reload a protected page; the app redirects to login.
7. Use a Starter broker token on `/crm`; the broker app shows access denied or redirects before CRM data renders.
8. Use a broker token on the admin app; the admin app shows access denied or redirects before admin data renders.
9. Visit the Web Publique Client; no back-office auth/session/client code is loaded.

## Required final validations

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
npm run build
npx prisma validate --schema backend/prisma/schema.prisma
npm audit --audit-level=high
git diff --check
```
