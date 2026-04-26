# Contracts: Dashboards API

All endpoints are **read-only**, return JSON, and live under the protected
back-office surface.

## `GET /broker/dashboard`

**Auth**: bearer token, MFA verified, broker role.
**Feature flag**: `broker_dashboard_enabled` (fail-closed).

### Query

| name      | type            | required | notes                                      |
|-----------|-----------------|----------|--------------------------------------------|
| from      | ISO date-time   | no       | default = now − 30 days                    |
| to        | ISO date-time   | no       | default = now                              |
| country   | ISO country     | no       | filtered to actor's authorized countries   |
| product   | product key     | no       | filtered to actor's authorized products    |
| agentId   | uuid            | no       | Pro/Enterprise only; ignored otherwise     |

### Responses

`200` — `BrokerDashboardResponse` (see `data-model.md`). For a Starter actor, the response includes only the `starter` section + `licenseAlerts`. For Pro/Enterprise with `broker_crm_enabled=true`, the response also includes `crm`.

`400` — invalid window (span > 365 days, < 1 day, malformed).
`401` — unauthenticated.
`403` — `broker_dashboard_enabled=false`, missing tenant, missing MFA, role does not allow broker dashboards. Audit: `dashboard.broker.refused`.

## `GET /admin/dashboard`

**Auth**: bearer token, MFA verified, admin role allow-list:
`super_admin`, `admin_pays`, `compliance_admin`, `support_admin`, `finance_admin`, `content_admin`.

### Query

| name      | type          | required | notes                                           |
|-----------|---------------|----------|-------------------------------------------------|
| from      | ISO date-time | no       | default = now − 30 days                         |
| to        | ISO date-time | no       | default = now                                   |
| country   | ISO country   | no       | refused with 403 if outside `actor.countryScopes` for restricted roles |
| product   | product key   | no       | refused with 403 if outside `actor.productScopes` for restricted roles |
| partnerId | uuid          | no       | refused with 403 for `admin_pays` outside its country |

### Responses

`200` — `AdminDashboardResponse` (see `data-model.md`). Sections excluded for restricted roles (e.g. `finance_admin`) are omitted from the payload (not zeroed) to make role gating clear in the response.

`400` — invalid window.
`401` — unauthenticated.
`403` — role not in allow-list, or volunteered query out of scope. Audit: `dashboard.admin.refused`.

Each successful call writes `dashboard.admin.read` audit entry.

## `GET /admin/dashboard/compliance-alerts`

**Auth**: same as `/admin/dashboard`.

### Query

| name      | type          | required | notes                          |
|-----------|---------------|----------|--------------------------------|
| from / to | ISO date-time | no       | default 30 days, max 365 days  |
| category  | enum          | no       | one of the alert categories    |
| page      | integer       | no       | default 1, min 1               |
| pageSize  | integer       | no       | default 25, max 100            |

### Responses

`200` — `ComplianceAlertsResponse` paginated.
`400` — invalid pagination or window.
`401` — unauthenticated.
`403` — role not in allow-list. Audit: `dashboard.admin.compliance_alerts.refused`.

Each successful call writes `dashboard.admin.compliance_alerts.read` audit entry.

## Error format

All errors use the existing `ErrorResponseFilter` envelope with codes:

- `VALIDATION_FAILED`
- `UNAUTHORIZED`
- `FORBIDDEN`

Error responses never echo PII or actor secrets.
