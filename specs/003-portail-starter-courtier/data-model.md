# Data Model: Portail Starter Courtier

## BrokerTenant / Partner

- **Purpose**: Represents the broker partner tenant that owns assigned leads.
- **Fields used**: `id`, `plan`, `status`, `capacityStatus`, `legalName`, `tradeName`.
- **Rules**: Must be active and Starter-capable for portal access. Plan must not unlock Pro/Enterprise screens unless separately authorized.

## BrokerUser

- **Purpose**: Authenticated broker actor.
- **Fields used**: `id`, `partnerTenantId`, `mfaStatus`, `countryScopes`, `productScopes`, roles/permissions.
- **Rules**: Must belong to the same tenant as the LeadAssignment. Export permission is separate from read/action permission.

## QuoteRequest

- **Purpose**: Origin of the lead created by the comparator/devis journey.
- **Fields used**: `id`, `publicReference`, `countryId`, `productId`, `payload`, `consentRecordId`, `status`, `routingStatus`, `retentionUntil`.
- **Rules**: Must have valid consent evidence and routing assignment before broker portal exposure. Payload is minimized for broker detail.

## LeadAssignment

- **Purpose**: Links one QuoteRequest to one broker tenant.
- **Fields used**: `id`, `quoteRequestId`, `partnerTenantId`, `status`, `assignedAt`, `assignmentReason`, `lastBrokerActionAt`, `brokerNotificationId`.
- **New target fields**: `seenAt`, `seenById`, `acceptedAt`, `rejectedAt`, `disputedAt`, `actionReason`, `actionComment`, `lastBrokerActionById`.
- **Rules**: One active assignment per quote request. Broker users can only read or mutate assignments for their own tenant.

## LeadActionHistory

- **Purpose**: Immutable minimal broker-visible history.
- **Fields**: `id`, `leadAssignmentId`, `partnerTenantId`, `actorId`, `eventType`, `previousStatus`, `nextStatus`, `reason`, `comment`, `context`, `occurredAt`, `createdAt`.
- **Events**: `assigned`, `viewed`, `accepted`, `rejected`, `disputed`, `notification_read`, `exported`, `blocked`.
- **Rules**: Disputes and sensitive actions are never overwritten. Context is PII-minimized.

## LeadRejectionReason

- **Purpose**: Controlled reason value for rejecting leads.
- **Values**: `lead_quality`, `wrong_scope`, `unreachable_prospect`, `duplicate`, `compliance_concern`.
- **Rules**: Required for rejection. Free text is optional and sanitized.

## LeadDisputeReason

- **Purpose**: Controlled reason value for contesting leads.
- **Values**: `lead_quality`, `wrong_scope`, `unreachable_prospect`, `duplicate`, `compliance_concern`.
- **Rules**: Required for dispute. Every dispute creates history and AuditLog.

## Notification

- **Purpose**: Minimal in-app broker notification for newly assigned leads.
- **Fields used**: `id`, `type`, `recipientScope`, `payloadReference`, `relatedAuditLogId`, `createdAt`, `updatedAt`.
- **Target read state**: `readAt`, `readById` if durable read tracking is needed.
- **Rules**: Payload must not contain raw PII. Access requires the connected broker tenant.

## ExportEvent

- **Purpose**: Evidence of CSV export requests and results.
- **Fields**: represented by AuditLog and optional LeadActionHistory event.
- **Rules**: Includes actor, tenant, filters, row count, column set and result. No raw PII in audit context.

## AuditLog

- **Purpose**: Opposable security/compliance trace.
- **Actions**: `broker_starter.*` actions defined in plan.
- **Rules**: Required for detail reads, actions, exports, notifications and refusals. Context is PII-minimized.

## State Transitions

```text
assigned -> seen
assigned -> accepted
assigned -> rejected
assigned -> disputed
seen -> accepted
seen -> rejected
seen -> disputed
accepted -> closed
rejected -> closed
disputed -> closed
closed -> no broker mutation except explicitly authorized archival/review action
```

`broker_notified` from 002 remains compatible and may behave like `assigned` until first broker view.
