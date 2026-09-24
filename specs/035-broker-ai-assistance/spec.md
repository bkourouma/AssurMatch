# Feature Specification: Broker CRM AI Assistance

**Feature Branch**: `035-broker-ai-assistance`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; all AI flags stay disabled by default and sensitive ones can only be enabled through the explicit compliance policy path)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: AI outputs are suggestions for the broker partner. They never change a lead status, a routing, a price or an eligibility. Scores and classifications require an explicit human validation decision that is audited.
- **Impacted application(s)**: Backend API, shared packages, Broker Back-office (CRM lead detail and CRM home). No public surface.
- **Affected scopes**: Partner tenant (strict tenant isolation, partner opt-out flag `ai_partner_opt_out`), plan (Starter excluded, `loss_analysis` Enterprise only), country/product AI flags, global `ai_broker_assistant_enabled`, `ai_lead_scoring_enabled`, `ai_duplicate_detection_enabled`.
- **Frontend separation**: Broker-only routes under `/broker/crm/...`; nothing reaches the public app.
- **Required feature flags**: `broker_crm_enabled` (CRM access), `ai_broker_assistant_enabled` (summary, next action, relaunch, loss analysis), `ai_lead_scoring_enabled` (score, classification), `ai_duplicate_detection_enabled` (duplicate hint), `country_ai_enabled`, `product_ai_scoring_enabled` for scoring. All default `false`; sensitive AI flags can only be enabled through `FeatureFlagsService.applyCompliancePolicy` (audited policy reference), never through HTTP.
- **Consent and transmission**: Only consented, routed leads exist in the CRM. The AI input is built from CRM data with contact fields removed (only `hasEmail`/`hasPhone` booleans) and goes through the PII minimizer.
- **Partner license controls**: Existing CRM access policy (tenant, MFA, plan, permissions) is enforced before any AI call through `BrokerCrmLeadsService.detail`.
- **Audit and data history**: Every interaction persists an `AIInteraction` bound to the lead (`targetType=LeadAssignment`) and the tenant; audit logs for queued/completed/refused/validated/opt-out with hashes only.
- **Security and RBAC**: Read-only roles can request summaries, scores, classifications and duplicate hints; drafting (`next_action`, `relaunch_message`) and validation require CRM mutation rights; opt-out requires `broker_crm:*` (owner). Cross-tenant interaction reads return 404. Daily tenant quota (200) in the gateway.
- **Routing impact**: None.
- **AI impact**: Central gateway only; structured outputs (`lead_score`, `lead_classification`) validated by zod with deterministic fallback; guardrails and disclaimer on every text.
- **UX/content restrictions**: "Suggestion IA a valider", "le courtier decide", "aucune decision automatique". Never "Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance".
- **Workflow continuity**: Standard.

## Requirements

- Contracts: broker assist type schemas, request body (`language`), human validation decision, lead classification schema, opt-out request/status.
- `BrokerAiService`: `requestForLead(leadId, assistType, body, actor)` (async, queue + poll), `lossAnalysis(actor, body)` (tenant-level, Enterprise), `read(id, actor)`, `listForLead(leadId, actor)`, `validate(id, decision, actor)`, `optOutStatus(actor)`, `setOptOut(actor, body)`.
- HTTP: `POST /broker/crm/leads/:leadId/ai/:assistType`, `GET /broker/crm/leads/:leadId/ai`, `GET /broker/crm/ai/interactions/:id`, `POST /broker/crm/ai/interactions/:id/validation`, `POST /broker/crm/ai/loss-analysis`, `GET|PUT /broker/crm/ai/opt-out`.
- Broker app: CRM lead detail page fetches the real lead detail and shows the AI panel only when assistance is enabled for the tenant; CRM home exposes the partner opt-out preference.

## User Scenarios & Testing

1. **Given** flags enabled through the compliance policy path and a Pro tenant lead, **When** the owner requests `lead_summary`, **Then** a queued interaction is returned, becomes `completed` with the disclaimer and no contact data in prompt hashes/audit.
2. **Given** `lead_score`, **Then** `outputData` validates the score schema, `humanValidationStatus` is `pending`, and the owner can approve it (audited `ai.interaction.validated`).
3. **Given** another tenant, **Then** reading the interaction returns 404; a Starter actor gets 403 from the CRM policy.
4. **Given** the partner opted out, **Then** every request is `refused` with `ai_disabled` and no model call.
5. **Given** a Pro tenant requesting `loss_analysis`, **Then** it is refused (`plan_enterprise_required`); an Enterprise tenant gets a completed analysis.

## Validation

- `npm run validate` green; broker source tests; runtime HTTP tests for the broker AI routes.
