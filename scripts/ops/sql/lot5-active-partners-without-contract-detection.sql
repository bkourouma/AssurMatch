-- Spec 071 (lot 5) control 9: list the active partners that have no recorded PartnerContract.
-- Read-only: it runs in a READ ONLY transaction and prints no contact data (only the partner
-- reference, plan, country-free counters and dates).
--
-- Why: routing control 9 excludes a broker without a recorded partnership contract
-- (reason `contract_missing`). It is off by default so it can be rolled out progressively.
-- Set ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT=true only when this query returns 0 rows,
-- otherwise those brokers silently stop receiving leads.
--
-- Usage (preproduction, then production before enabling the control):
--   psql "$DATABASE_URL" -f scripts/ops/sql/lot5-active-partners-without-contract-detection.sql

BEGIN TRANSACTION READ ONLY;

-- 1. Summary (must be 0 before enabling the control).
SELECT count(*) AS active_partners_without_contract
FROM "PartnerTenant" pt
WHERE pt."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "PartnerContract" pc WHERE pc."partnerTenantId" = pt."id");

-- 2. Detail, without contact data.
SELECT pt."id" AS partner_tenant_id, pt."plan", pt."createdAt"
FROM "PartnerTenant" pt
WHERE pt."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "PartnerContract" pc WHERE pc."partnerTenantId" = pt."id")
ORDER BY pt."createdAt";

ROLLBACK;
