# Research: Portail Starter Courtier

## Decision: Extend existing `leads` module rather than create a CRM module

**Rationale**: Starter is explicitly not a CRM. The existing 002 `leads` module already owns LeadAssignment, broker lead access and routing output. Extending it keeps the domain small and avoids accidentally activating Pro pipeline concepts.

**Alternatives considered**: Creating `broker-crm` was rejected because Kanban, pipeline, tasks and advanced notes are out of scope. Creating a separate `broker-portal` module was rejected for this increment because the existing repo has no such module and `leads` already contains broker-facing controllers.

## Decision: Use explicit Starter endpoints under `/broker/starter/*`

**Rationale**: Dedicated endpoints make plan gating and blocked CRM behavior testable. They avoid overloading the 002 `/broker/leads` surface that allows generic status update semantics.

**Alternatives considered**: Reusing `/broker/leads` was rejected because 003 requires stricter Starter plan checks, export permission, seen marking, history and Pro capability denial.

## Decision: Add minimal immutable history for broker-visible actions

**Rationale**: The constitution requires an opposable history for sensitive actions and disputes. A minimal event history supports audit, dispute review and broker transparency without becoming advanced CRM notes.

**Alternatives considered**: Storing only current status was rejected because disputes and action chronology must be historized. Full commercial notes were rejected because they are explicitly excluded.

## Decision: CSV export remains small, scoped and permission-controlled

**Rationale**: Starter export is operational only. It must be limited by tenant, filters, column allowlist, row/date limits and audit. This avoids broad reporting or BI behavior.

**Alternatives considered**: Asynchronous bulk exports were rejected for this increment because the spec asks for simple CSV and the Starter scope should remain small.

## Decision: In-app notifications only

**Rationale**: The spec allows in-app or minimal notifications. Existing notification models can represent broker lead events without adding external delivery or WhatsApp/SMS risk.

**Alternatives considered**: Email/WhatsApp notifications were rejected because they can expose PII outside authorized views and are not required for Starter.

## Decision: Advanced AI stays hidden for Starter

**Rationale**: The constitution allows AI only as audited assistance, but the 003 scope excludes advanced commercial AI. The portal must not expose broker assistant, lead scoring or commercial suggestions to Starter users.

**Alternatives considered**: Showing existing quote summaries was rejected unless future plan/flag permissions explicitly include them.
