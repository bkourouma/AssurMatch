# AssurMatchRuntime Residuals

Spec 009 reduces `AssurMatchRuntime` to transition orchestration. It may still
compose modules for the HTTP compatibility layer introduced by spec 008, but it
must not own primary state for extracted domains.

## Completed Prisma runtime repositories

- `AuditLogRepository` through `PrismaAuditLogRepository`.
- `FeatureFlagRepository` through `PrismaFeatureFlagRepository`.

These are the only repositories currently allowed to advertise
`mode = "prisma-runtime"`.

## Transition-only extracted repositories

The following repositories have domain ports and memory test adapters, but no
completed Prisma runtime adapter yet:

- `CountriesRepository`
- `ProductsRepository`
- `OffersRepository`
- `ProspectsRepository`
- `ConsentRecordsRepository`
- `QuoteRequestsRepository`
- `LeadAssignmentsRepository`
- `RoutingDecisionsRepository`
- `PartnersRepository`
- `PartnerLicensesRepository`
- `CRMActivityRepository`
- `NotificationsRepository`

Their previous incomplete `Prisma...Repository` classes were removed because the
service layer is still synchronous. A promise-based Prisma implementation would
require an async refactor of the affected services, controllers, HTTP harnesses
and tests before it can be represented honestly as runtime persistence.

| Domain | Current runtime ownership | Repository boundary | Exit criterion |
|--------|---------------------------|---------------------|----------------|
| Countries | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and async service/controller refactor |
| Products | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and async service/controller refactor |
| Offers | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and async service/controller refactor |
| Prospects | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and async quote transaction |
| Consent records/texts | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and async quote form/consent refactor |
| Quote requests | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async transactional Prospect/Consent/Quote persistence |
| Lead assignments | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and tenant-scoped broker route refactor |
| Routing decisions | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and routing service refactor |
| Partners | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and eligibility refactor |
| Partner licenses | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and eligibility refactor |
| CRM activity/history | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and CRM service refactor |
| Notifications | Test/runtime fixture composition only | Memory adapter only; production use is forbidden | Async Prisma repository and notification trace refactor |
| Audit logs | Delegates audit module construction only | `PrismaAuditLogRepository` outside tests, memory in tests | Audit module is fully provider-wired |
| Feature flags | Delegates feature flag module construction only | `PrismaFeatureFlagRepository` outside tests, memory in tests | Feature flag module is fully provider-wired |

Known transitional responsibilities that remain after spec 009:

- Manual construction of modules/controllers in `AssurMatchRuntime` for the
  spec 008 HTTP compatibility layer.
- Memory adapters remain available only under `NODE_ENV=test` for unit and HTTP
  fixture setup.
- Some non-priority domains still own local state from previous specs, notably
  quote form definitions, users/auth support, documents, regulatory regimes and
  AI disabled scaffolding.
- Notification queue delivery keeps the existing queue abstraction; durable
  notification trace persistence for the extracted notification repository is
  not production-enabled yet.

Production/runtime prohibition:

- Extracted domain memory repositories are rejected outside `NODE_ENV=test`.
- `AssurMatchRuntime` must not import or instantiate incomplete
  `Prisma...Repository` classes for extracted domains.
- Any future Prisma adapter for extracted domains must remove synchronous
  service assumptions before it may expose `mode = "prisma-runtime"`.

Next technical tasks:

- Convert catalog services/controllers to async repository methods.
- Convert consent/prospect/quote submission to an async transactional unit.
- Convert partner/license/routing/lead assignment services to async
  tenant-scoped Prisma reads and writes.
- Convert Starter/CRM history and activity services to async persisted
  repositories.
- Replace notification mutable-list bridging with async persisted traces.
- Add integration tests against a real isolated Prisma test database for each
  extracted domain before enabling production runtime.

Guardrails:

- No extracted domain may add primary arrays/maps directly to
  `AssurMatchRuntime`.
- Memory repositories must declare `mode = "memory-test"` and be rejected
  outside test runtime.
- No extracted domain may export a `Prisma...Repository` class until every
  method is implemented without transitional throws.
