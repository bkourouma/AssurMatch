# Contract: Broker UI Polish

## Broker Shell Contract

Authenticated broker pages must expose:

- A broker-only sidebar or equivalent primary navigation.
- A top header with page context and logout access where available.
- A main content region with a stable landmark.
- Visible active navigation state.
- Visible keyboard focus on navigation and button controls.
- Responsive fallback for narrow screens.

Auth/login-related routes must remain usable and must not require dashboard data to render.

## Navigation Contract

Required broker navigation labels:

- Dashboard
- Leads
- CRM
- Equipe
- Compte

Optional labels:

- Notifications, only if an existing broker notifications route or page is available.
- Aide or Parametres, only if relevant and not misleading.

Navigation must not point to Web Publique Client routes or admin-only routes.

## Dashboard Contract

The dashboard must present operational card slots for available broker data:

- Leads recus or assigned
- Leads vus / en cours
- Leads acceptes, rejetes or disputes when available
- CRM activity summary for Pro/Enterprise when available
- Notifications or recent events when available
- Module availability state for Starter/CRM/Dashboard

Each slot must support ready, loading, empty, error or unavailable presentation. Optional unavailable metrics must not be replaced by fake data.

## Starter Leads Contract

Starter lead pages must provide:

- Clear title and short description.
- Structured lead list/table.
- Status badges.
- Lead detail link.
- Empty, loading and error states.
- Existing Starter actions only.

Starter CRM entry points must display the exact message:

```text
Le CRM complet est disponible avec le plan Pro.
```

Starter must not see Kanban, advanced pipeline, team assignment, tasks, reminders or Pro CRM controls as available.

## Pro/Enterprise CRM Contract

CRM pages must provide:

- Clear title and module availability state.
- CRM content only when plan allows it and `broker_crm_enabled` is true.
- Structured CRM lead list or pipeline from existing data.
- Empty, loading and error states.
- No active button for behavior not implemented by the current product.

When CRM is unavailable because of feature flag or scope, the UI must explain the unavailability without changing feature flag state.

## Account, Team and Notifications Contract

Account, Team and Notifications pages must provide:

- Consistent page shell and heading hierarchy.
- Structured content from existing data.
- Read-only presentation for roles without mutation permission.
- Empty/unavailable state for missing optional modules.
- No fake invite, billing, activation or notification actions.

## Separation and Wording Contract

The Web Publique Client must not contain broker routes, layouts, privileges or authentication state. The Back-office Courtier must not expose admin navigation, admin routes or admin-only labels as active broker destinations.

The prohibited direct-sale and regulated-promise phrases named in the feature request must not be introduced.
