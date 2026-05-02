# Contract: Admin UI Polish

## Admin Shell Contract

Authenticated admin pages must expose:

- A left navigation sidebar on desktop/tablet.
- A top header with page context and user/logout access where available.
- A main content region with a stable landmark.
- Visible active navigation state.
- Visible keyboard focus on navigation and button controls.
- Responsive fallback for narrow screens.

Auth/login-related routes must remain usable and must not require dashboard data to render.

## Navigation Contract

Required navigation labels:

- Dashboard
- Catalogue
- Partenaires
- Utilisateurs
- Feature flags
- Conformité
- Opérations

Optional labels:

- Audit logs, only if an existing route is available.
- Paramètres, only if an existing route is available.

Navigation must not point to the Web Publique Client or broker-only routes.

## Dashboard Contract

The dashboard must present KPI card slots for:

- Leads reçus
- Leads transmis
- Leads refusés
- Leads non routés
- Licences expirées
- Licences expirant dans 30 jours
- Pays actifs
- Produits actifs
- Partenaires actifs
- Offres expirées, when available

Each KPI slot must support ready, loading, empty, error or unavailable presentation. Optional unavailable metrics must not be replaced by fake data.

## Page Contract

Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard pages must provide:

- Clear title.
- Short description.
- Structured main content container.
- Table/list/cards appropriate to available data.
- Loading state when data is pending.
- Empty state when data is absent.
- Error state when data cannot be loaded.
- No fake button for an unimplemented action.

## Sensitive Feature Flag Contract

The following flags must remain displayed as disabled/read-only when disabled:

- `payments_enabled`
- `e_signature_enabled`
- `policy_issuance_enabled`
- `claims_enabled`
- `insurer_api_enabled`
- `ai_recommendation_enabled`

This feature must not introduce a UI control that activates them.

## Separation and Wording Contract

The Web Publique Client must not contain admin routes, layouts, privileges or authentication state. The Back-office Courtier must not be refactored into the admin shell.

Forbidden phrases must not be introduced:

- "Souscrire maintenant"
- "Contrat validé"
- "Garantie acceptée"
- "Acheter maintenant"
