# Implementation Plan: Multi-Broker Routing

**Spec**: `specs/042-multi-broker-routing/spec.md`
**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme.
**Blocked on**: decisions D1 (billing rule) and D2 (platform-decided vs visitor opt-in). Steps 3 and 6 below cannot be written before they are answered.

## Sequencing rationale

The consent gate comes before the fan-out on purpose. If the selector shipped first, a flag flip would be enough to fan out requests consented under the singular wording - the exact failure this spec exists to prevent. Building the gate first makes that impossible even in an intermediate state.

1. **Consent foundation.** New `recipientCategory` value, published consent text per country/product/language, `ConsentRecord` carries the accepted category. Migration `0015_multi_broker_routing`. Tests assert an old record still reads as single-recipient.
2. **Routing selector.** `selectRoutingCandidates(input, max)` on top of the existing `ranking`; per-candidate quota re-check; unit tests including "top-ranked partner over quota is replaced".
3. **Routing service fan-out.** `route()` returns `LeadAssignmentRecord[]`; one `RoutingDecision` with `selectedPartnerTenantIds`; degradation paths (`multi_broker_routing_disabled`, `consent_covers_single_broker`) audited. Callers (`quote-submission`, manual routing, reassignment) updated to the array shape.
4. **Contracts + admin rule.** `multi_send` mode, `maxRecipients`, decision shape; admin routing page and routing decision view.
5. **Public journey.** Consent wording, opt-in field if D2=B, confirmation copy stating the number of recipients.
6. **Billing.** Implement the D1 option; `recipientCount` exposed to `BillableLeadPolicy`; draft invoice tests rewritten against the chosen rule.
7. **Isolation and webhooks.** Assert no surface leaks co-recipients; confirm spec 039 emits one `lead.assigned` per recipient tenant.
8. `npm run validate`, Playwright source tests, migration list test.

## Risks

- **Silent retroactive consent change** - mitigated by step 1 preceding step 3, and by scenario 2 of the spec.
- **Caller breakage** from `assignment` becoming `assignments` - contained by returning a one-element array in single-send so every caller has one uniform shape.
- **Partner perception** - a partner discovering it competes on every lead may renegotiate; this is a commercial consequence of D1/D2, not a technical one, and belongs in the partner contract before the flag is opened.
- **Billing disputes** - option A maximises them; whichever option is chosen, the dispute credit path from spec 037 already exists.
