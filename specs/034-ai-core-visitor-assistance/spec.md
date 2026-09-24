# Feature Specification: Central AI Gateway And Visitor Assistance

**Feature Branch**: `034-ai-core-visitor-assistance`
**Created**: 2026-09-05
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; every AI module stays disabled by default behind existing flags)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: AI output is assistance only. Every output carries a fixed disclaimer, is screened for advice/recommendation wording, and never triggers routing, pricing, acceptance or eligibility decisions.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client (visitor assistant on product page and quote form). Broker and admin assistance are specs 035 and 036 on the same gateway.
- **Affected scopes**: Countries (`country_ai_enabled`), products (`product_ai_form_assistant_enabled`, `product_ai_scoring_enabled`), partners (opt-out flag `ai_partner_opt_out` scoped by partner), plans, global AI flags, AI Admin role.
- **Frontend separation**: Public endpoints are anonymous, rate-limited and asynchronous (queue + poll); no back-office dependency.
- **Required feature flags**: Global `ai_summary_enabled` (visitor summary, consistency, form help), `ai_recommendation_enabled` (product assistant, FAQ), `ai_broker_assistant_enabled`, `ai_lead_scoring_enabled`, `ai_duplicate_detection_enabled` (spec 035), plus `country_ai_enabled` and the product AI flags. All default `false`; nothing in this spec activates them.
- **Consent and transmission**: Visitor assistance never receives contact data: request schemas only accept product answers and free-text need, and the PII minimizer strips emails, phone numbers and identity fields before any prompt is built. Quote summaries are only produced for consented, submitted requests.
- **Partner license controls**: N/A for visitors; broker assistance (035) is tenant-bound.
- **Audit and data history**: Each call persists an `AIInteraction` (assist type, surface, status, provider, model, prompt hash, output hash, tokens, latency, guardrail result, human validation status, minimization report) and writes AuditLogs for queued/completed/refused/failed transitions. Prompt and output text are never written to the audit log; the interaction row stores the output for the requester to read.
- **Security and RBAC**: Public AI endpoints: Redis rate limit (20 per IP per hour) and daily quota; interaction reads are capability-scoped by the interaction id and the requester surface. Provider secrets live in env; the provider is selected by `ASSURMATCH_AI_PROVIDER=template|anthropic` (template = deterministic, no network, default).
- **Routing impact**: None; the gateway is not reachable from routing.
- **AI impact**: This is the AI feature. Guardrails: forbidden public wording, forbidden advice patterns, mandatory disclaimer, output length cap, JSON validation for structured outputs, provider timeout with deterministic fallback flagged `fallback=true`.
- **UX/content restrictions**: "Assistant IA d'aide a la comprehension", "selon les informations fournies, ce produit pourrait correspondre", "le courtier partenaire confirmera". Never "vous devez souscrire", "meilleure offre", "recommande officiellement".
- **Workflow continuity**: Standard.

## Requirements

- Shared contracts `ai.contracts.ts`: assist types for the three surfaces, interaction DTO, visitor request schemas.
- Prisma `AIInteraction` extended (migration `0011_ai_interactions`) with assist type, surface, status, provider, model, hashes, tokens, latency, output, minimization report, target references, scope ids.
- `backend/src/modules/ai/core/`: `ai-provider.port.ts` (port + `TemplateAiProvider`), `anthropic-ai-provider.ts` (official SDK, model `claude-opus-5` by default, low effort, server-side fallbacks), `ai-provider.config.ts`, `pii-minimizer.ts`, `ai-guardrails.ts`, `ai-prompts.ts`, `ai-interactions.repository.ts`, `ai-gateway.service.ts` (policy, quota, minimization, prompt, provider, guardrails, persistence, audit, fallback).
- `VisitorAiService`: product assistant, request summary, form help, consistency check, FAQ; `POST /ai/visitor/:assistType` (async: returns the queued interaction) and `GET /ai/visitor/interactions/:id`.
- `QuoteAISummaryService` uses the gateway for the post-submission summary (assist type `visitor_request_summary`, target quote) when flags allow; the quote summary record links the interaction.
- Public app: `VisitorAiAssistant` component on the product page (assistant + FAQ) and in the quote form (summary and consistency check before sending), with polling and disclaimer.
- Existing status endpoints (`/admin/ai/assistance`, `/broker/crm/ai-assistance`) report real `enabled` values computed from flags and provider configuration instead of literal `false`.

## User Scenarios & Testing

### User Story 1 - Visitor gets an indicative orientation (P1)
1. **Given** `ai_recommendation_enabled=true`, `country_ai_enabled=true` and the template provider, **When** the visitor posts a need to `/ai/visitor/visitor_product_assistant`, **Then** a queued interaction is returned, becomes `completed` with a disclaimer-bearing text that never says "vous devez souscrire", and an AuditLog `ai.interaction.completed` exists with `modelCall` true and no prompt text.
2. **Given** `country_ai_enabled=false`, **Then** the interaction is `refused` with reason `ai_disabled`, no provider call, audit `ai.interaction.refused`.
3. **Given** 21 calls from the same IP within an hour, **Then** 429.

### User Story 2 - Visitor summarises the request before sending (P0)
1. **Given** answers containing an email and a phone, **When** `/ai/visitor/visitor_request_summary` runs, **Then** the minimization report counts the redactions and the stored prompt hash corresponds to input without those values (asserted through the provider stub receiving no email/phone).
2. **Given** the provider throws, **Then** the interaction is `completed` with `fallback=true` from the template provider and audit `ai.interaction.failed_fallback`.

### User Story 3 - Guardrails (P0)
1. **Given** a provider stub returning "Nous vous recommandons officiellement ce contrat", **Then** the interaction is `refused` (`guardrail_violation`), the text is not exposed, audit `ai.interaction.refused`.
2. **Given** a structured assist type whose provider output is not valid JSON, **Then** the deterministic fallback is used and flagged.

## Validation

- `npm run validate` green; public source tests updated; unit tests for minimizer, guardrails, template provider, gateway; runtime HTTP tests for visitor endpoints.
