# Quickstart: Dashboards courtier et admin

## Prerequisites

- Node.js >=24.15.0
- Docker (PostgreSQL via `docker compose up -d postgres`)
- `.env` configured with valid `DATABASE_URL`

## 1. Apply migrations

```powershell
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

(No new migration is added by spec 012; this just ensures the database is up to date.)

## 2. Seed minimal data

```powershell
npm run prisma:seed
```

## 3. Activate `broker_dashboard_enabled`

The flag is fail-closed. To exercise the broker dashboards in a dev environment, toggle it via the existing admin endpoint or update the persisted flag value to `true` (for the global scope) using a Super Admin actor.

## 4. Start the backend

```powershell
npm run dev:backend
```

(or use the existing dev startup command in your environment.)

## 5. Try the endpoints

```bash
curl -H "Authorization: Bearer <broker-token>" \
     "http://localhost:3000/broker/dashboard?from=...&to=..."

curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3000/admin/dashboard"

curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3000/admin/dashboard/compliance-alerts?page=1&pageSize=25"
```

## 6. Run the tests

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
npm run build
npx prisma validate --schema backend/prisma/schema.prisma
npm audit --audit-level=high
```

Optionally, after any Prisma path change:

```powershell
npm run test:runtime:postgres
```

## 7. Front-end pages

- Broker home (Starter): http://localhost:3001/
- Broker CRM (Pro/Enterprise): http://localhost:3001/crm
- Admin home: http://localhost:3002/
- Admin dashboard: http://localhost:3002/dashboard
- Admin compliance alerts: http://localhost:3002/dashboard/compliance-alerts

(Ports adapted to your local config.)
