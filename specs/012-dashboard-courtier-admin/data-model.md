# Data Model: Dashboards (read-only aggregates)

This feature does not introduce any new persistent entity. It computes
deterministic aggregates from existing PostgreSQL/Prisma entities listed in
`spec.md` (Key Entities). The shapes below are DTOs returned by the API.

## Time window

```
DashboardTimeWindow {
  from: ISO date-time   // inclusive lower bound, default = now - 30 days
  to:   ISO date-time   // inclusive upper bound, default = now
}
```

Constraints: `from < to`, span ∈ [1 day, 365 days], future dates rejected.

## Broker dashboard response

```
BrokerDashboardResponse {
  plan: "starter" | "pro" | "enterprise"
  window: DashboardTimeWindow
  starter: BrokerStarterDashboardSection
  crm?:   BrokerCrmDashboardSection            // present only for Pro/Enterprise + broker_crm_enabled
  licenseAlerts: LicenseAlertItem[]            // tenant scope
}

BrokerStarterDashboardSection {
  received: number
  accepted: number
  rejected: number
  disputed: number
  pendingAction: number
  averageFirstActionMinutes: number | null
  byProduct: { productKey: string; total: number }[]
  byCountry: { countryCode: string; total: number }[]
}

BrokerCrmDashboardSection {
  pipeline: { status: string; total: number }[]
  byAssignedAdvisor: { advisorId: string; total: number }[]
  conversionByProduct: { productKey: string; received: number; accepted: number; rate: number }[]
  averageReceptionToFirstActivityMinutes: number | null
  upcomingTasks: number
  upcomingReminders: number
}

LicenseAlertItem {
  licenseId: string
  partnerTenantId: string
  countryCode: string
  productKey: string | null
  status: "expired" | "expiring_soon"
  expiresAt: ISO date-time
}
```

## Admin dashboard response

```
AdminDashboardResponse {
  window: DashboardTimeWindow
  scope: AdminDashboardScope                   // echoes the effective scope applied
  leadVolumes: {
    received: number
    transmitted: number
    refused: number
    nonRouted: number
  }
  nonRoutedReasons: RoutingRefusalReasonCount[]
  byCountry: { countryCode: string; total: number }[]
  byProduct: { productKey: string; total: number }[]
  partners: { active: number; inactive: number }
  expiredOffersStillReferenced: number
  licenseAlerts: { expired: number; expiringSoon: number }
  complianceAlertCounts: {
    consentMissing: number
    crmFlagClosed: number
    rbacDenied: number
    crossTenantAttempt: number
    other: number
  }
  sensitiveFeatureFlags: FeatureFlagSummary[]
}

AdminDashboardScope {
  countries: string[]                          // effective countries derived from actor + query
  products: string[]
  partnerId: string | null
  role: "super_admin" | "admin_pays" | "compliance_admin" | "support_admin" | "finance_admin" | "content_admin"
}

RoutingRefusalReasonCount {
  reason: string
  total: number
}

FeatureFlagSummary {
  key: string
  scopeType: string
  scopeId: string | null
  value: boolean
}
```

## Compliance alerts response

```
ComplianceAlertsResponse {
  page: number
  pageSize: number
  total: number
  items: ComplianceAlertItem[]
}

ComplianceAlertItem {
  id: string
  occurredAt: ISO date-time
  category: "consent_missing" | "crm_flag_closed" | "rbac_denied" | "cross_tenant_attempt" | "other"
  reason: string
  actorId: string | null
  actorRoles: string[]
  targetType: string
  targetId: string | null
  partnerTenantId: string | null
}
```

## Aggregation sources

| DTO field                                | Source                                                    |
|------------------------------------------|-----------------------------------------------------------|
| broker.starter.received                  | `LeadAssignmentService.list()` filtered by tenant + window|
| broker.starter.accepted/rejected/disputed| same with `status` filter                                 |
| broker.starter.pendingAction             | `status ∈ {received, contacted, assigned, seen}`          |
| broker.starter.averageFirstActionMinutes | (`seenAt` − `assignedAt`) average                         |
| broker.starter.byProduct/byCountry       | groupBy `productKey`/`countryCode`                        |
| broker.crm.pipeline                      | groupBy `status`                                           |
| broker.crm.byAssignedAdvisor             | groupBy `assignedAdvisorId`                                |
| broker.crm.conversionByProduct           | accepted/received per product                              |
| broker.crm.averageReceptionToFirstActivityMinutes | `CrmActivityRepository` first activity timestamp − assignedAt |
| broker.crm.upcomingTasks/Reminders       | `CrmActivityRepository` of type=task/reminder dueAt window |
| admin.leadVolumes.received               | `QuoteRequests` count window                               |
| admin.leadVolumes.transmitted            | `LeadAssignment` count window                              |
| admin.leadVolumes.refused                | `RoutingDecision` refusals window                          |
| admin.leadVolumes.nonRouted              | `QuoteRequest` not linked to assignment in window          |
| admin.nonRoutedReasons                   | groupBy `reason` on `RoutingDecision` refusals             |
| admin.byCountry/byProduct                | leads received groupBy                                     |
| admin.partners                           | `PartnerService.list()` count active/inactive              |
| admin.expiredOffersStillReferenced       | `OffersRepository` expired and referenced by recent QRs    |
| admin.licenseAlerts                      | `PartnerLicensesService.list()` filtered                   |
| admin.complianceAlertCounts              | `AuditLog` filtered by action codes per category           |
| admin.sensitiveFeatureFlags              | `FeatureFlagsService.list()` filtered to known keys        |
| compliance alerts items                  | `AuditLog` filtered by action codes paginated              |
