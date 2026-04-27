# Runbook — Audit logs

## Endpoints

- `GET /admin/audit-logs` (admin role allow-list).
- Direct PostgreSQL query for forensic work (Compliance Admin):
  ```sql
  SELECT "occurredAt", "action", "actorId", "result", "reason", "scope"
  FROM "AuditLog"
  WHERE "occurredAt" > now() - interval '7 days'
  ORDER BY "occurredAt" DESC
  LIMIT 200;
  ```

## Common filters

- By scope (country/product/partner): `scope @> '{"countryId": "<id>"}'::jsonb`.
- By correlation id (batch import): `"correlationId" = '<batch-id>'`.
- By result: `"result" = 'refused'` for compliance investigations.

## Retention

Audit rows have a `retentionUntil` timestamp (10 years by default). Compliance must approve any
deletion outside that window.
