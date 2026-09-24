# Implementation Plan: Dashboard Reports, Period Comparison And Advisor View

**Spec**: `specs/041-dashboard-reports-comparison/spec.md`
**Impacted surfaces**: Backend API, shared packages, Broker Back-office, Back-office Plateforme.

1. Contracts: comparison section, advisor row, export query.
2. Broker dashboard: comparison, advisors, CSV export (permission-gated and audited).
3. Admin dashboard: comparison and CSV export.
4. HTTP wiring for the four routes.
5. Broker CRM and admin dashboard UI additions; source tests.
6. Runtime HTTP tests; `npm run validate`.
