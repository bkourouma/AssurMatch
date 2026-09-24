-- CRM history rows are written for every CRM activity (note, task, reminder, document,
-- proposal, dispute, export), not only for status changes: persist the event type and
-- allow a row without a target status.
ALTER TABLE "BrokerCrmPipelineHistory" ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT 'status_changed';
ALTER TABLE "BrokerCrmPipelineHistory" ALTER COLUMN "nextStatus" DROP NOT NULL;
