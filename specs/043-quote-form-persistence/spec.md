# Feature Specification: Quote Form Definition Persistence and Administration

**Feature Branch**: `043-quote-form-persistence`
**Created**: 2026-09-19
**Status**: Implemented and validated 2026-09-19
**Validation State**: Validated. D1 was resolved against the existing role matrix (see below); D2 and D3 shipped as specified. This spec opens no feature flag.
**Continuous Workflow Eligible**: Yes.

## Why this spec exists

The visitor quote journey - the core of the PRD - **cannot be completed on any running server**, and no test in the repository says so.

Three independent gaps produce this:

1. `QuoteFormDefinitionService` keeps every definition in a private in-memory array (`quote-form-definition.service.ts:40`). It has no repository, no hydration, and is never persisted. Definitions exist only for the lifetime of an API process.
2. `AdminQuoteFormDefinitionsController` is instantiated by `QuoteFormsModule` but **never registered with any HTTP route** (`runtime-http-wiring.module.ts` wires only the public `quote-form` route). There is no way to create a definition on a running server.
3. `apps/admin/app/quote-form-definitions/page.tsx` is a stub: a heading and one sentence, no data and no form.

The `QuoteFormDefinition` table exists in Prisma with every column needed. The local demo seed writes published definitions into it. The backend never reads them.

Observed on the local stack on 2026-09-19: the public page renders "La demande de devis n'est pas disponible pour ce pays ou ce produit", Mailpit stays empty, nothing reaches routing. The product's own activation checklist already reports it correctly - *Parcours devis CI/auto - blocked - Formulaire publie: manquant, Consentement publie: manquant* - because the consent check is derived from the published form, so a single root cause disables both lines.

The test suite does not catch it because `backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts:98` creates its form **in-process** via `runtime.quoteForms.service.create(...)`, bypassing HTTP entirely. Every quote test inherits that shortcut.

There is already a guard for exactly this class of defect: `assertRuntimeRepository` throws outside `NODE_ENV=test` when a service is wired to a memory repository. Sixteen repositories are registered in `runtimeRepositoryModes()`. `QuoteFormDefinitionService` never opted in, because it takes no repository at all.

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Unchanged. A quote form collects a visitor's declarative answers so an eligible broker can be put in contact. It never prices, advises, commits or issues anything.
- **Impacted application(s)**: Backend API (quote-forms module, HTTP wiring, activation checklist), database / Prisma (read path only - the table already exists), Back-office Plateforme (the administration screen that today is a stub). No change to the Web Publique Client and no change to the Broker Back-office.
- **Affected scopes**: Countries and products (a definition is scoped to a country/product/language triple), consent texts (a definition binds exactly one published consent text).
- **Frontend separation**: Unchanged. Administration lives in the back-office; the public app keeps consuming the read-only `GET /countries/:countryCode/products/:productKey/quote-form`.
- **Required feature flags**: None new. Exposure stays governed by the existing `country_quote_enabled` and `product_quote_enabled` flags; this spec does not open anything. A published definition is necessary but not sufficient to expose a public form.
- **Consent and transmission**: A definition is only publishable when it references a **published** consent text whose purpose is `lead_transmission`, and that binding is verified at publish time as well as at read time. Publishing must never be able to put a form in front of a visitor with a draft, retired or missing consent text. The existing runtime check in `publicForm()` stays - it becomes the second line of defence, not the only one.
- **Partner license controls**: Not touched. Eligibility is evaluated at routing, after submission.
- **Audit and data history**: `quote_form.created`, `quote_form.published`, `quote_form.retired` already exist or follow the same writer. Publication is a versioned, audited act carrying the version, the consent text id and version, and the previously published version that was retired. History is never rewritten: publishing v2 retires v1, it does not mutate it.
- **Security and RBAC**: New admin routes under `/admin/quote-form-definitions`. See D1. Every mutating route requires `mfaVerified`, consistent with the rest of the back-office.
- **Routing impact**: None. This spec stops short of submission; it only makes a form reachable.
- **AI impact**: None. No field is generated, suggested or validated by a model.
- **UX/content restrictions**: The administration screen is internal. Field labels authored there are shown to visitors, so the publish path applies the existing forbidden-wording guardrail to every label and helper text: never "Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance".
- **Data minimisation**: A form defines what personal data the platform collects. `sensitivity` already exists per field. See D3.
- **Workflow continuity**: Not interrupted.

## Decisions Proposed

### D1 - Who may author, and who may publish

**Resolved differently during implementation (2026-09-19).** The proposal below was written before
checking `packages/shared/rbac/assurmatch-role-matrix.ts`, which already answers the question:
`compliance_admin` holds `quote_form_definitions:*`, `content_admin` only `quote_form_definitions:read`,
`admin_pays` holds nothing on this resource, and `super_admin` holds everything. That is the same
intent as the proposal - the data-collection surface belongs to compliance - expressed one notch
stricter: `content_admin` reads rather than authors. The matrix is the earlier decision and was left
untouched; the service checks those permissions, and no country-scope branch was written because no
scoped role holds the resource. The proposal is kept below as the reasoning that led there.

Authoring and publishing are split, because they carry different risk.

- **Create / update a draft**: `super_admin`, `content_admin`. This is catalogue work.
- **Publish / retire**: `super_admin`, `compliance_admin`. Publishing decides what personal data the platform collects from the public and binds a consent text to it - that is a data-protection act, not a content act.

`admin_pays` may author and publish **within its country scope only**, reusing the scope resolution the activation checklist already applies. Every other admin role is read-only.

Rationale: giving `content_admin` publish rights would let a content change silently alter the scope of personal data collected under a consent text it did not read. Giving `compliance_admin` sole authoring rights would make routine catalogue work depend on compliance availability. The split keeps the routine path fast and the irreversible path controlled.

**This is the one decision worth a second look** - it encodes who in the organisation owns the data-collection surface.

### D2 - One published definition per (country, product, language)

Publishing a definition **atomically retires** the previously published definition for the same country, product and language. The two writes happen in one transaction; there is never a moment with zero or two published definitions for a triple.

Today `publish()` sets a status and nothing else, so two published versions for the same triple can coexist and `publicForm()` silently picks whichever the array yields first. That is a correctness bug waiting for a second version to be created, and it is the kind that produces an inconsistent public form without any error.

Enforced in the repository transaction rather than by a partial unique index, so the Prisma schema stays the source of truth and `prisma migrate` reports no drift. **This spec therefore needs no migration.**

### D3 - Sensitive fields follow the existing product flag

A definition containing at least one field with `sensitivity: "sensitive"` may be created as a draft, but **may not be published** while `product_sensitive_data_enabled` is closed for that product. The refusal is audited with reason `sensitive_fields_not_enabled`.

Rationale: the flag already exists and defaults to `false`; without this gate it governs nothing, since the form is what actually collects the data.

## Requirements

- **Repository**: `QuoteFormDefinitionsRepository` interface with `MemoryQuoteFormDefinitionsRepository` (test-only) and `PrismaQuoteFormDefinitionsRepository`, following `consent-records.repository.ts`. Registered in `runtimeRepositoryModes()` and covered by `assertRuntimeRepository`, so a memory repository outside `NODE_ENV=test` throws at boot instead of silently losing data.
- **Service**: `QuoteFormDefinitionService` takes the repository. `create`, `publish`, `retire`, `list`, `require` become `async`. `publicForm` keeps its signature. The `validationSchema` column is read and written through (nullable, unused by the current contract) so the repository is not lossy.
- **Publish invariants**, checked in this order and each audited on refusal: referenced consent text exists, is `published`, and has purpose `lead_transmission` (`published_consent_text_missing`); no field label or helper text contains forbidden public wording (`forbidden_public_wording`); sensitive fields allowed for the product (`sensitive_fields_not_enabled`); the actor holds a publishing role and, for `admin_pays`, the country is in scope (`forbidden_role` / `out_of_scope_country`); MFA verified (`mfa_required`).
- **HTTP**: wire the admin controller - `GET /admin/quote-form-definitions` (filterable by country, product, status), `POST /admin/quote-form-definitions`, `POST /admin/quote-form-definitions/:id/publish`, `POST /admin/quote-form-definitions/:id/retire`. Every mutation takes an audited `reason`, as elsewhere in the back-office.
- **Contracts**: `adminQuoteFormDefinitionSchema` already exists and is sufficient for create. Add a list query schema and a read schema exposing `status`, `publishedAt`, `retiredAt` and the resolved consent text version.
- **Admin app**: replace the stub page with a real screen - list by country/product/language/status, create a draft, publish, retire, and a visible statement that publishing exposes the form to visitors and binds the consent text version.
- **Activation checklist**: unchanged in logic, but it now reads persisted definitions, so *Parcours devis* stops being permanently blocked. Its `forms` parameter type follows the service becoming async.
- **Seeds**: the local demo seed already writes definitions to Postgres; once the repository exists it needs no change. Add the same two published definitions to the preprod reference seed so a fresh environment is not born blocked.

## User Scenarios & Testing

1. **Given** a published definition written directly to Postgres and an API process started afterwards, **When** the public form is requested, **Then** it is returned - the current failure mode (`Quote form is not available`) is gone.
2. **Given** a running API with no definition, **When** an admin creates a draft and publishes it, **Then** the public form is immediately available **without restarting the process**, and the journey completes: submission, consent record, routing decision, lead assignment visible in the broker's CRM with the visitor's answers.

   *Corrected during implementation*: this scenario originally said "broker notification in Mailpit". Running it end to end showed that no quote email has ever been delivered - `QuoteNotificationService` writes a `Notification` row as `queued` and enqueues a job that nothing consumes. That is a pre-existing gap outside this spec's scope, now backlog item 0b, and the scenario is stated as what this spec actually delivers rather than left describing something it does not.
3. **Given** a published v1 for CI/auto/fr, **When** v2 is published, **Then** v1 is `retired`, exactly one published definition exists for the triple, and the public form returns v2. **And given** the publish transaction fails midway, **Then** v1 is still published and v2 is not.
4. **Given** a definition referencing a **draft** consent text, **When** publication is attempted, **Then** it is refused with `published_consent_text_missing` and audited; the public surface is never reachable through it.
5. **Given** a definition with a field labelled with forbidden public wording, **When** publication is attempted, **Then** it is refused with `forbidden_public_wording`.
6. **Given** `product_sensitive_data_enabled` closed and a definition containing a `sensitive` field, **When** publication is attempted, **Then** it is refused with `sensitive_fields_not_enabled`; **and when** the flag is opened through the compliance policy path, **Then** publication succeeds.
7. **Given** a `content_admin`, **When** it creates a draft, **Then** it succeeds; **when** it attempts to publish, **Then** it is refused with `forbidden_role`. **Given** an `admin_pays` scoped to CI, **When** it publishes a CI definition, **Then** it succeeds; **when** it publishes an SN definition, **Then** it is refused with `out_of_scope_country`.
8. **Given** `NODE_ENV` is not `test`, **When** the runtime is constructed with the memory repository, **Then** boot throws - the defect this spec fixes cannot silently return.
9. **Given** the runtime Postgres smoke, **When** it seeds its form, **Then** it does so **over HTTP through the admin route**, not in-process - so the smoke exercises the path a real operator uses.

## Validation

- `npm run validate` green; Playwright source tests for the admin screen; unit tests for the publish invariants; runtime HTTP tests for the RBAC and consent-binding refusals; `npm run test:runtime:postgres:docker` green with the smoke seeding over HTTP; `npm run local:health` and `npm run test:web:local` after `launch-local.bat` plus the demo seed, with a manual submission reaching Mailpit.
- **Strengthen the weak assertion that hid this**: `scripts/local-app/local-health.mjs` currently passes "quote form loads" by finding the `Demander un devis` heading, which is present on the unavailable page too. It must assert a form field is rendered.

## Found while implementing, and fixed here

Running the journey end to end in a real browser surfaced two more breaks in the same chain. Both are
in scope because without them publishing a form still changes nothing a visitor or a broker can see.

- **No CORS.** The API never called `enableCors`, so the visitor's browser failed its preflight on
  `POST /quote-requests` while curl and every test passed. `CORS_ORIGINS` was already declared
  mandatory in `docs/preproduction/environments.md` and simply never read. It is now an explicit
  allowlist, credentials off, never `*`, and empty outside `local` unless configured.
- **Answers were thrown away twice.** The public form submitted `answers: {}` regardless of the
  published definition, and the routing service did not carry the answers onto the lead assignment.
  The form now renders the definition's fields and submits them, and every assignment carries them,
  so the broker sees what the visitor actually declared.

## Found while implementing, and deliberately not fixed here

- **Quote emails are never delivered.** `QuoteNotificationService` writes a `Notification` row with
  `emailStatus: "queued"` and enqueues a job on `visitor-quote-notifications`; nothing consumes that
  queue. The visitor confirmation and the broker lead email have never left the platform in any
  environment. The delivery service exists and works for auth emails, so this is wiring - but it is
  a different subsystem from quote form persistence and gets its own spec rather than an unplanned
  worker bolted on at the end of this one.

## Explicit non-goals

- No change to submission, routing, eligibility or the platform's regulated status.
- No dynamic per-product field builder beyond the existing `quoteFormFieldSchema` types.
- No partial unique index on `QuoteFormDefinition` (D2 enforces the invariant transactionally; an index would put the Prisma schema and the database out of sync).
- No AI assistance in authoring fields.
- No migration: the table and every column already exist.
