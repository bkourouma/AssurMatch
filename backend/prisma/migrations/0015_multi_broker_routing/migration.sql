-- Multi-broker routing (spec 042). The mode is added to the enum but no rule uses it until an
-- admin selects it, and `multi_broker_routing_enabled` stays closed by default.
ALTER TYPE "RoutingRuleMode" ADD VALUE IF NOT EXISTS 'multi_send';

ALTER TABLE "RoutingRule" ADD COLUMN IF NOT EXISTS "maxRecipients" INTEGER NOT NULL DEFAULT 3;

-- Every selected partner of one request; the legacy singular column keeps the first recipient so
-- existing readers stay correct.
ALTER TABLE "RoutingDecision" ADD COLUMN IF NOT EXISTS "selectedPartnerTenantIds" TEXT[] NOT NULL DEFAULT '{}';

-- A lead knows how many partners received the same request (spec 042 D1: required to justify the
-- shared price). Co-recipient identities are deliberately NOT stored on the assignment.
ALTER TABLE "LeadAssignment" ADD COLUMN IF NOT EXISTS "recipientCount" INTEGER NOT NULL DEFAULT 1;

-- A request may now reach several partners, so uniqueness moves from the request alone to the
-- (request, partner) pair: a partner still receives a given request at most once.
DROP INDEX IF EXISTS "LeadAssignment_quoteRequestId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "LeadAssignment_quoteRequestId_partnerTenantId_key" ON "LeadAssignment"("quoteRequestId", "partnerTenantId");
CREATE INDEX IF NOT EXISTS "LeadAssignment_quoteRequestId_idx" ON "LeadAssignment"("quoteRequestId");

-- Shared leads are billed at a reduced per-lead price (spec 042 D1).
ALTER TABLE "BillingPlanPrice" ADD COLUMN IF NOT EXISTS "sharedLeadPriceMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
