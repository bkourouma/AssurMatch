# Feature Specification: Admin Platform AI Insights

**Feature Branch**: `036-admin-ai-insights`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; AI flags stay disabled by default and are only enabled through the audited compliance policy path)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: AI outputs help an administrator prioritise a human review. They never validate an offer, close an alert, activate a country/product, suspend a partner or change a routing.
- **Impacted application(s)**: Backend API, shared packages, Back-office Plateforme (`/ai-assistance`). No public or broker surface.
- **Affected scopes**: Global AI flags, admin roles (AI Admin, Super Admin, Compliance Admin), country/product scope of the requesting admin for offer consistency checks.
- **Frontend separation**: Admin-only routes under `/admin/ai/...`.
- **Required feature flags**: `ai_summary_enabled` (all five admin assist types). Disabled by default; enabling requires the audited compliance policy path.
- **Consent and transmission**: No prospect data. Inputs are aggregates (counts by category, checklist statuses, offer catalogue fields, dashboard KPIs) and pass through the PII minimizer.
- **Partner license controls**: N/A (no partner-scoped output; partner ids are never sent to the model).
- **Audit and data history**: `AIInteraction` per request plus AuditLogs for queued/completed/refused/validated with hashes and metadata only. Sensitive assist types (`admin_risk_triage`, `offer_consistency_check`, `suspicious_leads`) require an explicit human validation decision.
- **Security and RBAC**: MFA required; reads need `ai:read` (or Compliance Admin); requesting a new insight needs `ai:*`. No privilege escalation through AI: the aggregate reads (compliance alerts, admin dashboard, activation checklist) run as the requesting actor, so their own policies still refuse an actor who could not read that data directly - an AI Admin without dashboard access can therefore use `offer_consistency_check` and `suspicious_leads` only, while Super Admin covers all five. Admin daily quota (300) in the gateway; offer consistency checks respect the admin's country/product scopes.
- **Routing impact**: None.
- **AI impact**: Central gateway only, guardrails, disclaimer, deterministic template provider by default.
- **UX/content restrictions**: "Insight IA a valider", "aucune decision automatisee". Never regulated wording ("Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance").
- **Workflow continuity**: Standard.

## Requirements

- Contracts: admin assist types, request bodies (`language`, optional `offerId`, dashboard window), reuse of the validation decision schema.
- `AdminAiService`: `request(assistType, body, actor)` building aggregates from compliance alerts, activation checklist, offer catalogue, admin dashboard and quote requests; `read(id, actor)`; `list(actor)`; `validate(id, body, actor)`.
- HTTP: `POST /admin/ai/insights/:assistType`, `GET /admin/ai/insights`, `GET /admin/ai/insights/:id`, `POST /admin/ai/insights/:id/validation`. `GET /admin/ai/assistance` keeps reporting the computed status.
- Admin app `/ai-assistance`: request buttons (only when assistance is enabled), insight list with status, disclaimer and human validation actions.

## User Scenarios & Testing

1. **Given** `ai_summary_enabled` enabled through the compliance policy path, **When** a Super Admin requests `admin_risk_triage`, **Then** an interaction is queued, completes with the disclaimer, counts refused audit entries by category, and requires human validation; an AI Admin without dashboard access is refused for that assist type (no escalation) but can still run `offer_consistency_check`.
2. **Given** `offer_consistency_check` with an offer id, **Then** the input lists concrete issues (missing guarantees, expired validity, missing disclaimers) and the output is a completed suggestion pending validation.
3. **Given** a support admin (no `ai:read`), **Then** every admin AI route returns 403 with an audited refusal.
4. **Given** the flag off, **Then** the interaction is `refused` (`ai_disabled`) with no model call.
5. **Given** a completed insight, **When** the AI Admin approves it, **Then** `ai.interaction.validated` is audited and the status becomes `approved`.

## Validation

- `npm run validate` green; admin source tests updated; runtime HTTP tests for the admin AI routes.
