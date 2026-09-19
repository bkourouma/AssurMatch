# Contract: Routing Rules And Manual Routing (admin)

All endpoints require a protected admin actor with MFA. Country scoping applies to Admin Pays.

| Method | Path | Permission | Body / Query | Response |
|---|---|---|---|---|
| GET | `/admin/routing-rules` | `routing_rules:read` | – | `{ generatedAt, items: RoutingRule[], total }` |
| POST | `/admin/routing-rules` | `routing_rules:update` (scoped by `countryId`) | `RoutingRuleCreate` | `201 RoutingRule` |
| PATCH | `/admin/routing-rules/:id` | `routing_rules:update` (scoped) | `RoutingRuleUpdate` | `RoutingRule` |
| GET | `/admin/routing-rules/:id/history` | `routing_rules:read` | – | `{ generatedAt, items: RoutingRuleHistoryEntry[], total }` |
| GET | `/admin/routing/pending` | `lead_assignments:read` | – | `{ generatedAt, items: PendingManualQuote[], total }` |
| POST | `/admin/routing/pending/:quoteRequestId/assign` | `lead_assignments:update` (scoped) | `{ partnerTenantId, reason }` | `{ assignmentId, partnerTenantId, status: "routed" }` |
| POST | `/admin/lead-assignments/:id/reassign` | `lead_assignments:update` (scoped) | `{ partnerTenantId, reason }` | `LeadAssignmentSummary` |

`RoutingRule`:
```json
{
  "id": "uuid", "countryId": "uuid", "productId": "uuid|null",
  "mode": "first_eligible|round_robin|priority|capacity|performance|exclusive|manual",
  "status": "active|disabled",
  "priorities": [{ "partnerTenantId": "uuid", "priority": 1 }],
  "exclusivePartnerTenantId": "uuid|null", "description": "string|null",
  "version": 1, "createdAt": "iso", "updatedAt": "iso", "createdById": "uuid|null"
}
```

Refusal reasons (403 unless stated): `forbidden_role`, `mfa_required`, `out_of_scope_country`, `duplicate_active_rule` (409), `exclusive_partner_required` (400), `priorities_required` (400), `unknown_partner` / `unknown_country` (400), `Partner not eligible: <reasons>` (422), `same_partner` (409), `quote_not_pending` (409). `multi_send` is not a selectable mode (schema validation, 400).
