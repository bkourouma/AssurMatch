# Implementation Plan: Admin Platform AI Insights

**Spec**: `specs/036-admin-ai-insights/spec.md`
**Impacted surfaces**: Backend API, shared packages, Back-office Plateforme.

1. Contracts: admin assist types, request schema, insight list DTO reuse.
2. `backend/src/modules/ai/admin-ai.service.ts`: RBAC/MFA, aggregate builders per assist type, gateway calls, reads, validation.
3. Runtime + HTTP wiring on `AdminAIAssistanceController`.
4. Admin app: API client additions, server actions, `/ai-assistance` page with request and validation controls; source tests (including the CRM status assertion now that it is computed).
5. Runtime HTTP tests; `npm run validate`.
