# Research: CRM Courtier Pro/Enterprise

## Decision: Build CRM as broker back-office module only

**Rationale**: The constitution requires separation between public visitor journeys and authenticated partner/admin journeys. The broker app already hosts Starter portal screens and is the right bounded surface for Pro/Enterprise CRM.

**Alternatives considered**: Adding CRM affordances to public lead tracking was rejected because it would couple public and partner journeys.

## Decision: Reuse LeadAssignment as CRM anchor

**Rationale**: Features 002 and 003 already produce tenant-scoped assignments and tests. CRM state can attach to the assignment without changing routing eligibility.

**Alternatives considered**: Creating a separate Lead model now would duplicate tenant/routing semantics and increase cross-tenant risk.

## Decision: Controlled pipeline enum in shared contracts

**Rationale**: Kanban, list, detail, export and tests need a single canonical status set. Zod schemas provide shared validation across backend and UI tests.

**Alternatives considered**: Free-form status strings were rejected because history and audit would be harder to prove.

## Decision: Role scope enforced in CRM access policy

**Rationale**: Owner, Manager, Agent and Read-only permissions differ by organization/advisor scope and mutation rights. Centralizing this prevents controller/UI drift.

**Alternatives considered**: Checking roles ad hoc in each service was rejected as fragile.

## Decision: AI foundations metadata only

**Rationale**: The user requested foundations for future AI but no mandatory AI. Returning availability/flag metadata without model calls satisfies extensibility and avoids advice/recommendation risk.

**Alternatives considered**: Generating summaries or relaunch content now was rejected because it would require additional guardrails and audit paths outside this scope.
