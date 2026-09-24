# Research: Broker Back-office UX Polish

## Decision 1: Scope the UI foundation to the broker app

**Decision**: Keep the broker shell, CSS foundation and reusable UI primitives inside `apps/broker`.

**Rationale**: The feature is explicitly limited to the Back-office Courtier. Local broker primitives reduce the risk of leaking broker concepts into Web Publique Client or Back-office Admin and keep implementation close to the pages being polished.

**Alternatives considered**:
- Shared package design system: useful later, but unnecessary for this focused polish and more likely to affect public/admin apps.
- Per-page ad hoc CSS only: fastest initially, but would preserve duplication and inconsistent states.

## Decision 2: Use existing dependencies and CSS

**Decision**: Use existing React/Next capabilities and CSS custom properties/classes. Do not add a new UI library.

**Rationale**: The repo already has a working stack and the requested design is restrained. Adding a library would increase bundle and maintenance surface without improving compliance or business value.

**Alternatives considered**:
- Component library adoption: rejected for scope and consistency risk.
- Utility CSS framework: rejected because it would introduce a new styling system solely for this polish.

## Decision 3: Preserve API and business contracts

**Decision**: Map available broker data into UI view models at the presentation boundary and show unavailable/empty/error states for missing optional metrics.

**Rationale**: The request forbids business logic changes and API route changes. Broker pages can present existing data while avoiding invented counts or new backend requirements.

**Alternatives considered**:
- Add broker aggregation endpoints: rejected because backend API changes are out of scope unless strictly necessary.
- Hard-code example metrics: rejected because fake operational data would mislead brokers.

## Decision 4: Protect auth flows while adding a shell

**Decision**: Add a broker shell for authenticated broker pages while ensuring login, MFA and password reset/change flows remain clean and usable.

**Rationale**: Broker pages need a full shell, but authentication flows have different UX needs and should not be visually or functionally broken by navigation chrome.

**Alternatives considered**:
- Wrap every route in the full shell: rejected because it may degrade login/MFA flows.
- Add shell manually to every page: rejected because it duplicates navigation and makes consistency harder.

## Decision 5: Preserve Starter vs Pro/Enterprise boundaries

**Decision**: Represent Starter CRM access as unavailable with the exact required message, and show CRM for Pro/Enterprise only when existing plan/capability/flag data allows it.

**Rationale**: The constitution explicitly distinguishes Starter from Pro CRM. The UI polish must make that distinction clearer without changing RBAC or feature flag evaluation.

**Alternatives considered**:
- Hide CRM entirely from Starter: rejected because the request requires the Pro availability message.
- Show disabled CRM controls to Starter: rejected because it could imply unavailable features are partially usable.

## Decision 6: Validate with Playwright/source guardrails

**Decision**: Extend broker Playwright/source tests for layout, navigation, dashboard/cards, state markers, CRM gating, responsive behavior, forbidden wording and public/admin/broker separation.

**Rationale**: The feature is UI-facing and constitutional constraints require separation and forbidden wording checks. Source tests are reliable for route/import guardrails; browser tests are useful for rendered UX when local services are available.

**Alternatives considered**:
- Manual QA only: rejected because regression risk is high.
- Unit tests only: insufficient for navigation and responsive layout confidence.
