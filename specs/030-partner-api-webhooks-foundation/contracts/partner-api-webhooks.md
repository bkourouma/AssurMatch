# Partner API And Webhooks Contract Sketch

## Feature Flags

- `partner_api_enabled`: default false, future sensitive flag.
- `partner_webhooks_enabled`: default false, future sensitive flag.

## Future REST Surface

- `GET /partner-api/v1/leads`
  - Requires API key scope `leads:read_assigned`.
  - Tenant derived from API key, never from query.
  - Paginated; no bulk export.

- `GET /partner-api/v1/notifications`
  - Requires API key scope `notifications:read`.
  - Tenant derived from API key.

- `POST /partner-api/v1/webhook-endpoints`
  - Requires `webhooks:manage`.
  - Stores endpoint URL, event subscriptions and secret hash.
  - Disabled by default until verified.

## Webhook Envelope

```json
{
  "id": "evt_...",
  "type": "lead.assigned",
  "occurredAt": "2026-05-03T00:00:00.000Z",
  "partnerTenantId": "uuid",
  "idempotencyKey": "uuid:event:attempt",
  "data": {
    "leadAssignmentId": "uuid",
    "publicReference": "AM-...",
    "countryCode": "CI",
    "productKey": "auto",
    "status": "assigned"
  }
}
```

## Required Headers

- `X-AssurMatch-Event-Id`
- `X-AssurMatch-Timestamp`
- `X-AssurMatch-Signature: v1=<hmac_sha256>`
- `X-AssurMatch-Idempotency-Key`

## Exclusions

No visitor raw PII, no payment fields, no policy/attestation/claim documents, no AI prompt/result body, no insurer API relay.
