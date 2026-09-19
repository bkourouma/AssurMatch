# Feature Specification: Multi-Broker Routing

**Feature Branch**: `042-multi-broker-routing`
**Created**: 2026-09-14
**Status**: Validated - decisions D1/D2/D3 recorded 2026-09-19 (see "Decisions Recorded")
**Validation State**: Approved for implementation. `multi_broker_routing_enabled` still ships `false`: implementing the feature does not activate it, and opening it stays an audited compliance-policy action.
**Continuous Workflow Eligible**: Yes, now that the consent and billing ambiguities are resolved.

## Why this spec exists

`multi_broker_routing_enabled` has existed as a closed flag since the PRD (§9.1) with no implementation behind it. Unlike payments, e-signature, policy issuance, claims and the insurer API, it does **not** change AssurMatch's regulated status: transmitting a request to several eligible brokers is still pure intermediation-free mise en relation. It is therefore decidable without a regulatory opinion - but it is **not** decidable without a data-protection decision, because today's consent text is singular.

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Unchanged. AssurMatch still transmits a request to eligible brokers and never sells, advises, prices or commits. Sending to several brokers does not make the platform a broker.
- **Impacted application(s)**: Backend API (routing, leads, consent, billing), database / Prisma / migrations, shared packages, Web Publique Client (consent wording and confirmation), Back-office Plateforme (routing rule admin, routing decision view), Broker Back-office (a lead shows whether it is shared and with how many partners - see D1; never with whom).
- **Affected scopes**: Countries and products (the routing rule is already scoped that way), partner tenants (one assignment each), consent texts (a new version per country/product/language).
- **Frontend separation**: Unchanged. The only public change is consent wording and confirmation copy.
- **Required feature flags**: `multi_broker_routing_enabled` (global, default `false`, sensitive - only the audited compliance policy path can open it). With the flag closed, a `multi_send` rule degrades to single-send and records why; nothing breaks.
- **Consent and transmission**: **This is the heart of the feature.** Today's consent says "transmise a **un** courtier partenaire eligible" (`apps/public/app/components/quote-form.tsx`), and `ConsentText.recipientCategory` is `courtier_partenaire_eligible`. A request consented under that wording MUST NEVER be fanned out. Multi-send requires a new published consent text whose `recipientCategory` is `plusieurs_courtiers_partenaires_eligibles`, and the routing service must verify the quote's own `ConsentRecord` against it at routing time - not at form-render time. Consent given yesterday cannot be re-interpreted by a flag flipped today.
- **Partner license controls**: Unchanged and applied per recipient. Every partner in the fan-out passes the full `BrokerEligibilityPolicy` (country, product, licence, status, quota) independently. A partner whose monthly quota is exhausted is excluded from the fan-out, not carried by the others.
- **Audit and data history**: One `RoutingDecision` per quote carrying every selected partner plus every exclusion reason; one `LeadAssignment` per recipient; one `lead.assigned` webhook per recipient (spec 039 already scopes those per tenant). The number of recipients and the consent version used are audited on the decision.
- **Security and RBAC**: No new route beyond the routing-rule admin already covered by spec 031. Cross-tenant isolation: assignments are separate rows; a partner sees `isShared` and `recipientCount` on its own lead (required by D1 to justify the shared price) and never the identity of any co-recipient.
- **Routing impact**: This *is* the routing change. Eligibility is never relaxed: multi-send only widens how many *already eligible* partners are selected, it never selects an ineligible one.
- **AI impact**: None. AI never decides the fan-out (Constitution: AI must not take a regulated routing decision alone).
- **UX/content restrictions**: The visitor must be told plainly how many brokers may contact them, before submitting. Never "Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", and no promise that several brokers guarantees a better price.
- **Workflow continuity**: Interrupted by design until the decisions below are recorded.

## Decisions Recorded

### D1 - Billing rule: shared degressive price, capped

A request sent to N brokers produces N `LeadAssignment` rows, and `BillableLeadPolicy` (spec 037) evaluates per assignment. Billing each recipient at full price was rejected: a shared lead is objectively worth less than an exclusive one, so full price would manufacture disputes by design. Billing only the first responder was rejected too: it rewards speed over quality (accept in ten seconds without reading and you win the billing) and leaves the platform with the cost of a fan-out nobody answered.

**Rule**: when `recipientCount > 1`, the effective per-lead price is `perLeadPrice x sharedLeadPriceMultiplier`.

- `sharedLeadPriceMultiplier` lives on `BillingPlanPrice` (per plan and country), range `0.1`-`1.0`, default `0.5`.
- **Cap**: the total billed across all recipients of one request never exceeds `perLeadPrice x 2`. When `recipientCount x multiplier > 2`, the effective multiplier is lowered to `2 / recipientCount`.
  - 3 recipients at 0.5 -> each pays 50%, the platform earns 1.5x the exclusive price.
  - 5 recipients at 0.5 -> capped: each pays 40%, the platform earns exactly 2x.

The cap is the load-bearing part. Without it, widening the fan-out becomes a revenue lever pointed at the partners; with it, no request can ever be worth more than twice its exclusive value, so there is no billing incentive to fan out wider than the product justifies.

**Consequence on partner transparency** (this corrects the isolation rule stated above): a partner billed a shared price must be told the lead is shared, otherwise the reduced price is unexplainable and the invoice indefensible. The lead assignment therefore exposes `isShared` and `recipientCount` to its own partner. The **identities** of the co-recipients remain hidden everywhere - that is competitive information and no surface exposes it.

Dispute handling is unchanged: the accepted-dispute credit from spec 037 already covers a shared lead that turns out to be junk.

### D2 - Visitor opt-in

The visitor decides. The quote form carries an explicit, **unticked** choice: "Je souhaite etre rappele par plusieurs courtiers partenaires (jusqu'a 3)". A visitor who leaves it unticked is single-sent even under a `multi_send` rule. This makes the consent specific and freely given rather than bundled into the general transmission consent.

### D3 - Maximum recipients

Default `3`, hard cap `5`, configurable per routing rule.

## Requirements

- **Contracts**: add `multi_send` to `routingRuleModes`; add `maxRecipients` (2-5, default 3) to the routing rule create/update/read schemas; add `selectedPartnerTenantIds: string[]` and `recipientCount` to the routing decision; add the multi-recipient consent category; add `multiBrokerAccepted: boolean` (default `false`) to the public quote consent payload; add `sharedLeadPriceMultiplier` to the billing plan price; expose `isShared`/`recipientCount` on the broker lead summary.
- **Consent**: a new published `ConsentText` version per country/product/language with `recipientCategory = "plusieurs_courtiers_partenaires_eligibles"`. `ConsentRecord` stores the recipient category actually accepted. Migration `0015_multi_broker_routing`.
- **Routing**: `selectRoutingCandidates(input, max)` reusing the existing `ranking` from `selectRoutingCandidate` - the first `min(max, ranking.length)` eligible partners, each re-checked against its own quota. `QuoteRoutingService.route()` returns `assignments: LeadAssignmentRecord[]` (single-send returns an array of one, so callers stay uniform).
- **Consent gate**: before any fan-out, the service checks the quote's recorded consent and refuses to multi-send when the accepted category is the singular one; it degrades to single-send with reason `consent_covers_single_broker` and audits it. Same degradation when the flag is closed (`multi_broker_routing_disabled`) or when the visitor declined (`visitor_declined_multi_broker`).
- **Billing**: `BillableLeadPolicy` / `DraftInvoiceService` apply the D1 shared multiplier and its cap; the draft invoice shows shared leads on their own line so the reduced price is visible.
- **Public app**: unticked opt-in field stating the maximum, and a confirmation page that says how many brokers received the request.
- **Admin app**: the routing page can select `multi_send` and set `maxRecipients`; the routing decision view lists every selected partner.
- **Broker app**: a shared lead is labelled as shared with its recipient count, never with co-recipient identities.

## User Scenarios & Testing

1. **Given** `multi_broker_routing_enabled` closed and a `multi_send` rule, **When** a quote is routed, **Then** exactly one assignment is created, the decision reason is `multi_broker_routing_disabled`, and the visitor journey is unchanged.
2. **Given** the flag open, a `multi_send` rule with `maxRecipients=3`, and **a consent record accepted under the singular text**, **Then** only one assignment is created with reason `consent_covers_single_broker` - the historical consent is never re-interpreted.
3. **Given** the flag open, the multi-recipient consent, and 5 eligible partners with `maxRecipients=3`, **Then** exactly 3 assignments exist, for the 3 top-ranked partners, each with its own `lead.assigned` webhook, and the decision records the 3 ids plus the 2 non-selected.
4. **Given** one of the 3 top-ranked partners has an exhausted monthly quota, **Then** it is excluded with its own reason and the next eligible partner takes its place.
5. **Given** a fan-out to 3 partners, **When** partner A opens its CRM, **Then** the lead is labelled shared with `recipientCount: 3`, and no API response anywhere reveals the identity of B or C.
6. **Given** a fan-out to 3 with `perLeadPrice = 2000` and `sharedLeadPriceMultiplier = 0.5`, **Then** each recipient's draft bills 1000 for that lead; **given** a fan-out to 5, **Then** the cap lowers each to 800 so the request never exceeds 4000 in total.
7. **Given** a visitor who leaves the opt-in unticked, **Then** the request is single-sent even under a `multi_send` rule, with reason `visitor_declined_multi_broker`.

## Validation

- `npm run validate` green; public/admin source tests; routing unit tests for the selector; runtime HTTP tests covering the flag-closed, consent-singular, quota-exclusion and isolation scenarios; migration list test updated.

## Explicit non-goals

- No change to eligibility, licences or the platform's regulated status.
- No exposure of co-recipient **identities** to partners, in any surface (the count is exposed, by D1).
- No AI involvement in choosing recipients.
- No retroactive re-routing of already-transmitted requests.
