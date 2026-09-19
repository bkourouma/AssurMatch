# Implementation Plan: Enterprise Agencies, Custom Roles, SLA And Broker Branding

**Spec**: `specs/040-enterprise-agencies-roles-sla/spec.md`
**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Broker Back-office, Back-office Plateforme.

1. Contracts: agency, membership, custom role, SLA, branding.
2. Prisma models + migration `0014_enterprise_agencies` + migrations test; enterprise repository (memory/Prisma).
3. `EnterpriseAccessPolicy` (MFA, tenant, Enterprise plan, owner permission) shared by the services.
4. Agencies, custom roles, SLA and branding services with audit.
5. Runtime + HTTP wiring (`/broker/enterprise/...`, `/admin/partners/sla`).
6. Broker `/enterprise` page and admin SLA panel; source tests.
7. Runtime HTTP tests; `npm run validate`.
