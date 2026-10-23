# Routing controls (spec 071, lot 5)

## ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT (control 9)

- Default: off (any value other than `true`). When `true`, a broker without a recorded `PartnerContract`
  (or past its contract expiry) is excluded from routing with reason `contract_missing` / `contract_expired`
  and the exclusion is audited.
- Rollout rule (constitution III, progressive deployment): enable it only when the detection query returns 0.

```sh
psql "$DATABASE_URL" -f scripts/ops/sql/lot5-active-partners-without-contract-detection.sql
```

The query is read-only and lists the `status = 'active'` partners with no `PartnerContract`. Record the
missing contracts from the back-office (`POST /admin/partners/:id/contracts`), re-run the query, then set
`ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT=true` and restart the API.

Rollback: unset the variable (or set it to `false`) and restart the API.

## ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE (control 12)

- Integer 0-100, default `30`. A lead whose deterministic quality score is below the threshold is not
  excluded: it is parked as `pending_manual_assignment` with reason `lead_quality_below_threshold`
  for admin review. `0` disables the control.
