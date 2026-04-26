# Runtime HTTP Wiring Contract

This contract defines the expected route ownership, authentication, error
mapping and frontend consumption boundaries for spec 008. It is a planning
contract; implementation may later generate or validate equivalent OpenAPI
artifacts from these expectations.

## Global HTTP Rules

- All routes are served by the existing Backend API runtime.
- Public routes must not require partner/admin ActorContext.
- Broker and admin routes must require authenticated ActorContext from bearer or
  session-derived token.
- Simulation actor headers are allowed only in tests or explicitly allowed
  development mode; production rejects them.
- Controllers validate body, query and params before calling application
  services.
- Controllers do not contain business decisions beyond HTTP validation/mapping.
- Public errors expose safe categories only.
- Broker/admin errors must not reveal cross-tenant resource existence.
- `x-correlation-id`, when present, is propagated to ActorContext, audit and
  safe error metadata.

## Standard Status Mapping

| Case | HTTP status | Notes |
|------|-------------|-------|
| Invalid body/query/param | 400 | Validation details are safe and field-scoped |
| Missing or invalid protected actor | 401 | Broker/admin only |
| RBAC, MFA, read-only, tenant, plan or flag denied | 403 | May be 404 when hiding resource existence is safer |
| Public resource not available or hidden | 404 | Avoids exposing disabled/internal data |
| Duplicate/conflict/routing lock | 409 | Safe reason code only |
| Semantically invalid accepted-shape request | 422 | Use only if aligned with local conventions |
| Rate limited | 429 | Safe retry/error state |
| Unexpected error | 500 | No PII, token, tenant secret or stack trace in response |

## Public Route Contract

| Method | Path | Owning controller | Auth | Main success | Required blockers |
|--------|------|-------------------|------|--------------|-------------------|
| POST | `/auth/login` | `AuthController` | Public | Auth challenge/session token result | Invalid credentials, rate limit |
| GET | `/countries` | `PublicCountriesController` | Public | Public countries list | Disabled/internal countries hidden |
| GET | `/countries/:countryCode` | `PublicCountriesController` | Public | Public country page | Country disabled/waitlist behavior, flag denial |
| GET | `/countries/:countryCode/products` | `PublicProductsController` | Public | Public products for country | Country/product flags |
| GET | `/countries/:countryCode/products/:productKey` | `PublicProductsController` | Public | Public product page | Disabled product, quote/comparison flags |
| GET | `/countries/:countryCode/products/:productKey/offers` | `PublicOffersController` | Public | Indicative offers page/list | Expired, unvalidated, disabled offers hidden |
| GET | `/offers/:offerId` | `PublicOffersController` | Public | Public offer detail | Not public/expired/not validated hidden |
| GET | `/countries/:countryCode/products/:productKey/quote-form` | `PublicQuoteFormsController` | Public | Published form and consent text reference | Country/product/quote flags, unpublished form |
| POST | `/quote-requests` | `PublicQuoteRequestsController` | Public | `{ publicReference, status }` | No consent, disabled country/product, no eligible broker/offer, spam, duplicate, rate limit |
| GET | `/quote-requests/:publicReference` | `PublicQuoteStatusController` or `PublicQuoteRequestsController` | Public token/status access | Public-safe status | Invalid token/reference, no sensitive data |

### Public Quote Request Body Contract

The body must be validated using the existing shared quote request schema or its
compatible successor.

Required semantic fields:
- `countryCode` or country reference.
- `productKey` or product reference.
- published quote form version/reference.
- visitor contact fields required by the active form.
- explicit consent grant with consent text/version/scope.
- optional selected public offer reference.
- anti-spam/duplicate metadata accepted by existing rules.

Success response:

```json
{
  "publicReference": "QR-...",
  "status": "created"
}
```

Response must not include internal broker tenant ids, license details, routing
candidate lists, admin notes or CRM data.

## Broker Route Contract

All broker routes require:
- authenticated ActorContext;
- broker role;
- partner tenant id;
- MFA where policy requires it;
- tenant-scoped repository reads/writes;
- read-only mutation denial;
- durable audit for sensitive success/refusal.

| Method | Path | Owning controller | Additional gates |
|--------|------|-------------------|------------------|
| GET | `/broker/starter/dashboard` | `BrokerStarterController` | Starter portal flag/plan and tenant |
| GET | `/broker/starter/leads` | `BrokerStarterController` | Tenant lead list only |
| GET | `/broker/starter/leads/export.csv` | `BrokerStarterController` | Export permission, scope, volume and audit |
| GET | `/broker/starter/leads/:leadId` | `BrokerStarterController` | Tenant lead detail only |
| GET | `/broker/starter/leads/:leadId/history` | `BrokerStarterController` | Tenant action history |
| POST | `/broker/starter/leads/:leadId/accept` | `BrokerStarterController` | Not read-only, tenant, audit |
| POST | `/broker/starter/leads/:leadId/reject` | `BrokerStarterController` | Not read-only, reason, tenant, audit |
| POST | `/broker/starter/leads/:leadId/dispute` | `BrokerStarterController` | Not read-only, reason, tenant, audit |
| GET | `/broker/starter/notifications` | `BrokerStarterController` | Tenant notification scope |
| POST | `/broker/starter/notifications/:notificationId/read` | `BrokerStarterController` | Tenant notification scope |
| GET | `/broker/starter/plan-capabilities` | `BrokerStarterController` | Plan and flags |
| GET | `/broker/crm/dashboard` | `BrokerCrmController` | Non-Starter, `broker_crm_enabled=true`, tenant |
| GET | `/broker/crm/leads` | `BrokerCrmController` | Non-Starter, CRM flag, tenant |
| GET | `/broker/crm/leads/kanban` | `BrokerCrmController` | Non-Starter, CRM flag, tenant |
| GET | `/broker/crm/leads/export.csv` | `BrokerCrmController` | Export permission, CRM flag, tenant, audit |
| GET | `/broker/crm/leads/:leadId` | `BrokerCrmController` | CRM flag, tenant |
| POST | `/broker/crm/leads/:leadId/status` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/notes` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/tasks` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/reminders` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/assign` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/documents` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| POST | `/broker/crm/leads/:leadId/proposals` | `BrokerCrmController` | Not read-only, indicative/non-contractual, CRM flag, audit |
| POST | `/broker/crm/leads/:leadId/disputes` | `BrokerCrmController` | Not read-only, CRM flag, tenant, audit |
| GET | `/broker/crm/notifications` | `BrokerCrmController` | CRM flag, tenant |
| GET | `/broker/crm/ai-foundations` | `BrokerCrmController` | CRM flag, AI remains disabled unless existing gates allow |

## Admin Route Contract

All admin routes require authenticated admin ActorContext, RBAC, MFA where
policy requires it, durable audit for sensitive reads/mutations and safe
pagination/limits for lists.

| Method | Path | Owning controller | Required behavior |
|--------|------|-------------------|-------------------|
| GET | `/admin/feature-flags` | `AdminFeatureFlagsController` | Read persisted flags with RBAC |
| PATCH | `/admin/feature-flags/:id` | `AdminFeatureFlagsController` | Reason required, history, audit, cache invalidation |
| GET | `/admin/audit-logs` | `AdminAuditLogsController` | Read durable audit logs only, paginated/limited |
| GET | `/admin/system/health` | `AdminHealthController` | Protected dependency health without secrets |

Existing admin quote, lead, catalog, partner, license, user, consent,
notification and routing-precheck routes remain in scope only to preserve
current behavior and remove RuntimeHttpController-only route ownership.

## Feature Flag Contract

- Persistent flag repository is authoritative.
- Redis cache entries include key, scope, value and version/TTL.
- Sensitive flags default false when absent or unreadable.
- CRM access requires `broker_crm_enabled=true` and eligible plan/role/tenant.
- Regulated module flags remain false by default and are not activated by spec
  008.

## Audit Contract

Sensitive success/refusal events must write durable `AuditLog` records with:
- actor id when available;
- action;
- target type/id;
- safe scope;
- result;
- safe reason/error category;
- PII-minimized context;
- correlation id when available;
- timestamp and retention.

Admin audit reads must never use memory buffers as the source.

## Frontend Contract

### Web Publique Client

- Calls only public API paths.
- Quote form submits real `POST /quote-requests`.
- Success displays `publicReference`.
- API unavailable/non-OK states are visible and not converted to silent empty
  arrays or objects.
- No import of back-office auth/session helpers.

### Back-office Partenaires/Plateforme

- Broker app calls only `/broker/...` with token/session.
- Admin app calls only `/admin/...` with token/session.
- Screens show unauthenticated, forbidden, MFA required, read-only and API
  unavailable states.
- No public endpoint is used to bypass protected backend access.

## Contract Tests Expected

- Route inventory: each P1 route has expected owning decorated controller.
- OpenAPI/contract drift: route methods, schemas, auth requirements and status
  categories match this contract.
- Forbidden capabilities: no payment, subscription, policy issuance,
  attestation, e-signature, claims or advanced AI route is exposed as active.
- Frontend separation: public app has no back-office route/auth imports; broker
  and admin apps keep protected API clients.
