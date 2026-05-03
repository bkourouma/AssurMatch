# Feature Specification: Broker Back-office UX Polish

**Feature Branch**: `025-broker-backoffice-ux-polish`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Creer et livrer completement la feature 025-broker-backoffice-ux-polish pour transformer l'espace courtier actuel en interface professionnelle, claire et exploitable pour les courtiers Starter, Pro et Enterprise."
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes - user explicitly approved the standard feature workflow and no `[NEEDS CLARIFICATION]` markers remain

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: This feature improves authenticated broker usability only. It does not introduce direct sale, direct subscription, premium collection, contract issuance, attestation issuance, claims, insurer API, binding advice or regulated activation.
- **Impacted application(s)**: Back-office Partenaires/Plateforme only. Shared UI packages may be touched only if required by existing back-office conventions. Web Publique Client and Backend API are out of scope except for non-invasive guardrails or tests proving separation.
- **Affected scopes**: Broker portal, broker dashboard, Starter leads, Pro/Enterprise CRM, lead detail, broker account, broker team if already available, broker notifications if already available, roles Broker Owner Starter, Broker Owner Pro, Broker Manager, Broker Agent and Broker Read-only.
- **Frontend separation**: Public visitor journeys remain outside the broker app. Broker routes, layouts, navigation and auth states must not be loaded from the public application. Admin-only routes must not appear in broker navigation.
- **Required feature flags**: `starter_portal_enabled`, `broker_dashboard_enabled` and `broker_crm_enabled` govern visibility. Existing plan and partner scope rules remain authoritative. No production feature flag defaults may change.
- **Consent and transmission**: Lead transmission behavior is unchanged. If a lead is visible in the broker portal, it is treated as an already routed broker resource and must not imply new transmission without existing ConsentRecord controls.
- **Partner license controls**: Existing license and partner activation constraints remain unchanged. UI must not show actions that bypass inactive partner, unauthorized scope or expired/suspended/invalid license rules.
- **Audit and data history**: No new sensitive business action is introduced. Existing audit/history surfaces remain visible where already available; UI must not hide important lead status, routing or update history if the current broker screen already exposes it.
- **Security and RBAC**: Every broker view must remain authenticated and tenant-scoped. A broker must not see another tenant's leads, CRM entries, team members or notifications. MFA, RBAC, export limits and PII masking rules remain unchanged.
- **Routing impact**: No routing logic changes. Non-routable, blocked, disputed, rejected or unavailable lead states must be displayed clearly when already provided by the system.
- **AI impact**: N/A - this UX polish does not add AI features, prompts, scoring, summaries, recommendations or assistant behavior.
- **UX/content restrictions**: The interface must avoid the seven prohibited direct-sale or regulated-promise phrases named in the feature request. Unavailable modules must be labelled clearly without promising unimplemented actions.
- **Workflow continuity**: This is a standard back-office UX feature explicitly approved by the user for continuous `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` -> validations, stopping only for constitutional, security, data leakage, activation, product ambiguity, blocking validation or non-trivial merge conflict risks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Broker navigates a professional shell (Priority: P1)

A broker using the authenticated back-office needs a clear sidebar, header and page structure to reach dashboard, leads, CRM, team, account, notifications and help/settings where available without seeing admin or public routes.

**Why this priority**: Navigation is the foundation for every broker workflow and is the main visible weakness of a scaffolded portal.

**Independent Test**: Authenticate as a broker role and verify the broker shell exposes only broker-appropriate destinations, preserves tenant context and remains usable on desktop and mobile widths.

**Acceptance Scenarios**:

1. **Given** an authenticated broker with access to the broker portal, **When** they open the back-office, **Then** they see a coherent broker shell with sidebar/header navigation for available broker areas and no admin-only or public visitor routes.
2. **Given** an unauthenticated visitor or a non-broker user, **When** they attempt to access broker functionality, **Then** access is denied or redirected according to existing auth policy without exposing broker data.
3. **Given** a narrow viewport, **When** the broker opens navigation, **Then** the primary broker destinations remain reachable without overlapping text or broken layout.

---

### User Story 2 - Starter broker manages received leads without CRM upsell confusion (Priority: P1)

A Starter broker needs a focused leads experience with clear list, statuses, detail, empty/loading/error states and an honest message that the full CRM is available with Pro.

**Why this priority**: Starter is a constitutional baseline and must not see Pro CRM as usable or included.

**Independent Test**: Authenticate as a Starter broker and confirm leads and lead detail are usable while CRM-only capabilities are unavailable and clearly labelled.

**Acceptance Scenarios**:

1. **Given** a Starter broker with received leads, **When** they open Leads and a lead detail, **Then** they can scan lead priority/status/history and see only actions already available to Starter.
2. **Given** a Starter broker, **When** they open CRM, **Then** they do not see Kanban, advanced pipeline, team assignment, tasks, reminders or Pro CRM as available; they see the message "Le CRM complet est disponible avec le plan Pro."
3. **Given** a Starter broker with no leads or a loading/error state, **When** they open the Leads page, **Then** the page shows a clear state that does not promise a non-implemented action.

---

### User Story 3 - Pro and Enterprise brokers use CRM when enabled (Priority: P1)

A Pro or Enterprise broker needs an improved CRM workspace when `broker_crm_enabled` is true, with clear pipeline/list information, statuses, lead detail access, and module availability cues.

**Why this priority**: CRM is the key value difference for Pro/Enterprise and must be useful without changing business logic.

**Independent Test**: Authenticate as Pro and Enterprise brokers with CRM enabled and disabled, then verify the CRM is visible only when allowed and displays clean operational states.

**Acceptance Scenarios**:

1. **Given** a Pro or Enterprise broker with `broker_crm_enabled` true, **When** they open CRM, **Then** they see a professional CRM surface with available lead/opportunity information, clear statuses and no unavailable actions presented as active.
2. **Given** a Pro or Enterprise broker with `broker_crm_enabled` false, **When** they open CRM, **Then** the CRM is blocked or marked unavailable with a clear explanation and no sensitive feature flag is changed.
3. **Given** a broker user from another tenant, **When** they attempt to access a CRM item or lead detail, **Then** the item is not exposed.

---

### User Story 4 - Broker reviews account, team and notifications safely (Priority: P2)

A broker needs account, team and notifications pages to feel consistent with the polished shell when those areas already exist, with clear unavailable or empty states otherwise.

**Why this priority**: These secondary areas support daily operation but must not introduce new business behavior.

**Independent Test**: Open account, team and notification destinations for roles that should and should not access them, and verify consistent states and RBAC-safe visibility.

**Acceptance Scenarios**:

1. **Given** account, team or notifications are already available for the broker, **When** the broker opens the page, **Then** the page uses the same polished information hierarchy, spacing and state patterns as the rest of the broker shell.
2. **Given** a module is not available for the broker's plan, role or current product state, **When** it appears in navigation or page content, **Then** it is clearly indicated as unavailable or omitted without offering a dead-end primary action.
3. **Given** a read-only broker role, **When** they open account, team or notifications, **Then** they do not see mutation affordances that they cannot use.

---

### User Story 5 - Product and engineering validate safety guardrails (Priority: P2)

Product and engineering stakeholders need confidence that the UX polish did not alter regulated behavior, mix surfaces, expose cross-tenant data or introduce forbidden wording.

**Why this priority**: Visual polish in a regulated back-office is not complete unless constitutional constraints are demonstrably preserved.

**Independent Test**: Run local validations, source guardrails and browser smoke checks for broker/admin/public separation, forbidden copy and tenant-safe broker routes.

**Acceptance Scenarios**:

1. **Given** the implementation diff, **When** it is reviewed, **Then** it contains no Prisma migration, no backend business logic change, no production feature flag default change and no secret.
2. **Given** public, admin and broker route surfaces, **When** guardrail tests run, **Then** public routes do not load broker/admin UI, broker routes do not expose admin navigation and admin routes are not added to broker navigation.
3. **Given** the completed UI, **When** forbidden text scanning runs, **Then** none of the prohibited regulatory phrases appear.

### Edge Cases

- If the relevant country is disabled or waitlist-only, existing routing and visibility controls remain authoritative; the broker UI may display an unavailable or no-data state but must not re-enable public or broker actions.
- If the relevant product is disabled, quote-disabled or requires manual review, existing product state must be visible where provided and no new action may bypass it.
- If consent is missing, expired or not scoped to the receiving broker, no new lead transmission or broker visibility rule is introduced by this feature.
- If the broker is inactive, unauthorized for the country/product or over quota, the UI must not present active lead/CRM actions that imply eligibility.
- If the broker license is expired, suspended or invalid, the UI must reflect blocked/unavailable operation where existing data permits and must not allow a bypass.
- If an offer is expired, sponsored or only indicative, the broker UI must not turn it into a firm or accepted insurance promise.
- If AI is disabled globally, by country, by product, by partner or by plan, this feature remains unaffected because it adds no AI functionality.
- If a user lacks permission to view, mutate or export the resource, existing RBAC must block access and the UI must not expose sensitive data.
- If a public route tries to load partner/admin authentication, privileges or back-office UI, guardrails must fail.
- If an unauthenticated or unauthorized visitor attempts to reach broker functionality, existing authentication must redirect or deny access without data exposure.
- If public input is spammy, rate-limited, malformed or duplicate, this feature has no public input path and must not change existing behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a polished broker shell with sidebar, header, active navigation state and responsive behavior for authenticated broker journeys.
- **FR-002**: System MUST expose broker navigation for Dashboard, Leads, CRM, Team, Account, Notifications if available, and Help or Settings when relevant.
- **FR-003**: System MUST keep broker navigation free of admin-only routes and public visitor routes.
- **FR-004**: System MUST improve the broker dashboard with clear cards, status badges, operational summaries and loading, empty and error states using existing broker data.
- **FR-005**: System MUST improve Starter lead list and lead detail readability with professional spacing, tables/lists, badges and state handling.
- **FR-006**: System MUST ensure Starter brokers do not see Pro CRM capabilities as available.
- **FR-007**: System MUST show Starter brokers the exact message "Le CRM complet est disponible avec le plan Pro." when the full CRM is unavailable because of plan.
- **FR-008**: System MUST show Pro and Enterprise CRM only when the broker's plan allows it and `broker_crm_enabled` is true.
- **FR-009**: System MUST clearly indicate modules unavailable because of plan, role, feature flag or current system state.
- **FR-010**: System MUST avoid buttons or primary actions that promise behavior not implemented in the current product.
- **FR-011**: System MUST improve broker account surfaces using the same shell and state patterns without changing account business rules.
- **FR-012**: System MUST improve broker team surfaces only if they already exist, preserving existing permissions and mutation rules.
- **FR-013**: System MUST improve broker notifications only if they already exist, preserving existing notification behavior and delivery rules.
- **FR-014**: System MUST provide loading, empty and error states for broker dashboard, leads, CRM, lead detail, account, team and notifications where those surfaces exist.
- **FR-015**: System MUST maintain tenant isolation for all broker-visible leads, CRM records, team data and notifications.
- **FR-016**: System MUST preserve existing RBAC, MFA, authentication redirects and route protections.
- **FR-017**: System MUST preserve existing routing, consent, partner license, feature flag and business logic behavior.
- **FR-018**: System MUST not introduce Prisma schema changes, migrations, payment, subscription, policy issuance, attestation, signature, claims, insurer API or advanced AI behavior.
- **FR-019**: System MUST not introduce the prohibited direct-sale or regulated-promise phrases named in the feature request.
- **FR-020**: System MUST include automated validations or guardrails for broker/public/admin separation, prohibited wording and Starter/CRM gating.
- **FR-021**: System MUST support quick local UX review of dashboard, leads, CRM, lead detail, account, team if available, notifications if available, responsive layout, logout and unauthenticated redirect when the local environment can run.
- **FR-022**: System MUST keep the scope limited to feature 025 changes and avoid unrelated refactors.

### Key Entities *(include if feature involves data)*

- **Broker User**: Authenticated back-office user with role, plan and tenant scope.
- **Broker Plan**: Starter, Pro or Enterprise plan determining CRM availability and module messaging.
- **Lead**: Broker-visible routed demand with stable identifier, status, history and detail display.
- **CRM Item**: Existing Pro/Enterprise commercial workspace item when CRM is enabled.
- **Team Member**: Existing broker team user visible only where the team module and role permissions already allow it.
- **Notification**: Existing broker notification item if the notifications surface is already available.
- **FeatureFlag**: Existing global/partner/plan flags controlling dashboard, Starter portal and CRM visibility.
- **Route Surface**: Public, broker and admin route group boundaries that must remain separated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of expected broker destinations that exist today are reachable from the broker shell within two navigation actions on desktop and mobile widths.
- **SC-002**: A Starter broker sees no active full-CRM capability and sees the required Pro availability message in every CRM entry point.
- **SC-003**: A Pro or Enterprise broker sees CRM as available only when `broker_crm_enabled` is true for their allowed scope.
- **SC-004**: 0 broker UI routes expose admin-only navigation, public visitor layouts or cross-tenant broker data in automated guardrails and technical review.
- **SC-005**: 0 prohibited regulatory phrases are introduced in changed files.
- **SC-006**: 100% of improved broker pages have loading, empty or error handling appropriate to the data surface.
- **SC-007**: Manual or automated responsive review confirms no overlapping core navigation or primary page text at representative desktop and mobile widths.
- **SC-008**: Required local validation commands pass before commit or any exception is documented as a blocker.

## Assumptions

- The feature impacts the Back-office Partenaires/Plateforme and may reuse shared UI primitives, but does not change Web Publique Client UX.
- Broker data sources, route protections, auth, RBAC, feature flags and business rules already exist and remain authoritative.
- Team and notifications are polished only when their broker routes or modules already exist; otherwise navigation omits or clearly marks them unavailable.
- Lead and CRM actions remain limited to actions already implemented by previous features.
- Local UX review may use only local/dev accounts and must not commit credentials or activation secrets.
- This feature is explicitly approved for continuous Spec Kit execution and for the requested commit, PR, merge and cleanup sequence if all validations and mandatory checks allow it.
