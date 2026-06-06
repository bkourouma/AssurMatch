# Data Model: Broker Back-office UX Polish

This feature introduces no persisted data model changes, no Prisma migration and no backend business entity changes. The model below describes UI-only view models and states derived from existing broker data.

## Broker Shell View

- **Fields**: current route, navigation items, current broker display name when available, role/plan label when available, logout availability.
- **Rules**: navigation items must be broker-only; admin and public visitor routes are forbidden.
- **States**: authenticated content, auth-flow content, loading, unavailable.

## Broker Navigation Item

- **Fields**: label, route, availability, active state, optional badge, optional unavailable reason.
- **Rules**:
  - Dashboard, Leads, CRM, Team and Account are primary broker destinations when routes exist.
  - Notifications appears only if already available.
  - CRM for Starter must be unavailable and must use the required Pro message.
  - CRM for Pro/Enterprise must be available only when `broker_crm_enabled` is true.

## Broker Dashboard View

- **Fields**: lead counts, recent lead summaries, CRM summary when available, notifications summary when available, module availability.
- **Rules**: no fake metrics; missing optional data becomes empty or unavailable state.
- **States**: ready, loading, empty, error, unavailable.

## Starter Lead List View

- **Fields**: lead assignment id, customer/prospect label as already exposed, product/country, status, priority, received date, next safe action, status badge.
- **Rules**: tenant-scoped data only; actions limited to existing Starter actions.
- **States**: ready, loading, empty, error.

## Lead Detail View

- **Fields**: lead metadata, status, product/country, consent/routing/license status if already exposed, history events, available actions.
- **Rules**: no new transmission, routing or CRM behavior; unavailable actions are omitted or clearly disabled.
- **States**: ready, loading, not found/unauthorized, error.

## CRM View

- **Fields**: CRM lead summaries, pipeline/status groups when available, tasks/notes/reminders/documents/proposals/disputes only when already exposed, module availability state.
- **Rules**: Starter cannot see full CRM as available. Pro/Enterprise requires existing plan authorization and `broker_crm_enabled`.
- **States**: ready, loading, empty, error, unavailable by plan, unavailable by feature flag.

## Account, Team and Notifications Views

- **Fields**: existing account attributes, team member summaries, notification summaries if already exposed.
- **Rules**: preserve existing read/update permissions and read-only restrictions.
- **States**: ready, loading, empty, error, unavailable.

## Guardrail Entities

- **Forbidden Wording Set**: prohibited phrases from the spec.
- **Route Surface Boundary**: public, admin and broker route ownership markers used by source tests.
- **Plan/Flag Matrix**: Starter, Pro and Enterprise CRM visibility expectations.
