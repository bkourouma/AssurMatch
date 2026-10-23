-- Lot 5 (spec 071): routing controls 9-12, AI-assisted routing mode, setup fee / add-ons, plan change requests.
-- Additive only: no existing column or table is altered destructively.

ALTER TYPE "RoutingRuleMode" ADD VALUE IF NOT EXISTS 'ai_assisted';

ALTER TABLE "RoutingDecision" ADD COLUMN IF NOT EXISTS "controlDetails" JSONB;

CREATE TABLE IF NOT EXISTS "PartnerSubscription" (
  "partnerTenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "contractExpiresAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerSubscription_pkey" PRIMARY KEY ("partnerTenantId"),
  CONSTRAINT "PartnerSubscription_status_check" CHECK ("status" IN ('active', 'suspended', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "PlanChangeRequest" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "currentPlan" TEXT NOT NULL,
  "requestedPlan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "justification" TEXT NOT NULL,
  "requestedById" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanChangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanChangeRequest_status_check" CHECK ("status" IN ('pending', 'accepted', 'refused', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS "PlanChangeRequest_partnerTenantId_status_idx" ON "PlanChangeRequest"("partnerTenantId", "status");
CREATE INDEX IF NOT EXISTS "PlanChangeRequest_status_createdAt_idx" ON "PlanChangeRequest"("status", "createdAt");
-- At most one pending request per broker (partial unique index: Prisma cannot express it).
CREATE UNIQUE INDEX IF NOT EXISTS "PlanChangeRequest_one_pending_per_partner_key" ON "PlanChangeRequest"("partnerTenantId") WHERE "status" = 'pending';

CREATE TABLE IF NOT EXISTS "BillingAddOnPrice" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "monthlyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "reason" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAddOnPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingAddOnPrice_kind_check" CHECK ("kind" IN ('api', 'white_label', 'ai'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAddOnPrice_kind_plan_countryCode_key" ON "BillingAddOnPrice"("kind", "plan", "countryCode");

CREATE TABLE IF NOT EXISTS "PartnerAddOn" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "reason" TEXT NOT NULL,
  "assignedById" TEXT,
  "endedById" TEXT,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerAddOn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerAddOn_kind_check" CHECK ("kind" IN ('api', 'white_label', 'ai')),
  CONSTRAINT "PartnerAddOn_status_check" CHECK ("status" IN ('active', 'ended'))
);
CREATE INDEX IF NOT EXISTS "PartnerAddOn_partnerTenantId_status_idx" ON "PartnerAddOn"("partnerTenantId", "status");
-- One active assignment per broker and add-on kind (partial unique index: Prisma cannot express it).
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerAddOn_one_active_per_kind_key" ON "PartnerAddOn"("partnerTenantId", "kind") WHERE "status" = 'active';
