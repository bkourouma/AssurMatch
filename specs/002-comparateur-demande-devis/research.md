# Research: Comparateur public et demande de devis

## Decision: extend the existing modular NestJS monolith

**Rationale**: The 001 foundation already provides `countries`, `products`, `partners`, `partner-licenses`, `feature-flags`, `consent`, `routing`, `notifications`, `audit-logs`, `ai`, Redis and queues. Extending those boundaries and adding `offers`, `quote-forms`, `quote-requests`, `prospects` and `leads` keeps the business decisions visible and testable without premature service extraction.

**Alternatives considered**: A separate comparator service was rejected because it would duplicate feature flag, consent, audit and broker eligibility rules. A single `public-comparator` module was rejected as the main design because it would hide quote, offer, lead and routing responsibilities behind one broad module.

## Decision: use shared Zod DTOs plus OpenAPI contract

**Rationale**: The repository already uses `packages/shared/contracts` with Zod schemas. Adding quote and offer contracts there lets backend, public app, admin app, broker app and contract tests share validation terms and content-safety constraints.

**Alternatives considered**: Controller-local DTOs were rejected because public, admin and broker surfaces need consistent schemas. OpenAPI-only schemas were rejected because runtime validation is still needed at public endpoints.

## Decision: model offers, forms, requests, prospects and assignments in PostgreSQL

**Rationale**: Offers, quote requests, consent linkage, prospect fingerprints, lead assignments and routing decisions are durable regulated evidence. PostgreSQL/Prisma is the source of truth and supports audit, retention, dispute resolution and admin operations.

**Alternatives considered**: Redis-only quote storage was rejected because lead and consent evidence must be durable. Storing all dynamic quote answers as relational columns was rejected because country/product forms need controlled variation; JSON payloads with versioned form definitions are safer for V1.

## Decision: fail closed for public exposure and transmission

**Rationale**: The constitution requires no public exposure of unavailable countries/products/offers and no transmission when flags, consent, license or eligibility cannot be verified. Services must treat unknown, stale or missing state as blocked for public display and routing.

**Alternatives considered**: Best-effort public display with warnings was rejected because it risks exposing expired offers or inactive markets. Optimistic routing with post-checks was rejected because it could notify an ineligible broker.

## Decision: Redis supports cache, rate limits, anti-spam, duplicates and routing locks

**Rationale**: Public endpoints need low-latency protection and idempotency. Redis is already part of the foundation for cache, flags, queues and locks. Keys will use non-reversible hashes and short TTLs for public protections.

**Alternatives considered**: Database-only rate limiting and duplicate checks were rejected because they add avoidable write load to public endpoints. Raw email/phone Redis keys were rejected because they violate PII minimization.

## Decision: BullMQ handles notifications, optional AI and operations review

**Rationale**: Public quote submission must not wait for visitor email/WhatsApp delivery, broker delivery or AI summary generation. BullMQ gives retryable, observable asynchronous work through the existing queue direction.

**Alternatives considered**: Synchronous notification delivery was rejected because it makes public endpoints slow and brittle. Running AI inline was rejected because AI is optional, non-blocking and must be audited separately.

## Decision: deterministic single-broker routing for V1

**Rationale**: The spec excludes advanced multi-broker routing. V1 routing selects at most one eligible broker after consent using deterministic checks: active partner, authorization, valid license, capacity/quota and stable ordering.

**Alternatives considered**: Multi-broker fanout, auctions, sponsored routing and AI-based broker selection were rejected because they are outside scope and increase regulatory risk.

## Decision: consent text uses intended recipient category before assignment

**Rationale**: At submission time the specific broker may not be known until eligibility is evaluated. The consent text and record should identify the planned category, for example `courtier_partenaire_eligible` for the selected country/product, then the actual broker is stored on `LeadAssignment` and shown after routing.

**Alternatives considered**: Asking consent after broker selection was rejected because routing evaluation must not transmit before consent. Creating consent with a blank recipient was rejected because the constitution requires an intended recipient.

## Decision: AI summary is assistance-only and optional

**Rationale**: A summary can help support or the assigned broker but cannot recommend an offer, price, broker, eligibility, acceptance or refusal. It must be skipped when any applicable AI flag, module, partner/plan visibility or guardrail is disabled.

**Alternatives considered**: AI ranking, AI routing or AI personalized advice were rejected as constitutional violations for this feature.

## Decision: admin offer management is in scope

**Rationale**: Public comparison cannot be safe unless offers have validation state, validity windows, status, sponsor labels and audit history. If existing admin screens are insufficient, this feature must plan the missing offer admin endpoints and views.

**Alternatives considered**: Seed-only offers were rejected because expired/non-validated public exposure must be operationally manageable. Insurer API synchronization was rejected because it is explicitly out of scope.
