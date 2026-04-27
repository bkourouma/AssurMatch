# Runbook — Activate a partner

## Prerequisites

- Partner imported via `operational-import-partners.md` with full audit trail.
- License valid, dates current, scopes authorized.
- Accreditation documents present.
- Owner advisor enrolled with MFA.
- Per-scope go/no-go signed.

## Steps

Set the partner status to `active` via the admin tooling (or the Prisma/back-office surface, depending
on what's exposed). Audit `partner.activated` records the change.

## Rollback

Set status back to `suspended` or `retired`. Routing immediately stops considering the partner.
