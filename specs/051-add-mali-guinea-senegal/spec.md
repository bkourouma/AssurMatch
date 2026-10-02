# Feature Specification: Add Mali, Guinea and Senegal (waitlist tier)

**Feature Branch**: `051-add-mali-guinea-senegal`
**Created**: 2026-09-30
**Status**: Approved by the maintainer in chat on 2026-09-30 (scope = "Catalogue + liste d'attente", Guinea = `fanaf`).
**Continuous Workflow Eligible**: Yes. No `[NEEDS CLARIFICATION]`.

## Why this spec exists

The maintainer wants Mali (ML), Guinea (GN) and Senegal (SN) added to the AssurMatch country
catalog. Audit of the repository shows:

- **ML and SN** already exist in `scripts/preprod/seeds/reference/countries.json` as `draft`, CIMA, all flags `false`.
- **GN does not exist anywhere** in the reference catalog. Guinea is not a CIMA member, its currency is the
  Guinean franc (GNF, absent from `currencies.json`), and the reference seed only links the CIMA regime.
- The local demo seed (`scripts/local-app/seed-broker-demo.ts`) only knows CI (open) and SN (`internal`, waitlist on).

## Scope decision (approved)

The three countries enter the catalog in the **waitlist tier**: visible on the public country directory as
"waitlist" and able to collect waiting-list registrations, with **no** quote, comparison, broker onboarding,
AI or public country page. This follows Constitution Article III (progressive activation, fail-closed).

- Per-country flags for ML, GN, SN: `country_waitlist_enabled = true`; `country_public_enabled`,
  `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`,
  `country_ai_enabled` = `false`.
- Status stays `draft` in the reference seed (the directory and the waitlist journey are driven by flags, not
  by status).
- Full public activation of any of the three is **out of scope**: it requires accredited brokers, offers and
  the per-country go/no-go checklist (`specs/013-preproduction-launch-readiness/checklists/go-no-go.md`).

## Requirements

- **FR-001**: `countries.json` MUST contain ML, GN, SN with the flags above.
- **FR-002**: GN MUST be `regulatoryFamily: "fanaf"`, currency `GNF`, languages `["fr"]`, timezone `Africa/Conakry`.
  No legal text or regulator name is invented; the regime stays the generic seeded `fanaf` regime.
- **FR-003**: `currencies.json` MUST list `GNF`.
- **FR-004**: `seed-reference.ts` MUST link a country to the seeded regime whose key equals its
  `regulatoryFamily` (today only `cima` is linked), so GN gets the `fanaf` regime. CIMA behaviour is unchanged.
- **FR-005**: The local demo seed MUST create ML and GN in the same waitlist tier as SN, so the three
  countries can be exercised locally.
- **FR-006**: Reference README, runbook and go-no-go wording MUST no longer say "9 CIMA countries" as the
  full catalog (10 countries; 9 CIMA + 1 FANAF).
- **FR-007**: No public country page, quote, comparison, offer, broker, AI or routing path opens for these countries.

## Impacted surfaces

- Database / reference seeds (`scripts/preprod/seeds/reference/*`, `scripts/preprod/seed-reference.ts`)
- Runtime / local launcher demo seed (`scripts/local-app/seed-broker-demo.ts`)
- Documentation (README, runbook)
- **Not impacted**: Web Publique code (the directory is API-driven), Back-office, Backend API code, shared
  packages, Prisma schema (`outside_cima`/`fanaf` already exist in the enum), migrations.

## Acceptance

1. `seed:reference --dry-run` plans 10 countries.
2. After seeding, `GET` public country directory lists ML, GN, SN with `availability: "waitlist"`,
   `quoteEnabled: false`, `comparisonEnabled: false`.
3. A waiting-list registration for ML, GN, SN is accepted; a quote request for them is refused.
4. GN has `regulatoryFamily = fanaf` and `regulatoryRegimeId` set to the `fanaf` regime; other CIMA countries keep the `cima` regime.
5. Unit/integration tests for countries, directory and waitlist stay green.

## Risks

- `seed-reference` overwrites `flags` on existing rows: re-running it in an environment where an admin already
  changed ML/SN flags resets them to the seeded values. This is pre-existing behaviour, documented in the runbook.
- Editorial copy (spec 050) says CI and Senegal are "the two countries open today"; that is outside this spec
  and must be reconciled in spec 050 (Senegal is waitlist-only).
