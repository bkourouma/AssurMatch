# Data Model: Back-office Admin UX Polish

This feature introduces UI view models only. It does not add or modify persisted entities, database schema, Prisma models, API routes, routing rules, audit behavior or feature flag activation.

## AdminShellState

Represents the global admin layout state.

- `currentPath`: active route used to mark navigation.
- `currentUserLabel`: display name or email when available.
- `currentUserRole`: role label when available.
- `navigationItems`: list of existing admin destinations.
- `isAuthFlow`: whether the current route should use simplified auth presentation.

Validation rules:
- Required navigation items must be present for authenticated admin pages.
- Optional items such as Audit logs or Paramètres appear only when routes already exist.
- Auth routes must remain usable without requiring admin dashboard data.

## AdminNavigationItem

Represents a sidebar destination.

- `label`: visible French label.
- `href`: existing admin route.
- `status`: available, current or unavailable.
- `description`: short accessible label where helpful.

Validation rules:
- Must not point into the public app.
- Must not introduce fake destinations for unavailable routes.

## DashboardKpi

Represents a dashboard card.

- `label`: metric name.
- `value`: numeric or unavailable value.
- `tone`: neutral, success, warning, danger or info.
- `helper`: short supporting text.
- `state`: ready, empty, loading, error or unavailable.

Validation rules:
- Missing optional data uses `unavailable` or `empty`; it is not fabricated.
- Sensitive/compliance KPI tones must not imply business action was taken.

## AdminPageState

Represents the state of an existing admin page.

- `status`: loading, ready, empty or error.
- `title`: page title.
- `description`: short page description.
- `items`: existing records if available.
- `errorMessage`: safe user-facing message when errors occur.

Validation rules:
- Error messages must avoid secrets, stack traces and internal implementation details.
- Empty states must explain absence of data without implying activation or missing compliance work is complete.

## AdminTableColumn

Represents reusable table/list presentation.

- `header`: visible column label.
- `accessor`: presentation-level data key or render function.
- `align`: left, right or center.
- `priority`: desktop, tablet or mobile visibility hint.

Validation rules:
- Tables must remain readable at tablet/mobile sizes.
- Columns displaying statuses should use badges where appropriate.

## StatusBadge

Represents visual state for roles, statuses, feature flags or compliance alerts.

- `label`: visible status text.
- `tone`: neutral, success, warning, danger, info or disabled.
- `kind`: status, role, featureFlag or compliance.

Validation rules:
- Sensitive disabled flags must use a disabled/read-only visual treatment.
- Badges must not imply activation when the underlying flag/state is disabled.

## State Transitions

Admin page and dashboard states follow:

```text
loading -> ready
loading -> empty
loading -> error
error -> loading (retry or navigation)
empty -> loading (refresh)
ready -> loading (refresh)
```

No persisted domain state transitions are introduced.
