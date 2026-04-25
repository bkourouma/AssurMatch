# Tasks: Socle plateforme AssurMatch

**Input**: Design documents from `/specs/001-socle-plateforme/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/foundation-api.openapi.yaml`, `quickstart.md`

**Tests**: Required. This feature touches critical RBAC, consent, license, feature flag, audit, Redis, BullMQ, routing and AI guardrail controls.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing after shared setup and foundational controls.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript monorepo, app shells, backend shell, shared package and test harness.

- [X] T001 Create root workspace manifest with Node.js 24.15.0 and package scripts in package.json
- [X] T002 Create TypeScript strict base configuration in tsconfig.base.json
- [X] T003 [P] Create shared lint and formatting configuration in eslint.config.js
- [X] T004 [P] Create environment template with safe disabled defaults in .env.example
- [X] T005 Create monorepo app and package directories in apps/public/, apps/broker/, apps/admin/, backend/src/, backend/prisma/, backend/tests/, packages/shared/
- [X] T006 Initialize NestJS backend bootstrap and module loader in backend/src/main.ts
- [X] T007 [P] Create backend application root module in backend/src/app.module.ts
- [X] T008 [P] Create backend configuration module for local/test/staging/production settings in backend/src/config/config.module.ts
- [X] T009 [P] Create Prisma schema and migration directory placeholders in backend/prisma/schema.prisma
- [X] T010 [P] Create Vitest workspace configuration for unit, integration, contract and guardrail tests in vitest.config.ts
- [X] T011 [P] Create Playwright configuration for web smoke flows in playwright.config.ts
- [X] T012 [P] Create shared contracts package entrypoint in packages/shared/contracts/index.ts
- [X] T013 [P] Create shared validation package entrypoint in packages/shared/validation/index.ts
- [X] T014 [P] Create shared RBAC package entrypoint in packages/shared/rbac/index.ts
- [X] T015 Create Docker Compose services for PostgreSQL, Redis and local object storage in docker-compose.yml

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Establish blocking security, data, audit, validation, cache, job and guardrail primitives required before user stories.

**CRITICAL**: No user story implementation should begin until this phase is complete.

- [X] T016 Define all core Prisma enums for statuses, roles, scopes, flags, delivery states and audit results in backend/prisma/schema.prisma
- [X] T017 Define shared entity base fields and timestamp conventions in backend/src/modules/common/entities/base.entity.ts
- [X] T018 [P] Implement correlation-id middleware in backend/src/modules/common/middleware/correlation-id.middleware.ts
- [X] T019 [P] Implement standard error response filter with non-sensitive messages in backend/src/modules/common/filters/error-response.filter.ts
- [X] T020 [P] Implement PII masking logger utility in backend/src/modules/common/logging/pii-masker.ts
- [X] T021 [P] Implement paginated query helpers with max page size 100 in backend/src/modules/common/pagination/pagination.ts
- [X] T022 Create Prisma service and transaction helper in backend/src/modules/common/prisma/prisma.service.ts
- [X] T023 Create Redis client provider for cache, rate limits and locks in backend/src/modules/common/redis/redis.module.ts
- [X] T024 Create BullMQ queue provider for notifications, future IA, future routing and maintenance jobs in backend/src/modules/common/queues/queues.module.ts
- [X] T025 Define Zod shared schemas for ids, dates, pagination, scopes and status changes in packages/shared/validation/common.schemas.ts
- [X] T026 Define shared error codes for RBAC, consent, license, flag, routing and AI blockers in packages/shared/contracts/error-codes.ts
- [X] T027 Implement AuditLog writer interface used by all modules in backend/src/modules/audit-logs/audit-log-writer.service.ts
- [X] T028 Implement RBAC guard contract with role, permission, tenant, country, product, partner and plan scope checks in backend/src/modules/auth/guards/rbac.guard.ts
- [X] T029 Implement MFA-required guard for admin and broker sensitive actions in backend/src/modules/auth/guards/mfa-required.guard.ts
- [X] T030 Implement feature flag resolver with global-overrides-lower-scope precedence in backend/src/modules/feature-flags/feature-flag-resolver.service.ts
- [X] T031 Implement fail-closed flag cache contract and invalidation interface in backend/src/modules/feature-flags/feature-flag-cache.service.ts
- [X] T032 Implement rate limit and anti-spam guard backed by Redis in backend/src/modules/common/guards/rate-limit.guard.ts
- [X] T033 Implement no-heavy-public-sync-work interceptor marker in backend/src/modules/common/interceptors/async-boundary.interceptor.ts
- [X] T034 Define constitutional forbidden wording constants in packages/shared/contracts/content-safety.ts
- [X] T035 Create OpenAPI contract test harness loading contracts/foundation-api.openapi.yaml in backend/tests/contract/openapi-contract.spec.ts
- [X] T036 Create seed helpers for enterprise-readiness datasets in backend/tests/integration/helpers/enterprise-seed.ts
- [X] T037 Create test helper for asserting AuditLog evidence in backend/tests/integration/helpers/audit-assertions.ts
- [X] T038 Create test helper for asserting zero AI model calls in backend/tests/guardrails/helpers/ai-call-assertions.ts

**Checkpoint**: Foundation ready; user story implementation can now begin.

---

## Phase 3: User Story 1 - Initialiser le socle multi-pays et multi-produits (Priority: P1)

**Goal**: Super Admin can create countries, regulatory regimes and products while public exposure stays disabled by default.

**Independent Test**: Create one pilot country, one regulatory regime and two products; verify admin visibility, public invisibility while flags are disabled, and AuditLog evidence.

### Tests for User Story 1

- [X] T039 [P] [US1] Add unit tests for country status and public flag rules in backend/tests/unit/countries/country-activation.spec.ts
- [X] T040 [P] [US1] Add unit tests for product public, quote and manual-review flag rules in backend/tests/unit/products/product-activation.spec.ts
- [X] T041 [P] [US1] Add unit tests for regulatory regime retention override validation in backend/tests/unit/regulatory-regimes/regulatory-regime.spec.ts
- [X] T042 [P] [US1] Add integration tests for admin country and product creation with AuditLog evidence in backend/tests/integration/catalog/admin-catalog.spec.ts
- [X] T043 [P] [US1] Add integration tests proving disabled countries/products are hidden from public endpoints in backend/tests/integration/catalog/public-catalog-flags.spec.ts
- [X] T044 [P] [US1] Add contract tests for /countries, /products, /admin/countries, /admin/products and /admin/regulatory-regimes in backend/tests/contract/catalog.contract.spec.ts
- [X] T045 [P] [US1] Add admin smoke test for creating one country and two products in apps/admin/tests/catalog-foundation.spec.ts

### Implementation for User Story 1

- [X] T046 [P] [US1] Add Country, RegulatoryRegime, ProductCategory, Product and CountryProduct Prisma models in backend/prisma/schema.prisma
- [X] T047 [P] [US1] Add country and product shared DTO schemas in packages/shared/contracts/catalog.contracts.ts
- [X] T048 [P] [US1] Implement RegulatoryRegimesModule with repository and service in backend/src/modules/regulatory-regimes/regulatory-regimes.module.ts
- [X] T049 [P] [US1] Implement CountriesModule with repository and service in backend/src/modules/countries/countries.module.ts
- [X] T050 [P] [US1] Implement ProductsModule with repository and service in backend/src/modules/products/products.module.ts
- [X] T051 [US1] Implement regulatory regime admin controller with RBAC, validation and audit in backend/src/modules/regulatory-regimes/regulatory-regimes.controller.ts
- [X] T052 [US1] Implement country admin controller with scoped activation blockers in backend/src/modules/countries/admin-countries.controller.ts
- [X] T053 [US1] Implement public countries controller with fail-closed feature flag checks in backend/src/modules/countries/public-countries.controller.ts
- [X] T054 [US1] Implement product admin controller with country-product association rules in backend/src/modules/products/admin-products.controller.ts
- [X] T055 [US1] Implement public products controller with country/product flag filtering in backend/src/modules/products/public-products.controller.ts
- [X] T056 [US1] Implement cache invalidation for country and product changes in backend/src/modules/countries/catalog-cache.service.ts
- [X] T057 [US1] Add admin catalog pages for countries, regimes and products in apps/admin/app/catalog/page.tsx
- [X] T058 [US1] Add public-safe country/product read shell without comparator or quote actions in apps/public/app/catalog/page.tsx

**Checkpoint**: User Story 1 is functional, independently testable and constitutionally safe.

---

## Phase 4: User Story 2 - Gerer les partenaires courtiers et leurs agrements (Priority: P1)

**Goal**: Compliance Admin can manage partners, licenses and accreditation documents, and invalid licenses block activation/routing eligibility.

**Independent Test**: Create a partner, attach accreditation evidence, validate a scoped license, activate the partner, expire the license and verify blocked eligibility with AuditLog evidence.

### Tests for User Story 2

- [X] T059 [P] [US2] Add unit tests for partner status transitions and suspension blockers in backend/tests/unit/partners/partner-status.spec.ts
- [X] T060 [P] [US2] Add unit tests for license expiry, suspension, invalid and out-of-scope blocking in backend/tests/unit/partner-licenses/license-eligibility.spec.ts
- [X] T061 [P] [US2] Add integration tests for partner creation, document attachment and license validation in backend/tests/integration/partners/partner-compliance.spec.ts
- [X] T062 [P] [US2] Add integration tests proving invalid license blocks activation and routing eligibility in backend/tests/integration/partners/license-blocking.spec.ts
- [X] T063 [P] [US2] Add document access RBAC tests for cross-partner denial in backend/tests/integration/documents/document-access.spec.ts
- [X] T064 [P] [US2] Add contract tests for /admin/partners, /admin/partners/{partnerId}/licenses and /admin/documents/{id} in backend/tests/contract/partners.contract.spec.ts
- [X] T065 [P] [US2] Add admin smoke test for partner/license workflow in apps/admin/tests/partner-compliance.spec.ts

### Implementation for User Story 2

- [X] T066 [P] [US2] Add PartnerTenant, PartnerCountryAuthorization and PartnerProductAuthorization Prisma models in backend/prisma/schema.prisma
- [X] T067 [P] [US2] Add PartnerLicense and AccreditationDocument Prisma models in backend/prisma/schema.prisma
- [X] T068 [P] [US2] Add partner, license and accreditation shared DTO schemas in packages/shared/contracts/partner.contracts.ts
- [X] T069 [P] [US2] Implement PartnersModule with repository and activation service in backend/src/modules/partners/partners.module.ts
- [X] T070 [P] [US2] Implement PartnerLicensesModule with eligibility service in backend/src/modules/partner-licenses/partner-licenses.module.ts
- [X] T071 [P] [US2] Implement DocumentsModule with S3-compatible storage adapter in backend/src/modules/documents/documents.module.ts
- [X] T072 [US2] Implement partner admin controller with scoped activation and suspension reason checks in backend/src/modules/partners/admin-partners.controller.ts
- [X] T073 [US2] Implement partner license controller with Compliance Admin validation flow in backend/src/modules/partner-licenses/partner-licenses.controller.ts
- [X] T074 [US2] Implement accreditation document controller with RBAC-protected metadata and access references in backend/src/modules/documents/documents.controller.ts
- [X] T075 [US2] Implement license expiration calculation and compliance alert hook in backend/src/modules/partner-licenses/license-expiration.service.ts
- [X] T076 [US2] Implement partner eligibility service used by activation and routing pre-checks in backend/src/modules/partners/partner-eligibility.service.ts
- [X] T077 [US2] Add admin partner, license and document pages in apps/admin/app/partners/page.tsx

**Checkpoint**: User Story 2 works independently and blocks non-compliant partners.

---

## Phase 5: User Story 3 - Administrer les utilisateurs, roles et permissions (Priority: P1)

**Goal**: Super Admin can manage users, roles and permissions with MFA, RBAC, tenant isolation and export restrictions.

**Independent Test**: Assign all principal roles to test users and verify allowed/forbidden reads, mutations and exports across scopes.

### Tests for User Story 3

- [X] T078 [P] [US3] Add unit tests for role-permission mapping in backend/tests/unit/auth/rbac-permissions.spec.ts
- [X] T079 [P] [US3] Add unit tests for MFA-required sensitive action decisions in backend/tests/unit/auth/mfa-required.spec.ts
- [X] T080 [P] [US3] Add integration tests for login, MFA enrollment and MFA verification in backend/tests/integration/auth/auth-mfa.spec.ts
- [X] T081 [P] [US3] Add integration tests for user creation and role assignment audit logs in backend/tests/integration/users/user-rbac.spec.ts
- [X] T082 [P] [US3] Add RBAC regression tests for every constitution role in backend/tests/integration/auth/role-matrix.spec.ts
- [X] T083 [P] [US3] Add cross-partner isolation tests for broker users in backend/tests/integration/auth/tenant-isolation.spec.ts
- [X] T084 [P] [US3] Add unauthorized export refusal tests in backend/tests/integration/auth/export-denial.spec.ts
- [X] T085 [P] [US3] Add contract tests for /auth/*, /admin/users and /admin/roles endpoints in backend/tests/contract/auth-users.contract.spec.ts

### Implementation for User Story 3

- [X] T086 [P] [US3] Add User, Role, Permission, UserRole and RolePermission Prisma models in backend/prisma/schema.prisma
- [X] T087 [P] [US3] Add auth, user and RBAC shared DTO schemas in packages/shared/contracts/auth.contracts.ts
- [X] T088 [P] [US3] Define constitution role permission matrix in packages/shared/rbac/assurmatch-role-matrix.ts
- [X] T089 [P] [US3] Implement AuthModule with login, logout, current user and session services in backend/src/modules/auth/auth.module.ts
- [X] T090 [P] [US3] Implement MFA enrollment and verification service in backend/src/modules/auth/mfa.service.ts
- [X] T091 [P] [US3] Implement UsersModule with scoped user administration service in backend/src/modules/users/users.module.ts
- [X] T092 [P] [US3] Implement RolesModule with read-only system role management in backend/src/modules/users/roles.service.ts
- [X] T093 [US3] Implement auth controller for /auth/login, /auth/logout, /auth/me, /auth/mfa/enroll and /auth/mfa/verify in backend/src/modules/auth/auth.controller.ts
- [X] T094 [US3] Implement users admin controller with scoped create/update behavior in backend/src/modules/users/admin-users.controller.ts
- [X] T095 [US3] Implement role assignment endpoint with reason and AuditLog requirement in backend/src/modules/users/admin-user-roles.controller.ts
- [X] T096 [US3] Implement export denial and export audit policy service in backend/src/modules/users/export-policy.service.ts
- [X] T097 [US3] Add admin user and role management pages in apps/admin/app/users/page.tsx

**Checkpoint**: User Story 3 works independently and proves RBAC/tenant isolation.

---

## Phase 6: User Story 4 - Controler les feature flags et les desactivations rapides (Priority: P1)

**Goal**: Admins can activate, reactivate or deactivate countries, products, partners and modules quickly while mandatory compliance blockers remain enforced.

**Independent Test**: Change global, country and product flags; suspend a partner; verify affected surfaces/actions block within 2 minutes and cache inconsistencies fail closed.

### Tests for User Story 4

- [X] T098 [P] [US4] Add unit tests for feature flag scope precedence in backend/tests/unit/feature-flags/flag-precedence.spec.ts
- [X] T099 [P] [US4] Add unit tests for fail-closed cache behavior in backend/tests/unit/feature-flags/fail-closed-cache.spec.ts
- [X] T100 [P] [US4] Add integration tests for feature flag change audit and cache invalidation in backend/tests/integration/feature-flags/flag-change-audit.spec.ts
- [X] T101 [P] [US4] Add integration tests for emergency country disable blocking public reads within 2 minutes in backend/tests/integration/feature-flags/emergency-disable.spec.ts
- [X] T102 [P] [US4] Add integration tests for partner/module suspension controls in backend/tests/integration/feature-flags/partner-module-suspend.spec.ts
- [X] T103 [P] [US4] Add contract tests for /admin/feature-flags endpoints in backend/tests/contract/feature-flags.contract.spec.ts
- [X] T104 [P] [US4] Add admin smoke test for flag toggling with reason in apps/admin/tests/feature-flags.spec.ts

### Implementation for User Story 4

- [X] T105 [P] [US4] Add FeatureFlag and FeatureFlagHistory Prisma models in backend/prisma/schema.prisma
- [X] T106 [P] [US4] Add feature flag shared DTO schemas in packages/shared/contracts/feature-flag.contracts.ts
- [X] T107 [P] [US4] Implement FeatureFlagsModule with repository, history and resolver services in backend/src/modules/feature-flags/feature-flags.module.ts
- [X] T108 [US4] Implement feature flag admin controller with scoped authorization and mandatory reason in backend/src/modules/feature-flags/admin-feature-flags.controller.ts
- [X] T109 [US4] Implement global-disable-overrides-lower-scope logic in backend/src/modules/feature-flags/feature-flag-precedence.service.ts
- [X] T110 [US4] Implement Redis cache versioning and invalidation for flag changes in backend/src/modules/feature-flags/feature-flag-cache.service.ts
- [X] T111 [US4] Implement rapid disable application service for country/product/partner/module scopes in backend/src/modules/feature-flags/rapid-disable.service.ts
- [X] T112 [US4] Add admin feature flag and rapid disable UI in apps/admin/app/feature-flags/page.tsx

**Checkpoint**: User Story 4 works independently and proves fast, auditable deactivation.

---

## Phase 7: User Story 5 - Tracer les consentements, audits et documents critiques (Priority: P2)

**Goal**: Compliance Admin can consult consent evidence, sensitive-change evidence and accreditation documents for control, incident or dispute response.

**Independent Test**: Publish a consent text, simulate a ConsentRecord, modify a license, access a document and verify history, access rights and AuditLogs.

### Tests for User Story 5

- [X] T113 [P] [US5] Add unit tests for consent text immutability and versioning in backend/tests/unit/consent/consent-text-versioning.spec.ts
- [X] T114 [P] [US5] Add unit tests for 10-year default retention and regime override rules in backend/tests/unit/audit-logs/retention-policy.spec.ts
- [X] T115 [P] [US5] Add integration tests for consent text publication and ConsentRecord evidence in backend/tests/integration/consent/consent-evidence.spec.ts
- [X] T116 [P] [US5] Add integration tests for missing consent blocking simulated future lead transmission in backend/tests/integration/consent/no-consent-blocker.spec.ts
- [X] T117 [P] [US5] Add integration tests for AuditLog search filters and PII masking in backend/tests/integration/audit-logs/audit-search.spec.ts
- [X] T118 [P] [US5] Add integration tests for document access refusal without permission in backend/tests/integration/documents/document-rbac-refusal.spec.ts
- [X] T119 [P] [US5] Add contract tests for /admin/consent-texts, /admin/consent-records and /admin/audit-logs in backend/tests/contract/consent-audit.contract.spec.ts
- [X] T120 [P] [US5] Add admin smoke test for compliance evidence review in apps/admin/tests/compliance-evidence.spec.ts

### Implementation for User Story 5

- [X] T121 [P] [US5] Add ConsentText, ConsentRecord and AuditLog Prisma models with retentionUntil fields in backend/prisma/schema.prisma
- [X] T122 [P] [US5] Add consent and audit shared DTO schemas in packages/shared/contracts/compliance.contracts.ts
- [X] T123 [P] [US5] Implement ConsentModule with text publication, record search and validity services in backend/src/modules/consent/consent.module.ts
- [X] T124 [P] [US5] Implement AuditLogsModule with append-only writer and scoped search services in backend/src/modules/audit-logs/audit-logs.module.ts
- [X] T125 [US5] Implement consent texts admin controller with immutable published versions in backend/src/modules/consent/admin-consent-texts.controller.ts
- [X] T126 [US5] Implement consent records admin controller with strict scoped access in backend/src/modules/consent/admin-consent-records.controller.ts
- [X] T127 [US5] Implement audit logs admin controller with date, actor, target, scope, action and result filters in backend/src/modules/audit-logs/admin-audit-logs.controller.ts
- [X] T128 [US5] Implement consent-required future transmission guard service in backend/src/modules/consent/consent-transmission-guard.service.ts
- [X] T129 [US5] Implement retention policy service for audit, consent and accreditation evidence in backend/src/modules/audit-logs/retention-policy.service.ts
- [X] T130 [US5] Add admin compliance evidence pages for consent, audit and documents in apps/admin/app/compliance/page.tsx

**Checkpoint**: User Story 5 works independently and provides compliance evidence.

---

## Phase 8: User Story 6 - Preparer les services techniques Redis, BullMQ, notifications, IA et routage (Priority: P2)

**Goal**: Operators/admins have observable cache, queue, notification, base AI and non-transmissive routing pre-check services without activating commercial modules.

**Independent Test**: Change a flag and verify cache invalidation; queue paired WhatsApp/email notification; run non-transmissive routing pre-check; verify disabled AI makes no model call.

### Tests for User Story 6

- [X] T131 [P] [US6] Add unit tests for Redis cache refresh and invalidation contracts in backend/tests/unit/common/redis-cache.spec.ts
- [X] T132 [P] [US6] Add unit tests for BullMQ job status transitions in backend/tests/unit/common/queue-job-record.spec.ts
- [X] T133 [P] [US6] Add unit tests for notification paired WhatsApp/email delivery requirement in backend/tests/unit/notifications/paired-delivery.spec.ts
- [X] T134 [P] [US6] Add unit tests for routing pre-check mandatory blockers in backend/tests/unit/routing/routing-precheck.spec.ts
- [X] T135 [P] [US6] Add AI guardrail tests proving disabled AI makes zero model calls in backend/tests/guardrails/ai/disabled-ai.spec.ts
- [X] T136 [P] [US6] Add integration tests for notification queue visibility within 5 minutes in backend/tests/integration/notifications/notification-jobs.spec.ts
- [X] T137 [P] [US6] Add integration tests for routing pre-check not notifying brokers or transmitting leads in backend/tests/integration/routing/non-transmissive-precheck.spec.ts
- [X] T138 [P] [US6] Add contract tests for /admin/notifications, /admin/routing/precheck, /admin/ai/modules and /admin/system/health in backend/tests/contract/ops-ai-routing.contract.spec.ts
- [X] T139 [P] [US6] Add admin smoke test for notification, routing pre-check and AI module pages in apps/admin/tests/ops-foundation.spec.ts

### Implementation for User Story 6

- [X] T140 [P] [US6] Add Notification, QueueJobRecord, AIModuleConfig, AIInteraction, RoutingPrecheck and EnvironmentSetting Prisma models in backend/prisma/schema.prisma
- [X] T141 [P] [US6] Add notification, routing, AI and health shared DTO schemas in packages/shared/contracts/ops.contracts.ts
- [X] T142 [P] [US6] Implement NotificationsModule with paired WhatsApp/email service in backend/src/modules/notifications/notifications.module.ts
- [X] T143 [P] [US6] Implement notification BullMQ processor and delivery status persistence in backend/src/jobs/notifications/notification.processor.ts
- [X] T144 [P] [US6] Implement RoutingModule with deterministic non-transmissive pre-check service in backend/src/modules/routing/routing.module.ts
- [X] T145 [P] [US6] Implement AIModule with module registry, disabled-scope checks and audit metadata hooks in backend/src/modules/ai/ai.module.ts
- [X] T146 [P] [US6] Implement SystemHealthModule with database, Redis, queue, document, auth and feature flag checks in backend/src/modules/admin/system-health.module.ts
- [X] T147 [US6] Implement notifications admin controller and test-notification endpoint in backend/src/modules/notifications/admin-notifications.controller.ts
- [X] T148 [US6] Implement routing pre-check admin controller in backend/src/modules/routing/admin-routing-precheck.controller.ts
- [X] T149 [US6] Implement AI modules admin controller without advanced AI activation in backend/src/modules/ai/admin-ai-modules.controller.ts
- [X] T150 [US6] Implement system health admin controller in backend/src/modules/admin/system-health.controller.ts
- [X] T151 [US6] Add admin operations page for notifications, routing pre-check, AI modules and health in apps/admin/app/operations/page.tsx

**Checkpoint**: User Story 6 works independently and proves operational readiness.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validate performance, documentation, security hardening and constitutional readiness across all completed user stories.

- [X] T152 [P] Add enterprise acceptance seed script for 50 countries, 500 products, 5,000 partners and 100,000 users in backend/tests/integration/helpers/enterprise-acceptance-seed.ts
- [X] T153 [P] Add performance smoke tests for public catalog p95 under 1 second in backend/tests/integration/performance/public-catalog-slo.spec.ts
- [X] T154 [P] Add admin list/filter performance smoke tests p95 under 2 seconds in backend/tests/integration/performance/admin-list-slo.spec.ts
- [X] T155 [P] Add forbidden wording regression tests for public/admin/broker text in backend/tests/guardrails/content/forbidden-wording.spec.ts
- [X] T156 [P] Add documentation for local setup and validation commands in docs/development/socle-plateforme.md
- [X] T157 [P] Update quickstart implementation notes after scripts exist in specs/001-socle-plateforme/quickstart.md
- [X] T158 Run full lint, typecheck, unit, integration, contract, guardrail and Playwright suites from package.json
- [X] T159 Re-run Constitution Check evidence and record pass/fail notes in specs/001-socle-plateforme/plan.md
- [X] T160 Review all logs, errors and AuditLog contexts for PII masking in backend/src/modules/common/logging/pii-masker.ts
- [X] T161 Review public/commercial flags remain disabled by default in backend/src/modules/feature-flags/default-flags.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) depends on Setup and blocks all user stories.
- User Stories 1-4 are P1 and can start after Foundational; sequence them as US1, US2, US3, US4 for lowest schema conflict risk.
- User Stories 5-6 are P2 and can start after Foundational; US5 benefits from US2 document models, and US6 benefits from US4 flag services.
- Polish (Phase 9) depends on all selected user stories.

### User Story Dependency Graph

```text
Setup -> Foundational -> US1 -> US2 -> US5 -> Polish
                       -> US3 --------^
                       -> US4 -> US6 -^
```

### Parallel Execution Examples

```text
US1 parallel start:
  T039 country tests, T040 product tests, T041 regime tests, T046 Prisma models, T047 DTO schemas

US2 parallel start:
  T059 partner tests, T060 license tests, T066 partner models, T067 license/document models, T068 DTO schemas

US3 parallel start:
  T078 RBAC tests, T079 MFA tests, T086 auth/user models, T087 DTO schemas, T088 role matrix

US4 parallel start:
  T098 precedence tests, T099 fail-closed tests, T105 flag models, T106 DTO schemas, T107 module service

US5 parallel start:
  T113 consent version tests, T114 retention tests, T121 evidence models, T122 DTO schemas, T123 consent module

US6 parallel start:
  T131 Redis tests, T132 queue tests, T133 notification tests, T140 ops models, T141 DTO schemas
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundational controls.
3. Complete Phase 3 User Story 1.
4. Stop and validate country/regime/product setup, disabled public exposure and AuditLog evidence.

### Incremental Delivery

1. Deliver US1 for catalog foundation.
2. Deliver US2 for partner/license compliance.
3. Deliver US3 for auth/RBAC/user administration.
4. Deliver US4 for flags and rapid disable.
5. Deliver US5 for consent/audit/document evidence.
6. Deliver US6 for operational Redis/BullMQ/notifications/AI/routing readiness.

### Team Parallel Strategy

After Phase 2, assign one owner per user story and coordinate shared files:

- Prisma schema owner reviews all model additions in backend/prisma/schema.prisma.
- Shared contracts owner reviews packages/shared/contracts/*.ts.
- Admin UI owner sequences apps/admin/app/* routes to avoid layout conflicts.
- Test owner keeps constitutional regression tests green after each story.

---

## Task Summary

- Total tasks: 161
- Setup tasks: 15
- Foundational tasks: 23
- US1 tasks: 20
- US2 tasks: 19
- US3 tasks: 20
- US4 tasks: 15
- US5 tasks: 18
- US6 tasks: 21
- Polish tasks: 10
- Suggested MVP scope: Phase 1, Phase 2 and User Story 1.

## Notes

- Every implementation story includes tests first because the constitution requires tests for critical modules and blockers.
- `[P]` indicates tasks that touch different files and can run in parallel after their phase prerequisites.
- Commercial comparator, full quote request, Starter portal, Pro CRM, billing, payments, issuance, claims, advanced API, advanced webhooks, advanced AI and advanced routing remain out of active scope.
