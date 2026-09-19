# Tasks: Multi-Broker Routing

**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme.
**Status**: implemented and validated on 2026-09-19. `multi_broker_routing_enabled` still ships closed.

- [x] T000 Decisions D1 (shared degressive price, capped), D2 (visitor opt-in) and D3 (max 3) recorded in the spec on 2026-09-19.
- [x] T001 Consent: multi-recipient `recipientCategory`, published consent text per country/product/language, accepted category persisted on `ConsentRecord`, migration `0015_multi_broker_routing` + migrations test. Test: a pre-existing consent record still reads as single-recipient.
- [x] T002 Selector: `selectRoutingCandidates(input, max)` with per-candidate quota re-check; unit tests (cap respected, over-quota partner replaced, exclusive/manual modes untouched).
- [x] T003 Routing service: fan-out, `assignments[]`, single `RoutingDecision` with every selected partner, audited degradation on closed flag and on single-broker consent; callers updated.
- [x] T004 Contracts + admin: `multi_send` mode, `maxRecipients`, decision shape, routing page and decision view.
- [x] T005 Public journey: consent wording, opt-in field (if D2=B), confirmation stating the recipient count; source tests including forbidden wording.
- [x] T006 Billing: implement the D1 option, expose `recipientCount`, rewrite the affected draft-invoice tests.
- [x] T007 Isolation: runtime HTTP tests proving no surface exposes co-recipients; one `lead.assigned` per recipient tenant.
- [x] T008 `npm run validate`, Playwright source tests; tick tasks; update `docs/prd_coverage_map.md`.
