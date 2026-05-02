# Research: Back-office Admin UX Polish

## Decision 1: Scope the UI foundation to the admin app

**Decision**: Keep the admin shell, CSS foundation and reusable UI primitives inside `apps/admin`.

**Rationale**: The feature is explicitly limited to Back-office Admin. Local admin primitives reduce the risk of leaking admin concepts into Web Publique Client or Back-office Courtier and keep implementation close to the pages being polished.

**Alternatives considered**:
- Shared package design system: useful later, but unnecessary for this focused polish and more likely to affect public/broker apps.
- Per-page ad hoc CSS only: fastest initially, but would preserve duplication and inconsistent states.

## Decision 2: Use existing dependencies and CSS

**Decision**: Use existing React/Next capabilities and CSS custom properties/classes. Do not add a new UI library.

**Rationale**: The repo already has a working stack and the requested design is restrained. Adding a library would increase bundle and maintenance surface without improving compliance or business value.

**Alternatives considered**:
- Component library adoption: rejected for scope and consistency risk.
- Utility CSS framework: rejected because it would introduce a new styling system solely for this polish.

## Decision 3: Preserve API and business contracts

**Decision**: Map available admin data into UI view models at the presentation boundary and show unavailable/empty states for missing optional metrics.

**Rationale**: The request forbids business logic changes and API route changes. KPI cards can present existing dashboard data while avoiding invented counts or new backend requirements.

**Alternatives considered**:
- Add dashboard aggregation endpoints: rejected because backend API changes are out of scope unless strictly necessary.
- Hard-code example metrics: rejected because fake operational data would mislead admins.

## Decision 4: Protect auth flows while adding a shell

**Decision**: Add a global admin shell for authenticated/admin pages while ensuring login, MFA and password reset/change flows remain clean and usable.

**Rationale**: Admin pages need a full shell, but authentication flows have different UX needs and should not be visually or functionally broken by navigation chrome.

**Alternatives considered**:
- Wrap every route in the shell: rejected because it may degrade login/MFA flows.
- Add shell manually to every page: rejected because it duplicates navigation and makes consistency harder.

## Decision 5: Validate with Playwright/source guardrails

**Decision**: Extend back-office Playwright/source tests for layout, navigation, dashboard cards, state markers, responsive behavior and forbidden/public-admin separation.

**Rationale**: The feature is UI-facing and constitutional constraints require separation and forbidden wording checks. Source tests are reliable for route/import guardrails; browser tests are useful for rendered UX when local services are available.

**Alternatives considered**:
- Manual QA only: rejected because regression risk is high.
- Unit tests only: insufficient for navigation and responsive layout confidence.
