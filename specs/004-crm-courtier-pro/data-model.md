# Data Model: CRM Courtier Pro/Enterprise

## LeadAssignment

Existing assignment from routing. CRM uses it as the immutable tenant anchor.

Additional service-level fields:
- `crmStatus`: controlled pipeline status.
- `urgency`: low, normal, high, urgent.
- `source`: comparator, quote_request, manual_import, partner_referral, support.
- `assignedAdvisorId`: broker user inside same `partnerTenantId`.
- `crmUpdatedAt`: last CRM mutation timestamp.

## BrokerCrmPipelineHistory

- `id`
- `leadAssignmentId`
- `partnerTenantId`
- `actorId`
- `previousStatus`
- `nextStatus`
- `reason`
- `occurredAt`
- `createdAt`

Validation: `nextStatus` must be one of the standard pipeline statuses; loss/dispute transitions require controlled reason.

## BrokerCrmNote

Internal-only note for authorized broker users.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `authorId`, `body`, `createdAt`.

Validation: never exposed to public app; read-only users cannot create.

## BrokerCrmTask

Commercial task.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `assigneeId`, `title`, `dueAt`, `completedAt`, `createdById`, `createdAt`.

Validation: assignee must belong to same broker tenant.

## BrokerCrmReminder

Reminder tied to a lead.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `assigneeId`, `remindAt`, `message`, `createdById`, `createdAt`.

## BrokerCrmDocument

Internal or prospect-provided document metadata.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `storageKey`, `label`, `visibility`, `uploadedById`, `createdAt`.

Validation: `visibility=internal` is never public; prospect-provided access remains permission-gated.

## BrokerCrmProposal

Non-contractual proposal or quote reference.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `reference`, `amountIndicative`, `currency`, `notes`, `createdById`, `createdAt`.

Validation: must stay non-contractual and must not trigger policy issuance.

## BrokerCrmDispute

Lead billing/invalidity contest.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `reason`, `comment`, `status`, `createdById`, `createdAt`.

## BrokerCrmAiAssistRequest

Future AI foundation only.

Fields: `id`, `leadAssignmentId`, `partnerTenantId`, `assistType`, `status`, `createdById`, `createdAt`, `auditLogId`.

Validation: no model call by default; flags required before use.
