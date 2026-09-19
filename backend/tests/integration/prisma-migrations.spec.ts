import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("prisma migration fresh-base readiness", () => {
  it("contains ordered migrations for foundation through broker CRM runtime entities", async () => {
    const migrationsDir = join(process.cwd(), "backend", "prisma", "migrations");
    const migrations = readdirSync(migrationsDir).filter((entry) => existsSync(join(migrationsDir, entry, "migration.sql"))).sort();
    expect(migrations).toEqual([
      "0001_foundation",
      "0002_comparator_quote",
      "0003_broker_starter_portal",
      "0004_broker_crm_pro",
      "0005_auth_users_persistence",
      "0006_partner_api_webhooks",
      "0007_partner_webhook_delivery_policy",
      "0008_routing_rules",
      "0009_offer_comparison",
      "0010_quote_documents",
      "0011_ai_interactions",
      "0012_billing_plans",
      "0013_messaging_channels",
      "0014_enterprise_agencies",
      "0015_multi_broker_routing",
      "0016_broker_crm_history_event_type"
    ]);
    const schema = readFileSync(join(process.cwd(), "backend", "prisma", "schema.prisma"), "utf8");
    for (const model of ["AuditLog", "FeatureFlag", "ConsentRecord", "QuoteRequest", "LeadAssignment", "BrokerCrmLeadState", "PartnerApiKey", "PartnerWebhookEndpoint", "PartnerWebhookDelivery", "PartnerWebhookAllowlistEntry", "RoutingRule", "RoutingRuleHistory"]) {
      expect(schema).toContain(`model ${model}`);
    }
    const foundation = readFileSync(join(migrationsDir, "0001_foundation", "migration.sql"), "utf8");
    expect(foundation).toContain('CREATE TYPE "UserStatus"');
    expect(foundation).toContain('CREATE TABLE "AuditLog"');
    expect(foundation).not.toContain("placeholder records");
    const starter = readFileSync(join(migrationsDir, "0003_broker_starter_portal", "migration.sql"), "utf8");
    const crm = readFileSync(join(migrationsDir, "0004_broker_crm_pro", "migration.sql"), "utf8");
    const auth = readFileSync(join(migrationsDir, "0005_auth_users_persistence", "migration.sql"), "utf8");
    const partnerIntegrations = readFileSync(join(migrationsDir, "0006_partner_api_webhooks", "migration.sql"), "utf8");
    const webhookDeliveryPolicy = readFileSync(join(migrationsDir, "0007_partner_webhook_delivery_policy", "migration.sql"), "utf8");
    expect(starter).toContain("ADD COLUMN IF NOT EXISTS");
    expect(crm).toContain("CREATE TABLE IF NOT EXISTS");
    expect(auth).toContain('ADD COLUMN IF NOT EXISTS "passwordHash"');
    expect(auth).toContain('CREATE INDEX IF NOT EXISTS "User_deletedAt_idx"');
    expect(partnerIntegrations).toContain('CREATE TABLE IF NOT EXISTS "PartnerApiKey"');
    expect(partnerIntegrations).toContain('CREATE TABLE IF NOT EXISTS "PartnerWebhookEndpoint"');
    expect(partnerIntegrations).toContain('CREATE TABLE IF NOT EXISTS "PartnerWebhookDelivery"');
    expect(partnerIntegrations).not.toContain("rawKey");
    expect(partnerIntegrations).not.toContain("signingSecret");
    expect(webhookDeliveryPolicy).toContain('CREATE TABLE IF NOT EXISTS "PartnerWebhookAllowlistEntry"');
    expect(webhookDeliveryPolicy).toContain('"PartnerWebhookAllowlistEntry_partnerTenantId_origin_path_key"');
    const routingRules = readFileSync(join(migrationsDir, "0008_routing_rules", "migration.sql"), "utf8");
    expect(routingRules).toContain('CREATE TABLE IF NOT EXISTS "RoutingRule"');
    expect(routingRules).toContain('CREATE TABLE IF NOT EXISTS "RoutingRuleHistory"');
    expect(routingRules).toContain("ADD VALUE IF NOT EXISTS 'pending_manual_assignment'");
    const offerComparison = readFileSync(join(migrationsDir, "0009_offer_comparison", "migration.sql"), "utf8");
    expect(offerComparison).toContain('ADD COLUMN IF NOT EXISTS "guaranteeLevel"');
    expect(offerComparison).toContain('CREATE TABLE IF NOT EXISTS "ScoringRule"');
    expect(schema).toContain("model ScoringRule");
    const quoteDocuments = readFileSync(join(migrationsDir, "0010_quote_documents", "migration.sql"), "utf8");
    expect(quoteDocuments).toContain('CREATE TABLE IF NOT EXISTS "QuoteRequestDocument"');
    expect(schema).toContain("model QuoteRequestDocument");
    const aiInteractions = readFileSync(join(migrationsDir, "0011_ai_interactions", "migration.sql"), "utf8");
    expect(aiInteractions).toContain('ADD COLUMN IF NOT EXISTS "promptHash"');
    expect(aiInteractions).not.toContain("promptText");
    const billingPlans = readFileSync(join(migrationsDir, "0012_billing_plans", "migration.sql"), "utf8");
    expect(billingPlans).toContain('CREATE TABLE IF NOT EXISTS "BillingPlanPrice"');
    expect(billingPlans).toContain('CREATE TABLE IF NOT EXISTS "DraftInvoice"');
    expect(billingPlans).toContain('CREATE TABLE IF NOT EXISTS "LeadPack"');
    expect(schema).toContain("model BillingPlanPrice");
    expect(schema).toContain("model DraftInvoice");
    expect(schema).toContain("model LeadPack");
    const messagingChannels = readFileSync(join(migrationsDir, "0013_messaging_channels", "migration.sql"), "utf8");
    expect(messagingChannels).toContain('CREATE TABLE IF NOT EXISTS "MessagingDelivery"');
    expect(messagingChannels).toContain('CREATE TABLE IF NOT EXISTS "NotificationPreference"');
    expect(messagingChannels).toContain('CREATE TABLE IF NOT EXISTS "InAppNotification"');
    expect(messagingChannels).not.toContain("recipientRaw");
    expect(schema).toContain("model MessagingDelivery");
    expect(schema).toContain("model NotificationPreference");
    expect(schema).toContain("model InAppNotification");
    const enterprise = readFileSync(join(migrationsDir, "0014_enterprise_agencies", "migration.sql"), "utf8");
    expect(enterprise).toContain('CREATE TABLE IF NOT EXISTS "PartnerAgency"');
    expect(enterprise).toContain('CREATE TABLE IF NOT EXISTS "PartnerCustomRole"');
    expect(enterprise).toContain('CREATE TABLE IF NOT EXISTS "PartnerBranding"');
    expect(schema).toContain("model PartnerAgency");
    expect(schema).toContain("model PartnerCustomRole");
    expect(schema).toContain("model PartnerBranding");
    const multiBroker = readFileSync(join(migrationsDir, "0015_multi_broker_routing", "migration.sql"), "utf8");
    expect(multiBroker).toContain("ADD VALUE IF NOT EXISTS 'multi_send'");
    expect(multiBroker).toContain('ADD COLUMN IF NOT EXISTS "recipientCount"');
    // A request may reach several partners, so uniqueness moves to the (request, partner) pair.
    expect(multiBroker).toContain('DROP INDEX IF EXISTS "LeadAssignment_quoteRequestId_key"');
    expect(multiBroker).toContain('"LeadAssignment_quoteRequestId_partnerTenantId_key"');
    expect(schema).toContain("@@unique([quoteRequestId, partnerTenantId])");
    // CRM history rows exist for every CRM activity, not only status changes.
    const crmHistory = readFileSync(join(migrationsDir, "0016_broker_crm_history_event_type", "migration.sql"), "utf8");
    expect(crmHistory).toContain('ADD COLUMN IF NOT EXISTS "eventType"');
    expect(crmHistory).toContain('ALTER COLUMN "nextStatus" DROP NOT NULL');
    expect(schema).toContain("model BrokerCrmPipelineHistory");
    expect(schema).toMatch(/eventType\s+String\s+@default\("status_changed"\)/);
    expect(schema).toMatch(/nextStatus\s+BrokerCrmPipelineStatus\?/);
    expect(schema).not.toContain("@@unique([quoteRequestId])");
  });
});
