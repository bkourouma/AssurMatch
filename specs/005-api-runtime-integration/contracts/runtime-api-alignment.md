# Runtime API And OpenAPI Alignment

This document records the contract alignment expected from implementation. It
is not a new business API; it reconciles the routes already specified in
001-004 with the real NestJS runtime required by 005.

## Contract Principles

- Every exposed route must be a decorated Nest controller method.
- Every documented route must be callable in a Nest e2e HTTP test.
- Public routes require no broker/admin authentication state.
- Broker/admin routes require auth, RBAC, tenant scope and MFA when sensitive.
- OpenAPI must match actual method, path, params, query, body, response and
  error shape.
- Shared Zod schemas remain the preferred DTO/response validation source.
- Reserved endpoints that are not exposed must be explicitly marked as
  reserved/not-runtime rather than silently appearing in OpenAPI.

## Route Groups

### Auth

| Method | Path | Runtime status expected |
|--------|------|-------------------------|
| POST | `/auth/login` | Exposed |
| POST | `/auth/logout` | Exposed |
| GET | `/auth/me` | Exposed |
| POST | `/auth/mfa/enroll` | Exposed |
| POST | `/auth/mfa/verify` | Exposed |

### Public Web Client

| Method | Path | Runtime status expected |
|--------|------|-------------------------|
| GET | `/countries` | Exposed |
| GET | `/countries/:countryCode` | Exposed |
| GET | `/countries/:countryCode/products` | Exposed |
| GET | `/countries/:countryCode/products/:productKey` | Exposed |
| GET | `/countries/:countryCode/products/:productKey/offers` | Exposed |
| GET | `/offers/:offerId` | Exposed |
| GET | `/countries/:countryCode/products/:productKey/quote-form` | Exposed |
| POST | `/quote-requests` | Exposed |
| GET | `/quote-requests/:publicReference` | Exposed as minimal visitor status |

### Broker Starter

| Method | Path | Runtime status expected |
|--------|------|-------------------------|
| GET | `/broker/starter/dashboard` | Exposed |
| GET | `/broker/starter/leads` | Exposed |
| GET | `/broker/starter/leads/:leadId` | Exposed |
| POST | `/broker/starter/leads/:leadId/accept` | Exposed |
| POST | `/broker/starter/leads/:leadId/reject` | Exposed |
| POST | `/broker/starter/leads/:leadId/dispute` | Exposed |
| GET | `/broker/starter/leads/:leadId/history` | Exposed |
| GET | `/broker/starter/notifications` | Exposed |
| POST | `/broker/starter/notifications/:notificationId/read` | Exposed |
| GET | `/broker/starter/leads/export.csv` | Exposed with export permission |
| GET | `/broker/starter/plan-capabilities` | Exposed |

### Broker CRM Pro/Enterprise

| Method | Path | Runtime status expected |
|--------|------|-------------------------|
| GET | `/broker/crm/dashboard` | Exposed, Pro/Enterprise plus flag |
| GET | `/broker/crm/leads` | Exposed, Pro/Enterprise plus flag |
| GET | `/broker/crm/leads/kanban` | Exposed, Pro/Enterprise plus flag |
| GET | `/broker/crm/leads/:leadId` | Exposed, Pro/Enterprise plus flag |
| POST | `/broker/crm/leads/:leadId/status` | Exposed |
| POST | `/broker/crm/leads/:leadId/notes` | Exposed |
| POST | `/broker/crm/leads/:leadId/tasks` | Exposed |
| POST | `/broker/crm/leads/:leadId/reminders` | Exposed |
| POST | `/broker/crm/leads/:leadId/assign` | Exposed |
| POST | `/broker/crm/leads/:leadId/documents` | Exposed internal-only |
| POST | `/broker/crm/leads/:leadId/proposals` | Exposed non-contractual |
| POST | `/broker/crm/leads/:leadId/disputes` | Exposed |
| GET | `/broker/crm/leads/export.csv` | Exposed with export permission |
| GET | `/broker/crm/notifications` | Exposed |

### Admin Minimal

| Method | Path | Runtime status expected |
|--------|------|-------------------------|
| GET/PATCH | `/admin/feature-flags` and scoped children | Exposed |
| GET | `/admin/audit-logs` | Exposed |
| GET/CRUD | `/admin/countries`, `/admin/products`, `/admin/offers` | Exposed as already specified |
| GET/CRUD | `/admin/partners`, `/admin/partners/:partnerId/licenses` | Exposed as already specified |
| GET | `/admin/quote-requests`, `/admin/lead-assignments` | Exposed |
| GET | `/admin/system/health` | Exposed |

## Standard Error Contract

- `400 BAD_REQUEST`: malformed params/query/body or invalid DTO shape.
- `401 UNAUTHORIZED`: missing or invalid authentication.
- `403 FORBIDDEN`: authenticated actor lacks role, permission, MFA, plan or
  tenant access where resource existence may be safely acknowledged.
- `404 NOT_FOUND`: public unavailable resource or masked unauthorized resource.
- `409 CONFLICT`: duplicate submission or invalid state transition conflict.
- `422 UNPROCESSABLE_ENTITY`: valid shape refused by business blocker such as
  no consent, disabled flag or expired license.
- `500 INTERNAL_SERVER_ERROR`: unexpected failure with masked message and
  correlationId.

## Contract Test Requirements

- Boot the real Nest app, not service instances.
- Assert route exists and returns expected HTTP status.
- Assert invalid DTOs are rejected before service mutation.
- Assert OpenAPI route security matches public/broker/admin scope.
- Assert forbidden modules are absent or disabled:
  payments, e-signature, policy issuance, attestation, claims and advanced
  insurer API.
- Assert public OpenAPI tags do not include broker/admin operations.

## OpenAPI Alignment Notes

- Prefer generated OpenAPI from decorated controllers if implementation adds
  Swagger decorators.
- If generated OpenAPI is not introduced, maintain a checked-in OpenAPI file
  under this feature or shared contract docs and validate it with HTTP tests.
- Existing `specs/*/contracts/*.openapi.yaml` files should be reconciled with
  the final runtime route inventory during implementation.
