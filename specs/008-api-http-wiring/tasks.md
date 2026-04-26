# Tasks: API HTTP Wiring AssurMatch

**Input**: Design documents from `/specs/008-api-http-wiring/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/runtime-http-wiring-contract.md, quickstart.md
**Continuous Workflow**: The user explicitly requested automatic continuation from tasks to implementation. Stop only for constitutional conflict, major ambiguity, compliance/security/data leakage risk, forbidden activation, uncovered product decision or blocking validation failure. Do not commit automatically.
**Tests**: Required. HTTP e2e, controller metadata, contract, tenant/RBAC, consent, durable audit, feature flags, frontend separation and Playwright runtime/skip-mode tests are in scope.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Confirm feature context and prerequisites from specs/008-api-http-wiring/plan.md and specs/008-api-http-wiring/contracts/runtime-http-wiring-contract.md
- [x] T002 Verify no pre-existing specs/008-api-http-wiring/tasks.md conflict and create this executable task list
- [x] T003 [P] Verify repository ignore/config setup for Node/TypeScript artifacts in .gitignore and eslint config files
- [x] T004 [P] Inventory existing runtime HTTP routes and domain controller files in backend/src/runtime/ and backend/src/modules/

## Phase 2: Foundational (Blocks User Stories)

- [x] T005 Add shared HTTP actor extraction helper/decorator support in backend/src/modules/common/http/
- [x] T006 Add or update HTTP wiring metadata tests for AppModule/module/controller ownership in backend/tests/integration/runtime-route-inventory.spec.ts
- [x] T007 Add or update contract tests for runtime route ownership and forbidden regulated routes in backend/tests/contract/runtime-api.contract.spec.ts
- [x] T008 Create a NestJS HTTP wiring module that declares decorated domain controllers in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T009 Update backend/src/app.module.ts to import the HTTP wiring module and remove RuntimeHttpController as the P1 route owner
- [x] T010 Ensure protected routes use AuthRequiredHttpGuard and MfaRequiredHttpGuard consistently through decorated controllers
- [x] T011 Ensure shared validation/error mapping remains centralized through backend/src/modules/common/http/zod-validation.ts and backend/src/modules/common/filters/error-response.filter.ts

## Phase 3: User Story 1 - Initialiser une API NestJS modulaire (Priority: P1)

**Goal**: AppModule initializes real NestJS modules/controllers instead of relying on RuntimeHttpController as the route owner.
**Independent Test**: Boot AppModule and verify P1 routes are exposed through decorated controllers while RuntimeHttpController is not registered.

- [x] T012 [P] [US1] Add controller metadata assertions in backend/tests/integration/runtime-route-inventory.spec.ts
- [x] T013 [P] [US1] Add AppModule import/ownership assertions in backend/tests/contract/runtime-api.contract.spec.ts
- [x] T014 [US1] Implement AuthController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T015 [US1] Implement PublicCountriesController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T016 [US1] Implement PublicProductsController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T017 [US1] Implement PublicOffersController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T018 [US1] Implement PublicQuoteRequestsController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T019 [US1] Update backend/tests/integration/runtime-http-test-utils.ts to resolve runtime from the new module graph

## Phase 4: User Story 2 - Soumettre une demande de devis publique reelle (Priority: P1)

**Goal**: Web Publique Client submits a real quote request and shows publicReference or explicit errors.
**Independent Test**: Submit through API/frontend path and verify real POST /quote-requests behavior.

- [x] T020 [P] [US2] Add public quote API client tests or assertions in apps/public/tests/public-quote-form.spec.ts
- [x] T021 [P] [US2] Add HTTP no-consent and publicReference assertions in backend/tests/integration/public-quote-runtime-http.spec.ts
- [x] T022 [US2] Implement submitPublicQuoteRequest client helper in apps/public/app/lib/public-api.ts
- [x] T023 [US2] Wire apps/public/app/components/quote-form.tsx to submit POST /quote-requests and render success/error states
- [x] T024 [US2] Pass country/product route params into apps/public/app/countries/[countryCode]/products/[productKey]/quote/page.tsx
- [x] T025 [US2] Replace silent public API fallbacks with explicit success/empty/error states in apps/public/app/lib/public-api.ts

## Phase 5: User Story 3 - Proteger les parcours broker par acteur fiable (Priority: P1)

**Goal**: Broker routes use decorated protected controllers, trusted ActorContext, tenant isolation, Starter CRM denial, CRM flag denial and read-only mutation refusal.
**Independent Test**: HTTP tests call broker routes with missing/valid/invalid actors and verify denial/success.

- [x] T026 [P] [US3] Add or update broker protected-route HTTP assertions in backend/tests/integration/broker-starter-runtime-http.spec.ts
- [x] T027 [P] [US3] Add or update CRM flag and Starter denial assertions in backend/tests/integration/broker-crm-runtime-http.spec.ts
- [x] T028 [US3] Implement BrokerStarterController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T029 [US3] Implement BrokerCrmController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T030 [US3] Ensure ActorContext is consumed from guard-attached request state in backend/src/modules/http-wiring/runtime-http-wiring.module.ts

## Phase 6: User Story 4 - Administrer flags, audit et sante via API durable (Priority: P1)

**Goal**: Admin core routes are decorated, protected and read durable flag/audit/health state.
**Independent Test**: Admin HTTP tests verify auth/RBAC, durable audit read and feature flag mutation behavior.

- [x] T031 [P] [US4] Add or update admin feature flag/audit HTTP tests in backend/tests/integration/runtime-audit-http.spec.ts
- [x] T032 [P] [US4] Add feature flag fail-closed contract assertions in backend/tests/contract/feature-flags.contract.spec.ts
- [x] T033 [US4] Implement AdminFeatureFlagsController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T034 [US4] Implement AdminAuditLogsController decorated routes in backend/src/modules/http-wiring/runtime-http-wiring.module.ts
- [x] T035 [US4] Implement AdminHealthController decorated route in backend/src/modules/http-wiring/runtime-http-wiring.module.ts

## Phase 7: User Story 5 - Remplacer les tests structurels par des validations runtime (Priority: P2)

**Goal**: Runtime HTTP and Playwright validations become the primary acceptance proof.
**Independent Test**: Tests use AppModule/real navigation or explicitly skip when e2e URLs are missing.

- [x] T036 [P] [US5] Add Playwright runtime URL skip-mode documentation/assertions in apps/public/tests/public-runtime-smoke.spec.ts
- [x] T037 [P] [US5] Add back-office API fallback assertions in apps/broker/tests/auth-session.spec.ts and apps/admin/tests/auth-session.spec.ts
- [x] T038 [US5] Replace silent broker API fallbacks with explicit states in apps/broker/app/lib/broker-api.ts
- [x] T039 [US5] Verify admin API client already exposes explicit protected error states in apps/admin/app/lib/admin-api.ts

## Final Phase: Polish & Cross-Cutting Validation

- [x] T040 [P] Update quickstart/runtime notes if implementation changes e2e commands in specs/008-api-http-wiring/quickstart.md
- [x] T041 [P] Run npm run typecheck
- [x] T042 [P] Run npm run lint
- [x] T043 Run npm run test
- [x] T044 Run npm run test:web
- [x] T045 Run npm run build
- [x] T046 Run npx prisma validate --schema backend/prisma/schema.prisma
- [x] T047 Run migration/base-fresh validation or equivalent Prisma migration validation
- [x] T048 Run npm audit --audit-level=high
- [x] T049 Run git diff --check
- [x] T050 Check off completed tasks in specs/008-api-http-wiring/tasks.md and prepare final report

## Dependencies & Execution Order

- Phase 1 has no dependencies.
- Phase 2 blocks all user stories.
- US1 should complete before US2-US4 because it establishes route ownership.
- US2, US3 and US4 can proceed independently after US1 and Phase 2.
- US5 depends on the frontend/API changes from US2-US4.
- Final validation depends on all implemented tasks.

## Parallel Opportunities

- T003 and T004 can run in parallel.
- T006 and T007 can run in parallel.
- Tests marked [P] in each user story can be edited independently.
- Public frontend work (US2) and broker/admin tests (US3/US4) can proceed in parallel after the HTTP wiring module exists.

## Implementation Strategy

1. Establish a thin NestJS HTTP wiring module around the existing runtime without adding business behavior.
2. Move P1 route ownership out of RuntimeHttpController.
3. Wire public quote form to the existing `POST /quote-requests` behavior.
4. Keep protected routes guarded and ActorContext centralized.
5. Replace misleading frontend fallbacks with explicit states.
6. Run all required validations and report residual risks.


