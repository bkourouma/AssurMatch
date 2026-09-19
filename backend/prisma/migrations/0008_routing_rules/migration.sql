CREATE TYPE "RoutingRuleMode" AS ENUM ('first_eligible', 'round_robin', 'priority', 'capacity', 'performance', 'exclusive', 'manual');
CREATE TYPE "RoutingRuleStatus" AS ENUM ('active', 'disabled');

ALTER TYPE "RoutingStatus" ADD VALUE IF NOT EXISTS 'pending_manual_assignment';

CREATE TABLE IF NOT EXISTS "RoutingRule" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT,
  "mode" "RoutingRuleMode" NOT NULL DEFAULT 'first_eligible',
  "status" "RoutingRuleStatus" NOT NULL DEFAULT 'active',
  "priorities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "exclusivePartnerTenantId" TEXT,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoutingRule_countryId_productId_status_idx" ON "RoutingRule"("countryId", "productId", "status");

CREATE TABLE IF NOT EXISTS "RoutingRuleHistory" (
  "id" TEXT NOT NULL,
  "routingRuleId" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "reason" TEXT NOT NULL,
  "changedById" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoutingRuleHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoutingRuleHistory_routingRuleId_changedAt_idx" ON "RoutingRuleHistory"("routingRuleId", "changedAt");
