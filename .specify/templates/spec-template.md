# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`
**Created**: [DATE]
**Status**: Draft
**Input**: User description: "$ARGUMENTS"

## Constitutional Scope & Compliance *(mandatory)*

<!--
  ACTION REQUIRED: Every AssurMatch feature must explain how it respects
  .specify/memory/constitution.md. Mark items N/A only with a short reason.
-->

- **Technical platform role**: [How this feature avoids direct sale, direct subscription, premium collection in V1, contract issuance, attestation issuance and binding personalized advice]
- **Affected scopes**: [Countries, products, partners, plans, roles, portals, modules]
- **Required feature flags**: [Global, country, product, partner, plan and AI flags touched]
- **Consent and transmission**: [Whether ConsentRecord is required before any lead transmission; N/A reason if not]
- **Partner license controls**: [License verification, expiration blocking and responsible broker display]
- **Audit and data history**: [AuditLog, createdAt/updatedAt/createdBy, validity periods, change history]
- **Security and RBAC**: [Roles, tenant isolation, MFA impact, export limits, PII masking, rate limiting]
- **Routing impact**: [Lead eligibility, quotas, configurable rules, non-routable states]
- **AI impact**: [AI module usage, flags, prompt/result audit, PII minimization, human validation, N/A reason]
- **UX/content restrictions**: [Allowed CTA wording, indicative offer wording, sponsored offer disclosure, forbidden phrases avoided]

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories must be prioritized as independently testable user
  journeys. Each story must include Given/When/Then acceptance scenarios,
  including applicable constitutional blockers such as no consent, expired
  license, disabled country/product, unauthorized broker, disabled AI, expired
  offer, unauthorized export and non-routable lead.
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently and what value it delivers]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [blocked or edge state], **When** [action], **Then** [safe outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [constitutional blocker], **When** [action], **Then** [safe outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [constitutional blocker], **When** [action], **Then** [safe outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: Include every constitutional edge case that can affect this
  feature. Delete only with an explicit N/A reason.
-->

- What happens when the relevant country is disabled or waitlist-only?
- What happens when the relevant product is disabled, quote-disabled or requires manual review?
- What happens when consent is missing, expired or not scoped to the receiving broker?
- What happens when the broker is inactive, unauthorized for the country/product or over quota?
- What happens when the broker license is expired, suspended or invalid?
- What happens when an offer is expired, sponsored or only indicative?
- What happens when AI is disabled globally, by country, by product, by partner or by plan?
- What happens when a user lacks permission to view, mutate or export the resource?
- What happens when public input is spammy, rate-limited, malformed or duplicate?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: Functional requirements must be specific, testable and
  constitution-aware. Use MUST for mandatory behavior. Mark unclear decisions
  with NEEDS CLARIFICATION.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability]
- **FR-002**: System MUST enforce applicable feature flags before exposing or executing [capability]
- **FR-003**: System MUST verify RBAC, tenant scope and resource ownership for [resource/action]
- **FR-004**: System MUST create AuditLog entries for [sensitive actions]
- **FR-005**: System MUST persist required data history for [entities/events]
- **FR-006**: System MUST block direct sale, direct subscription, contract issuance, attestation issuance and V1 premium collection where applicable
- **FR-007**: System MUST collect valid ConsentRecord before transmitting any lead where lead transmission is in scope
- **FR-008**: System MUST block routing to inactive, unauthorized or expired-license brokers where routing is in scope
- **FR-009**: System MUST mark offers and prices as indicative where public comparison is in scope
- **FR-010**: System MUST ensure AI outputs are assistance only, audited and disabled by scope where AI is in scope

*Example of marking unclear requirements:*

- **FR-011**: System MUST retain ConsentRecord evidence for [NEEDS CLARIFICATION: retention period not specified]
- **FR-012**: System MUST notify brokers through [NEEDS CLARIFICATION: email, WhatsApp, SMS or in-app notification]

### Key Entities *(include if feature involves data)*

- **Country**: [Activation, waitlist, comparison, quote and AI flags]
- **Product**: [Activation, quote, comparison, document, sensitive data, manual review and AI flags]
- **Offer**: [Indicative offer data, validity period, sponsorship status]
- **QuoteRequest**: [Visitor request before or during consent and routing]
- **Lead**: [Unique lead identifier, status, routing outcome, assigned broker if any]
- **Partner/Broker**: [Partner status, plan, authorized countries/products, quotas]
- **PartnerLicense**: [License status, country/product scope, expiration date]
- **ConsentRecord**: [Consent purpose, text version, recipient, timestamp and scope]
- **AuditLog**: [Actor, action, target, context, result and correlation id]
- **FeatureFlag**: [Global, country, product, partner, plan and AI activation]
- **AIInteraction**: [Prompt metadata, minimized input, output, guardrail result and human validation]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable outcomes that are technology-agnostic and
  include compliance outcomes for regulated or sensitive features.
-->

### Measurable Outcomes

- **SC-001**: [Measurable user or business outcome]
- **SC-002**: [Measurable reliability, latency or throughput outcome]
- **SC-003**: [Measurable compliance outcome, e.g., 100% of lead transmissions have ConsentRecord and AuditLog]
- **SC-004**: [Measurable safety outcome, e.g., 0 unauthorized cross-broker lead reads in RBAC tests]

## Assumptions

<!--
  ACTION REQUIRED: Capture reasonable defaults chosen when the feature
  description did not specify certain details.
-->

- [Assumption about target users, countries, products or plans]
- [Assumption about regulatory status, partner responsibility or consent scope]
- [Assumption about data retention, feature flag defaults or rollout scope]
- [Dependency on existing system/service/module]
