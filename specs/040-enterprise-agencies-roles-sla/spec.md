# Feature Specification: Enterprise Agencies, Custom Roles, SLA And Broker Branding

**Feature Branch**: `040-enterprise-agencies-roles-sla`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; Enterprise capabilities are plan-gated and change no regulated behaviour)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Agencies, custom roles, SLA targets and branding organise a partner's own team inside the back-office. They never change who is eligible for a lead, how routing ranks partners, what a prospect sees, or who the technical operator is.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Broker Back-office (agencies, roles, SLA, branding), Back-office Plateforme (SLA per partner). **The public app is deliberately untouched**: white-label branding stays inside the broker back-office, because the public comparator must keep presenting AssurMatch as the technical platform (Principle I) - a white-labelled public site would misrepresent the operator.
- **Affected scopes**: Partner tenants (agencies, roles, SLA, branding are tenant-scoped), broker users (agency membership and custom role), plans (Enterprise only for agencies and custom roles).
- **Frontend separation**: Broker routes under `/broker/enterprise/...`; the admin only reads SLA compliance. No public route.
- **Required feature flags**: `broker_crm_enabled` for CRM-linked views; Enterprise capabilities are plan-gated (`partnerPlan === "enterprise"`), not flag-gated, and remain invisible for Starter and Pro.
- **Consent and transmission**: No prospect data is introduced. Agency assignment reuses the lead's existing tenant scope; nothing crosses tenants.
- **Partner license controls**: Unchanged - agencies do not create new eligibility. A lead stays bound to the tenant that routing selected; an agency is an internal grouping only.
- **Audit and data history**: Agency, custom role, SLA and branding changes are audited with actor, reason and before/after values, and persisted (migration `0014_enterprise_agencies`).
- **Security and RBAC**: MFA required. Managing agencies, roles, SLA and branding requires `broker_crm:*` (owner) on an Enterprise tenant. A custom role can only grant permissions the platform already defines for broker roles and can never exceed the member's base role: the effective permission set is the intersection of the custom grant with the allowed broker permission catalogue, so a custom role cannot escalate to admin capabilities.
- **Routing impact**: None.
- **AI impact**: None.
- **UX/content restrictions**: Broker branding may set a display label and colour for the broker portal only; it must keep the "plateforme technique AssurMatch" mention visible. Never regulated wording.
- **Workflow continuity**: Standard.

## Requirements

- Contracts: agency, agency membership, custom role (permissions subset), SLA target and compliance, broker branding.
- Prisma models `PartnerAgency`, `PartnerCustomRole`, `PartnerBranding` + SLA fields + migration `0014_enterprise_agencies`; repositories (memory/Prisma).
- `EnterpriseAgenciesService`: create/list/update agencies, assign a broker user to an agency, all Enterprise-gated and tenant-bound.
- `CustomRolesService`: create/list/update tenant custom roles restricted to the broker permission catalogue; `effectivePermissions(actor)` intersects the grant with what broker roles may hold.
- `PartnerSlaService`: set the tenant SLA target (first action minutes), compute compliance (leads answered within target / total) for the broker and for the admin.
- `BrokerBrandingService`: display label and colour for the broker portal, with the platform mention enforced.
- HTTP: `GET|POST|PATCH /broker/enterprise/agencies`, `POST /broker/enterprise/agencies/:id/members`, `GET|POST|PATCH /broker/enterprise/roles`, `GET|PUT /broker/enterprise/sla`, `GET|PUT /broker/enterprise/branding`, `GET /admin/partners/sla`.
- Broker UI: `/enterprise` page (agencies, roles, SLA, branding) shown only for Enterprise; admin partners page shows SLA compliance.

## User Scenarios & Testing

1. **Given** a Pro tenant, **When** it calls any `/broker/enterprise/...` route, **Then** 403 with reason `plan_enterprise_required` and an audited refusal.
2. **Given** an Enterprise owner, **When** it creates an agency and assigns a member, **Then** both are audited, tenant-bound, and another tenant can never read or modify them (404/403).
3. **Given** a custom role requesting `users:*` or `broker_crm:*` beyond the broker catalogue, **Then** the disallowed permissions are rejected and the stored grant contains only allowed broker permissions.
4. **Given** an SLA target of 60 minutes and leads answered in 30 and 120 minutes, **Then** compliance reports 50% for the tenant and the admin view shows the same figure.
5. **Given** branding with a label, **Then** the broker portal exposes it together with the AssurMatch platform mention; the public app never reads it.

## Validation

- `npm run validate` green; broker and admin source tests; runtime HTTP tests for agencies, roles, SLA and branding; migration list test updated.
