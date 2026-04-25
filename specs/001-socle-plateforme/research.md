# Phase 0 Research: Socle plateforme AssurMatch

## Decision: Runtime and Framework Versions

**Decision**: Use Node.js 24.15.0 LTS, TypeScript 6.0.3 strict mode, Next.js 16.2.4, React 19.2.5 and NestJS 11.1.19 as the planning baseline.

**Rationale**: Node.js 24 is the active LTS line on the planning date and matches the enterprise-readiness requirement. TypeScript strict mode and NestJS align with the constitution's maintainability and modular-backend requirements. Next.js/React remain the target stack for public, broker and admin web surfaces.

**Alternatives considered**: Node.js 22 LTS was considered as a more conservative runtime, but the enterprise-ready assumption favors the current active LTS. Deferring exact versions to implementation was rejected because task generation needs concrete setup decisions.

## Decision: Persistence, Cache and Asynchronous Jobs

**Decision**: PostgreSQL with Prisma is the source of truth; Redis is used for active catalog/feature-flag cache, rate limiting, anti-spam, temporary locks, duplicate-prevention hooks and BullMQ queues; BullMQ handles technical notifications, document-processing hooks, future IA jobs, future routing jobs and maintenance tasks.

**Rationale**: This directly follows the constitution and keeps public endpoints thin. PostgreSQL stores auditable facts; Redis supports fast reads and operational controls; BullMQ prevents heavy or failure-prone work from blocking public/admin requests.

**Alternatives considered**: A single PostgreSQL-only approach was rejected because it weakens the cache/rate-limit/queue requirements. A separate microservice event bus was rejected as premature for the monolith-modular foundation.

## Decision: Validation and Shared Contracts

**Decision**: Use Zod 4.3.6 for shared DTO validation contracts in `packages/shared/`, with NestJS pipes/guards/interceptors enforcing validation, RBAC and audit boundaries in the backend.

**Rationale**: Shared schemas reduce drift between backend, admin and future public/broker apps. NestJS guards and interceptors keep controllers thin and make RBAC/audit behavior testable.

**Alternatives considered**: Backend-only class-validator DTOs were considered but would duplicate validation for frontends. Ad hoc validation was rejected because it conflicts with strict input validation and maintainability principles.

## Decision: Test Runner and Test Scope

**Decision**: Use Vitest 4.1.5 for unit, integration, contract and guardrail tests, plus Playwright 1.59.1 for web smoke and accessibility-oriented flows when app shells exist.

**Rationale**: Vitest supports fast TypeScript tests across backend and shared packages, while Playwright covers browser behavior for admin/public/broker shells. The test scope must include constitutional regression cases: RBAC, feature flags, no consent, expired license, disabled country/product, routing pre-checks, audit logs and disabled AI.

**Alternatives considered**: Jest was considered because it is common in NestJS projects, but Vitest offers faster TypeScript ergonomics for a monorepo. Playwright-only testing was rejected because backend domain rules need direct unit/integration coverage.

## Decision: Performance and Scale Targets

**Decision**: Design for 50 countries, 500 products, 5,000 partners, 100,000 users and 50 million monthly public reads. Acceptance targets are p95 under 1 second for enabled public catalog reads, p95 under 2 seconds for admin list/filter reads, p95 under 3 seconds for sensitive mutations excluding async jobs, emergency disable effective within 2 minutes, and paired WhatsApp/email job visibility within 5 minutes.

**Rationale**: These targets translate the clarified enterprise-readiness assumption into measurable planning constraints for pagination, cache, rate limiting, job queues and acceptance data sets.

**Alternatives considered**: Pilot-scale targets were rejected by clarification. Unbounded enterprise scale was rejected because tasks need concrete data volumes and SLOs.

## Decision: Feature Flag Resolution and Fail-Closed Behavior

**Decision**: Feature flags are stored durably in PostgreSQL and cached in Redis with explicit scope precedence: global module disable overrides country, product, partner and plan enables; country/product disables block public exposure and quote/routing actions; partner/module suspend controls block eligibility and execution. Critical reads fail closed when flag cache coherence is uncertain.

**Rationale**: The constitution requires fast deactivation and activation progressive by scope. Fail-closed behavior avoids accidental public exposure during cache inconsistency.

**Alternatives considered**: Redis-only flags were rejected because audit/history would be weak. A third-party flag service was rejected for Phase 1 because the foundation needs internal auditability and country/product/regulatory scopes.

## Decision: Activation Authority

**Decision**: A single scoped authorized admin may activate, reactivate or deactivate countries, products, partners and modules, but the action must include a reason, AuditLog and visible status, and must never bypass mandatory compliance blockers.

**Rationale**: This records the clarification while preserving constitutional blockers for consent, licensing, RBAC, audit and feature flags.

**Alternatives considered**: Two-person approval was safer for regulated activation but rejected by clarification. Super Admin-only activation was rejected because it would slow country operations.

## Decision: Notification Delivery

**Decision**: Every technical or compliance notification sent by WhatsApp must also be sent by email. Notification records track WhatsApp and email delivery statuses independently.

**Rationale**: WhatsApp is the baseline communication channel, but email duplication improves evidence, recovery and operational visibility. This does not activate public or commercial WhatsApp messaging unless future specs and flags approve it.

**Alternatives considered**: WhatsApp-only was rejected because provider failure could create silent compliance gaps. Email-only was rejected by clarification. Email fallback only was rejected because the requirement is paired delivery, not fallback.

## Decision: Consent, Audit and Accreditation Retention

**Decision**: Apply a 10-year default retention period for audit logs, consent evidence and accreditation evidence unless country/regime-specific retention or anonymization rules override it.

**Rationale**: The foundation needs a default for acceptance tests and data modeling before each country has finalized retention policies.

**Alternatives considered**: No default was rejected because it blocks activation readiness. Indefinite retention was rejected because it creates privacy risk.

## Decision: AI Foundation Scope

**Decision**: Implement only base AI module configuration, flag resolution, audit metadata and guardrail status. Advanced scoring, recommendations, assistant behavior, duplicate detection and routing assistance remain disabled and out of active scope.

**Rationale**: The constitution requires central AI governance and disabled-by-scope behavior, but the feature scope explicitly excludes advanced AI.

**Alternatives considered**: Implementing basic summaries or scoring now was rejected because those features belong to later commercial modules and would increase regulatory risk.
