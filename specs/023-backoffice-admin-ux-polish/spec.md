# Feature Specification: Back-office Admin UX Polish

**Feature Branch**: `023-backoffice-admin-ux-polish`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Créer la spécification UX/UI 023-backoffice-admin-ux-polish pour AssurMatch"
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes - standard UX/UI feature explicitly approved by the user, with no `[NEEDS CLARIFICATION]` markers and no production activation

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: This feature improves the authenticated administration experience only. It MUST NOT create direct sale, subscription, premium collection, contract issuance, attestation issuance, claim handling, electronic signature, insurer API activation or binding personalized advice.
- **Impacted application(s)**: Back-office Partenaires/Plateforme, limited to the admin surface. Backend API is not in scope except for minor read-compatible adaptation if an existing admin page already depends on it. Web Publique Client is not impacted. Shared packages are impacted only if strictly necessary for reusable UI primitives without public/admin route mixing.
- **Affected scopes**: Platform admin users and existing admin pages: Dashboard, Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations, Platform dashboard, plus Audit logs and Paramètres only if already available.
- **Frontend separation**: Public visitor journeys and authenticated admin journeys MUST remain applicatively separated. The Web Publique Client MUST NOT load admin routes, layouts, privileges, authentication state or navigation.
- **Required feature flags**: This feature MUST NOT activate any feature flag. Sensitive flags displayed in the UI, including `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` and `ai_recommendation_enabled`, MUST appear disabled/read-only when disabled.
- **Consent and transmission**: N/A for lead transmission because this feature is UI polish for admin pages and does not transmit leads. Existing ConsentRecord requirements remain unchanged.
- **Partner license controls**: Existing license status and expiration controls remain unchanged. If licenses are shown, expired or soon-expiring licenses MUST be visually distinguishable without changing blocking rules.
- **Audit and data history**: Existing AuditLog and history behavior remains unchanged. The UI MAY display audit or compliance signals already exposed by the system but MUST NOT invent unrecorded audit actions.
- **Security and RBAC**: Existing authentication, MFA, RBAC and tenant/platform boundaries remain authoritative. The polish MUST NOT expose admin UI to public users or broker-only users and MUST NOT add unsafe actions or exports.
- **Routing impact**: No routing logic changes. Existing non-routed, refused, transmitted and blocked lead states may be displayed as KPI/status values only.
- **AI impact**: N/A. No AI feature, AI recommendation, prompt, model call or AI decision support is introduced or activated.
- **UX/content restrictions**: UI text MUST avoid forbidden or equivalent sales/subscription promises, including "Souscrire maintenant", "Contrat validé", "Garantie acceptée" and "Acheter maintenant". Admin wording MUST describe operational monitoring, configuration, compliance and routing state.
- **Workflow continuity**: This is a standard UI/UX feature with explicit user approval to continue through `/speckit.plan`, `/speckit.tasks`, `/speckit.implement` and final validations. Stop conditions remain constitutional conflict, security/compliance/data leakage risk, business logic change, production activation or blocking validation failure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate the Admin Shell (Priority: P1)

An authenticated platform administrator opens the admin back-office and immediately sees a professional application shell with a sidebar, header, content area, current user context when available and logout access.

**Why this priority**: The shell is the foundation for every admin workflow and replaces the current raw scaffold.

**Independent Test**: Sign in as an admin and open the back-office root. Verify that the shell, sidebar navigation, header and logout control are visible without relying on any individual page's data.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** they open `http://localhost:3602`, **Then** they see a structured admin layout with sidebar, header and main content.
2. **Given** an authenticated admin, **When** they inspect the sidebar, **Then** links for Dashboard, Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité and Opérations are visible.
3. **Given** an authenticated admin using keyboard navigation, **When** they tab through links and buttons, **Then** focus is visible and the navigation order is understandable.
4. **Given** a non-authenticated visitor or non-admin user, **When** they attempt to reach admin functionality, **Then** existing authentication and authorization behavior prevents access.

---

### User Story 2 - Understand Platform Health from Dashboard KPIs (Priority: P1)

An authenticated platform administrator views a clear dashboard with KPI cards and compliance alerts that summarize operational status without reading raw JSON or unstructured text.

**Why this priority**: The dashboard is the primary admin landing page and must make the platform operationally understandable.

**Independent Test**: Open the admin dashboard with available dashboard data, with no data and with an unavailable API. Verify KPI, empty and error states.

**Acceptance Scenarios**:

1. **Given** dashboard data is available, **When** an admin opens the dashboard, **Then** KPI cards show leads received, leads transmitted, leads refused, non-routed leads, expired licenses, licenses expiring within 30 days, active countries, active products, active partners and expired offers when available.
2. **Given** no dashboard data is available, **When** an admin opens the dashboard, **Then** the UI shows a clean empty state instead of broken or raw output.
3. **Given** the API is unavailable or returns an error, **When** an admin opens the dashboard, **Then** the UI shows a clear error state and does not expose sensitive implementation details.
4. **Given** sensitive feature flags are disabled, **When** they appear on the dashboard or feature flag summary, **Then** they are clearly disabled/read-only and are not activated by the UI.

---

### User Story 3 - Work with Structured Admin Pages (Priority: P2)

An authenticated platform administrator opens existing admin pages and sees consistent titles, descriptions, containers, tables or lists, visible safe actions and loading/empty/error states.

**Why this priority**: Existing admin areas need to become usable and coherent, not only the landing dashboard.

**Independent Test**: Visit Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard pages. Verify consistent page structure and state handling.

**Acceptance Scenarios**:

1. **Given** an existing admin page has data, **When** an admin opens it, **Then** the page presents a clear title, short description, structured content area and clean table or list.
2. **Given** an existing admin page has no data, **When** an admin opens it, **Then** the page shows a meaningful empty state.
3. **Given** an existing admin page is loading or encounters an error, **When** an admin opens it, **Then** the page shows an appropriate loading or error state.
4. **Given** an action is not implemented or is dangerous, **When** an admin views the page, **Then** the UI does not present a misleading fake button or unsafe action.

---

### User Story 4 - Use the Admin UI on Different Screen Sizes (Priority: P3)

An authenticated administrator can use the back-office on desktop, tablet and a simple mobile layout without the navigation or content becoming unreadable.

**Why this priority**: Admin work is primarily desktop/tablet, but the interface must not collapse into unusable raw content on smaller screens.

**Independent Test**: Open the admin shell and dashboard at desktop, tablet and mobile viewport widths. Verify readable navigation, content and focus states.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **When** an admin opens the back-office, **Then** the sidebar and content area are comfortably readable.
2. **Given** a tablet viewport, **When** an admin opens the back-office, **Then** navigation and content remain usable without horizontal overflow.
3. **Given** a mobile viewport, **When** an admin opens the back-office, **Then** navigation is simplified or collapsed and the main content remains readable.

### Edge Cases

- If a country is disabled or waitlist-only, the UI may display that status but MUST NOT change activation or routing behavior.
- If a product is disabled, quote-disabled or requires manual review, the UI may display that status but MUST NOT change product flags.
- If consent is missing, expired or not scoped, existing lead transmission rules remain unchanged; the UI MUST NOT imply a lead can be transmitted.
- If a broker is inactive, unauthorized for a country/product or over quota, the UI may display a status but MUST NOT override routing eligibility.
- If a broker license is expired, suspended or invalid, the UI must present a clear compliance warning when license data is already available.
- If an offer is expired, sponsored or indicative, the UI must not present it as a confirmed contract or accepted guarantee.
- If AI is disabled globally, by country, by product, by partner or by plan, the UI MUST NOT introduce AI recommendations or call-to-action text that implies AI activation.
- If a user lacks permission to view, mutate or export a resource, existing access controls remain in force and the UI must not expose privileged controls.
- If a public route tries to load partner/admin authentication, privileges or back-office UI, tests must fail and the issue must be corrected before completion.
- If an unauthenticated or unauthorized visitor attempts to reach back-office functionality, existing login or denial behavior must remain intact.
- Public spam, rate-limited, malformed or duplicate input is N/A because this feature does not modify public input paths.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The admin back-office MUST provide a global admin shell with sidebar, header, main content area, active navigation state, logout access and current user display when available.
- **FR-002**: The sidebar MUST show Dashboard, Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité and Opérations, and MAY show Audit logs or Paramètres only if those destinations already exist.
- **FR-003**: The admin dashboard MUST replace raw text/scaffold output with readable KPI cards for existing dashboard/compliance/operation metrics.
- **FR-004**: The dashboard MUST include KPI cards for leads received, leads transmitted, leads refused, non-routed leads, expired licenses, licenses expiring within 30 days, active countries, active products, active partners and expired offers when the corresponding data is available.
- **FR-005**: The dashboard MUST show loading, empty and error states that are visually coherent and do not expose sensitive technical details.
- **FR-006**: Existing admin pages for Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard MUST use consistent page headers, descriptions, content containers and structured table/list presentation.
- **FR-007**: Existing admin pages MUST include clean loading, empty and error states where data fetching or data absence can occur.
- **FR-008**: The UI MUST include reusable admin UI primitives for tables, status badges, role badges, feature flag badges, KPI cards, buttons, search/filter controls, error messages, empty states and simple loading states.
- **FR-009**: The visual design MUST use a professional, restrained palette: light gray background, white surfaces, subtle borders, readable typography, coherent spacing, blue-night/indigo identity, teal/cyan accents, red alerts, orange warnings and green success states.
- **FR-010**: The responsive experience MUST remain usable on desktop and tablet, with a simple mobile layout that keeps navigation and content readable.
- **FR-011**: The UI MUST provide correct contrast, visible focus states, understandable buttons, hierarchical titles, form labels and aria labels where needed.
- **FR-012**: The UI MUST NOT add fake actions, dangerous actions, new business workflows, payment, subscription, policy issuance, attestations, electronic signature, claims handling, insurer API activation, advanced AI or routing changes.
- **FR-013**: Sensitive flags displayed by the UI, including `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` and `ai_recommendation_enabled`, MUST be represented as disabled/read-only when disabled and MUST NOT be activated by this feature.
- **FR-014**: The Web Publique Client MUST remain free of admin screens, admin routes, admin layouts and admin authentication or privilege state.
- **FR-015**: The Back-office Courtier MUST remain separated from the admin experience; shared UI primitives may be reused only when they do not mix routes, access policies or tenant-specific data.
- **FR-016**: The UI MUST avoid forbidden or equivalent wording: "Souscrire maintenant", "Contrat validé", "Garantie acceptée" and "Acheter maintenant".
- **FR-017**: Existing logout behavior MUST remain accessible from the admin shell and return the user to the login experience after sign-out.

### Key Entities *(include if feature involves data)*

- **AdminUser**: Authenticated platform user whose role and permissions determine admin access and available actions.
- **AdminNavigationItem**: Existing admin destination displayed in the sidebar with label, active state and availability based on existing routes.
- **DashboardMetric**: Existing operational or compliance count displayed as KPI, such as lead status counts, license risk counts, active catalog counts and expired offer counts.
- **FeatureFlag**: Existing global or scoped flag displayed as status, with sensitive flags clearly disabled/read-only when off.
- **AdminPageState**: Loading, empty, error and ready states for existing admin data views.
- **StatusBadge**: Visual representation of role, status, compliance risk, feature flag state or operational outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of required admin navigation links are visible to an authenticated admin in the sidebar on desktop.
- **SC-002**: At least 10 dashboard KPI slots are presented as cards when corresponding data is available, and missing optional metrics degrade gracefully.
- **SC-003**: 100% of listed existing admin pages provide a clear title, short description and structured content area.
- **SC-004**: Dashboard and admin pages expose loading, empty and error states without broken layout or raw implementation details.
- **SC-005**: 0 sensitive feature flags are activated or made mutable by this UI polish.
- **SC-006**: 0 Web Publique Client routes load admin screens, admin layouts, admin privileges or admin authentication state.
- **SC-007**: 0 occurrences of the forbidden phrases "Souscrire maintenant", "Contrat validé", "Garantie acceptée" and "Acheter maintenant" are introduced in source or rendered admin UI.
- **SC-008**: Keyboard focus is visibly detectable on primary interactive elements in the admin shell and pages.
- **SC-009**: The admin shell and dashboard are readable at representative desktop, tablet and mobile viewport sizes without critical content overlap.
- **SC-010**: Existing authentication, RBAC, routing, feature flag, consent and license business rules remain unchanged.

## Assumptions

- The target user is an authenticated platform administrator, not a public visitor and not a broker-only user.
- The admin surface is served by the existing back-office/admin application on local port `3602`.
- Existing API contracts and domain rules are sufficient for this polish; this feature should adapt presentation to available data rather than request new business endpoints.
- Existing routes determine whether Audit logs and Paramètres appear in navigation.
- Dashboard metrics may be partially available; optional unavailable metrics should show a graceful empty or unavailable state.
- Shared UI primitives are allowed only if they preserve public/admin/broker application boundaries.
- No database schema, Prisma model, routing rule, feature flag activation or production configuration change is required.
