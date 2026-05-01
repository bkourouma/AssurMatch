# Research: Secure Partner License Offer Import

## Decision: JSON-only primary import for this feature

**Rationale**: JSON supports nested partners, users, licenses, coverage and offers without fragile CSV conventions. The user allowed CSV only if simple and safe; it is safer to defer CSV.

**Alternatives considered**: CSV was rejected for now because nested licenses/offers/users would require multi-file joins and create avoidable data integrity risk.

## Decision: Dry-run default with explicit `--apply`

**Rationale**: Partner/license/offer imports are sensitive. Default non-write behavior prevents accidental mutation during validation, checksum calculation or review.

**Alternatives considered**: Prompting interactively was rejected because CI/operator scripts need deterministic non-interactive behavior.

## Decision: Fake sample data only

**Rationale**: The repository must not contain real partner/license/contact/offer data. Requiring `metadata.fakeData=true` and test/example domains keeps committed samples safe.

**Alternatives considered**: Allowing arbitrary data locally was rejected because it would normalize unsafe examples and complicate secret scanning.

## Decision: Store abstraction for tests

**Rationale**: Idempotency and audit behavior can be proven quickly without needing a live database. The CLI uses a Prisma store for real local operator runs.

**Alternatives considered**: Testing only through Prisma was rejected because it would slow the suite and require external services for basic validation.
