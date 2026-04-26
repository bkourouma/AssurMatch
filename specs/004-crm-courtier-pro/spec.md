# Feature Specification: CRM Courtier Pro/Enterprise

**Feature Branch**: `004-crm-courtier-pro`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: implementer entierement le CRM courtier Pro/Enterprise dans l'application Back-office Partenaires/Plateforme, sans route CRM dans l'application Web Publique Client.

## Constitutional Scope & Compliance

- **Impacted surfaces**: Back-office Partenaires/Plateforme: yes. Backend API: yes. Shared packages: yes if contracts/RBAC require it. Web Publique Client: no, except strict shared package contract impact with no public route, layout or authenticated dependency.
- **Technical platform role**: The CRM tracks partner lead follow-up only. It does not sell insurance, subscribe, collect premium, issue policy, issue attestation, manage claims or provide binding advice for AssurMatch.
- **Plans and flags**: Access requires a Pro or Enterprise broker plan, `broker_crm_enabled=true`, authenticated broker user, MFA and RBAC. Starter brokers must always be denied.
- **Tenant and RBAC**: A broker user can only access leads assigned to their partner tenant. Owner sees organization leads; Manager sees organization/team leads according to permission; Agent sees only assigned leads unless granted organization permission; Read-only can read but never mutate.
- **Data separation**: Internal CRM notes, internal documents, tasks, reminders, proposals and audit context are never visible in the Web Publique Client.
- **AI scope**: Only non-mandatory foundations are included for future AI summary, next action suggestion, relaunch message assistance and loss analysis. No official recommendation, personalized advice or automated commercial decision is allowed.

## User Stories & Acceptance Criteria

### User Story 1 - Acceder au CRM Pro/Enterprise (P1)

**Independent Test**: Pro and Enterprise actors with `broker_crm_enabled` can open CRM; Starter, disabled flag and unauthenticated actors are refused and audited.

1. Given a Pro broker owner with MFA, When opening the CRM, Then access is granted to organization leads.
2. Given a Starter broker, When opening any CRM route or API, Then access is refused and audited.
3. Given `broker_crm_enabled=false`, When any broker opens CRM, Then access is refused and no lead data is returned.

### User Story 2 - Piloter les leads en Kanban et liste (P1)

**Independent Test**: Connected broker sees only scoped leads in Kanban/list with filters and search according to permissions.

1. Given assigned leads for two broker tenants, When broker A lists CRM leads, Then only broker A scoped leads are returned.
2. Given filters by status, product, country, advisor, period, urgency and source, When listing leads, Then results remain tenant-scoped and paginated.
3. Given search by name, phone, email or reference, When actor lacks sensitive search permission, Then phone/email search is refused or masked.

### User Story 3 - Gerer le detail et pipeline (P1)

**Independent Test**: Status transitions are controlled, historized and audited; invalid statuses or read-only actors are refused.

1. Given a mutable lead, When an authorized actor changes status, Then the status changes, history is appended and audit is written.
2. Given status `perdu`, When actor submits the transition, Then a controlled loss reason is required.
3. Given `gagne`, When actor marks won, Then the event remains CRM tracking only and does not create policy, attestation or contract.

### User Story 4 - Notes, taches, rappels et assignation interne (P1)

**Independent Test**: Notes/tasks/reminders/internal reassignment stay within same partner tenant and are blocked for read-only or cross-tenant users.

1. Given a Manager, When assigning a lead to an advisor, Then advisor belongs to the same broker tenant.
2. Given an Agent, When reading CRM, Then only assigned leads are visible unless role permission permits organization scope.
3. Given a Read-only user, When creating note/task/reminder, Then action is refused and audited.

### User Story 5 - Documents, proposition et contestation (P2)

**Independent Test**: Internal documents and quote references are scoped, non-contractual and never public.

1. Given document permission, When adding an internal document, Then it is attached to the lead and marked internal-only.
2. Given a CRM proposal/reference, When saved, Then it is stored as non-contractual follow-up metadata.
3. Given a billed or invalid lead, When disputed, Then controlled dispute reason and audit are required.

### User Story 6 - Dashboard, export et notifications (P2)

**Independent Test**: Dashboard/export/notifications reflect only authorized scope and audit sensitive actions.

1. Given scoped leads, When opening dashboard, Then counters by pipeline status are organization-scoped and filtered.
2. Given export permission, When exporting CSV, Then rows and columns are limited by role, scope and audit.
3. Given no export permission, When exporting, Then no sensitive data is returned and refusal is audited.

## Functional Requirements

- **FR-001**: The CRM MUST be exposed only in the Back-office Partenaires/Plateforme.
- **FR-002**: The CRM MUST require Pro or Enterprise plan and `broker_crm_enabled`.
- **FR-003**: Starter brokers MUST never access CRM APIs, routes, Kanban, tasks, reminders, assignment, notes, dashboard or exports.
- **FR-004**: Lead list MUST support Kanban and table views with filters for status, product, country, advisor, period, urgency and source.
- **FR-005**: Search MUST support prospect name, phone, email and lead reference according to permission and PII rules.
- **FR-006**: Lead detail MUST include pipeline status, contact data allowed for role, answers, internal notes, tasks, reminders, documents, proposal references and history.
- **FR-007**: Pipeline statuses MUST be controlled: nouveau, accepte, contact_tente, contacte, qualifie, documents_demandes, devis_en_preparation, devis_envoye, negociation, gagne, perdu, doublon, injoignable, hors_cible, rejete_conteste.
- **FR-008**: Every status change MUST append immutable history and AuditLog.
- **FR-009**: Internal notes and internal documents MUST never be exposed publicly.
- **FR-010**: Internal assignment/reassignment MUST stay inside the same broker tenant.
- **FR-011**: Read-only actors MUST be unable to mutate CRM resources.
- **FR-012**: Agent actors MUST see only assigned leads unless they have explicit organization-scope permission.
- **FR-013**: Manager/Owner visibility MUST follow broker role permissions.
- **FR-014**: CSV export MUST be permission-limited, scope-limited, volume-limited and audited.
- **FR-015**: Won/lost/duplicate/unreachable/out-of-target/disputed outcomes MUST use controlled statuses and reasons when applicable.
- **FR-016**: Quote proposal/reference records MUST be non-contractual and MUST NOT trigger policy, attestation, subscription or payment.
- **FR-017**: Future AI foundations MUST stay optional, flag-gated and auditable without model calls by default.

## Non-Functional Requirements

- **NFR-001**: Lists and dashboard MUST be paginated or bounded.
- **NFR-002**: RBAC and tenant isolation MUST be tested for read, write, export and document actions.
- **NFR-003**: Audit contexts MUST minimize PII.
- **NFR-004**: Broker CRM UI MUST be usable on desktop and mobile without public-app coupling.
- **NFR-005**: Implementation MUST not introduce public CRM routes.

## Key Entities

BrokerTenant, BrokerUser, LeadAssignment, BrokerCrmLead, BrokerCrmPipelineHistory, BrokerCrmNote, BrokerCrmTask, BrokerCrmReminder, BrokerCrmInternalAssignment, BrokerCrmDocument, BrokerCrmProposal, BrokerCrmDispute, BrokerCrmNotification, BrokerCrmExportEvent, AuditLog, FeatureFlag and future BrokerCrmAiAssistRequest.

## Success Criteria

- **SC-001**: 100% of CRM access tests deny Starter and disabled-flag access.
- **SC-002**: 100% of cross-tenant read/write/export/document attempts return no sensitive data and are audited.
- **SC-003**: Pro/Enterprise owner can move a scoped lead through pipeline, add note/task/reminder and see history.
- **SC-004**: Read-only actor can read allowed scope but cannot mutate.
- **SC-005**: No public app route, page or test exposes CRM.
