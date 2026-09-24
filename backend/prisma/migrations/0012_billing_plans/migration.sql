CREATE TABLE IF NOT EXISTS "BillingPlanPrice" (
  "id" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "monthlySubscription" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "perLeadPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "setupFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "reason" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPlanPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillingPlanPrice_plan_countryCode_key" ON "BillingPlanPrice"("plan", "countryCode");

CREATE TABLE IF NOT EXISTS "LeadPack" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "creditsGranted" INTEGER NOT NULL,
  "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "grantedById" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadPack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadPack_partnerId_grantedAt_idx" ON "LeadPack"("partnerId", "grantedAt");

CREATE TABLE IF NOT EXISTS "DraftInvoice" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "partnerName" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft_not_billable',
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "lines" JSONB NOT NULL,
  "billableLeadCount" INTEGER NOT NULL DEFAULT 0,
  "nonBillableLeadCount" INTEGER NOT NULL DEFAULT 0,
  "disputeCreditCount" INTEGER NOT NULL DEFAULT 0,
  "packCreditsUsed" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DraftInvoice_partnerId_periodFrom_key" ON "DraftInvoice"("partnerId", "periodFrom");
CREATE INDEX IF NOT EXISTS "DraftInvoice_periodFrom_idx" ON "DraftInvoice"("periodFrom");
