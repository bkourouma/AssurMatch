DO $$ BEGIN
  CREATE TYPE "BrokerCrmPipelineStatus" AS ENUM (
    'nouveau',
    'accepte',
    'contact_tente',
    'contacte',
    'qualifie',
    'documents_demandes',
    'devis_en_preparation',
    'devis_envoye',
    'negociation',
    'gagne',
    'perdu',
    'doublon',
    'injoignable',
    'hors_cible',
    'rejete_conteste'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BrokerCrmUrgency" AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BrokerCrmLeadState" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "status" "BrokerCrmPipelineStatus" NOT NULL DEFAULT 'nouveau',
  "urgency" "BrokerCrmUrgency" NOT NULL DEFAULT 'normal',
  "source" TEXT NOT NULL DEFAULT 'quote_request',
  "assignedAdvisorId" TEXT,
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "BrokerCrmLeadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmPipelineHistory" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "actorId" TEXT,
  "previousStatus" "BrokerCrmPipelineStatus",
  "nextStatus" "BrokerCrmPipelineStatus" NOT NULL,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmPipelineHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmNote" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmTask" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrokerCrmTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmReminder" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "message" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmDocument" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'internal',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmProposal" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amountIndicative" DECIMAL(65,30),
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "notes" TEXT,
  "nonContractual" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmDispute" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "comment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'opened',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrokerCrmDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrokerCrmAiAssistRequest" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "assistType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "auditLogId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerCrmAiAssistRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerCrmLeadState_leadAssignmentId_key" ON "BrokerCrmLeadState"("leadAssignmentId");
CREATE INDEX IF NOT EXISTS "BrokerCrmLeadState_partnerTenantId_status_updatedAt_idx" ON "BrokerCrmLeadState"("partnerTenantId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmLeadState_partnerTenantId_assignedAdvisorId_idx" ON "BrokerCrmLeadState"("partnerTenantId", "assignedAdvisorId");
CREATE INDEX IF NOT EXISTS "BrokerCrmPipelineHistory_leadAssignmentId_occurredAt_idx" ON "BrokerCrmPipelineHistory"("leadAssignmentId", "occurredAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmPipelineHistory_partnerTenantId_occurredAt_idx" ON "BrokerCrmPipelineHistory"("partnerTenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmNote_leadAssignmentId_createdAt_idx" ON "BrokerCrmNote"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmNote_partnerTenantId_createdAt_idx" ON "BrokerCrmNote"("partnerTenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmTask_partnerTenantId_assigneeId_dueAt_idx" ON "BrokerCrmTask"("partnerTenantId", "assigneeId", "dueAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmTask_leadAssignmentId_createdAt_idx" ON "BrokerCrmTask"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmReminder_partnerTenantId_assigneeId_remindAt_idx" ON "BrokerCrmReminder"("partnerTenantId", "assigneeId", "remindAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmDocument_leadAssignmentId_createdAt_idx" ON "BrokerCrmDocument"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmDocument_partnerTenantId_visibility_idx" ON "BrokerCrmDocument"("partnerTenantId", "visibility");
CREATE INDEX IF NOT EXISTS "BrokerCrmProposal_leadAssignmentId_createdAt_idx" ON "BrokerCrmProposal"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmProposal_partnerTenantId_createdAt_idx" ON "BrokerCrmProposal"("partnerTenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmDispute_leadAssignmentId_createdAt_idx" ON "BrokerCrmDispute"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerCrmDispute_partnerTenantId_status_idx" ON "BrokerCrmDispute"("partnerTenantId", "status");
CREATE INDEX IF NOT EXISTS "BrokerCrmAiAssistRequest_partnerTenantId_assistType_createdAt_idx" ON "BrokerCrmAiAssistRequest"("partnerTenantId", "assistType", "createdAt");
