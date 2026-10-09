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
      "0016_broker_crm_history_event_type",
      "0017_public_site_forms",
      "0018_data_retention",
      "0019_satisfaction_surveys",
      "0020_catalog_admin_consent_content",
      "0021_partner_onboarding_lifecycle",
      "0022_offer_versions_selected_offer_routing",
      "0023_visitor_access_tokens_notifications",
      "0024_broker_self_service",
      "0025_admin_operations",
      "0026_b2b_invoicing",
      "0027_broker_response_loop",
      "0028_notifications_completion",
      "0029_query_performance_indexes"
    ]);
    const schema = readFileSync(join(process.cwd(), "backend", "prisma", "schema.prisma"), "utf8").replace(/\r\n/g, "\n");
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
    // Public-site forms (waitlist, broker application, contact message) plus the directory city.
    const publicSite = readFileSync(join(migrationsDir, "0017_public_site_forms", "migration.sql"), "utf8");
    expect(publicSite).toContain('CREATE TYPE "WaitlistEntryStatus"');
    expect(publicSite).toContain('CREATE TYPE "PartnerApplicationStatus"');
    expect(publicSite).toContain('CREATE TYPE "ContactAudience"');
    expect(publicSite).toContain('CREATE TYPE "ContactMessageStatus"');
    expect(publicSite).toContain('CREATE TABLE IF NOT EXISTS "WaitlistEntry"');
    expect(publicSite).toContain('CREATE TABLE IF NOT EXISTS "PartnerApplication"');
    expect(publicSite).toContain('CREATE TABLE IF NOT EXISTS "ContactMessage"');
    expect(publicSite).toContain('ALTER TABLE "PartnerTenant" ADD COLUMN IF NOT EXISTS "city" TEXT');
    expect(publicSite).not.toContain('"ipAddress"');
    expect(schema).toContain("model WaitlistEntry");
    expect(schema).toContain("model PartnerApplication");
    expect(schema).toContain("model ContactMessage");
    expect(schema).not.toContain("@@unique([quoteRequestId])");
    // Spec 046: retention overrides, anonymization batches (ids only) and the anonymization markers.
    const retention = readFileSync(join(migrationsDir, "0018_data_retention", "migration.sql"), "utf8");
    expect(retention).toContain('CREATE TABLE IF NOT EXISTS "RetentionPolicy"');
    expect(retention).toContain('CREATE TABLE IF NOT EXISTS "AnonymizationBatch"');
    expect(retention).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "RetentionPolicy_global_category_key" ON "RetentionPolicy"("category") WHERE "countryId" IS NULL');
    expect(retention).toContain(`UPDATE "Country" SET "publicSince" = "updatedAt" WHERE "status" = 'public'`);
    for (const table of ["Prospect", "QuoteRequest", "QuoteRequestDocument", "ContactMessage", "PartnerApplication", "WaitlistEntry"]) {
      expect(retention).toContain(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3)`);
    }
    expect(retention).not.toMatch(/ALTER TABLE "(ConsentRecord|AuditLog)"/);
    expect(retention).not.toMatch(/"(email|emailFingerprint|phone)" TEXT/);
    // Security review L5: the global-override uniqueness lives in SQL only; no later migration may drop it.
    for (const later of migrations.filter((name) => name > "0018_data_retention")) {
      expect(readFileSync(join(migrationsDir, later, "migration.sql"), "utf8"), later).not.toContain("RetentionPolicy_global_category_key");
    }
    expect(schema).toContain("RetentionPolicy_global_category_key");
    expect(schema).toContain("model RetentionPolicy");
    expect(schema).toContain("model AnonymizationBatch");
    // Spec 050: additive columns only (phone rule, consent content, quote language).
    const catalog = readFileSync(join(migrationsDir, "0020_catalog_admin_consent_content", "migration.sql"), "utf8");
    expect(catalog).toContain('ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "phoneDialCode" TEXT');
    expect(catalog).toContain('ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "phoneNationalLengths" INTEGER[]');
    expect(catalog).toContain('ALTER TABLE "ConsentText" ADD COLUMN IF NOT EXISTS "content" TEXT');
    expect(catalog).toContain('ALTER TABLE "ConsentText" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3)');
    expect(catalog).toContain(`ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr'`);
    expect(catalog).not.toMatch(/DROP|DELETE|UPDATE /);
    expect(schema).toMatch(/phoneNationalLengths\s+Int\[\]/);
    expect(schema).toMatch(/language\s+String\s+@default\("fr"\)/);
    // Spec 051: additive partner lifecycle (enum values, columns, history and contract tables).
    const onboarding = readFileSync(join(migrationsDir, "0021_partner_onboarding_lifecycle", "migration.sql"), "utf8");
    expect(onboarding).toContain(`ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'active_test'`);
    expect(onboarding).toContain(`ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'superseded'`);
    expect(onboarding).toContain(`ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'partnership_contract'`);
    expect(onboarding).toContain('CREATE TABLE IF NOT EXISTS "PartnerStatusHistory"');
    expect(onboarding).toContain('CREATE TABLE IF NOT EXISTS "PartnerLicenseHistory"');
    expect(onboarding).toContain('CREATE TABLE IF NOT EXISTS "PartnerContract"');
    expect(onboarding).toContain('ADD COLUMN IF NOT EXISTS "scanStatus" "AccreditationScanStatus" NOT NULL DEFAULT \'pending\'');
    expect(onboarding).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTenant_countryId_registrationNumber_key" ON "PartnerTenant"("countryId", "registrationNumber") WHERE "countryId" IS NOT NULL AND "registrationNumber" IS NOT NULL');
    expect(onboarding).not.toMatch(/DROP|DELETE|UPDATE /);
    for (const later of migrations.filter((name) => name > "0021_partner_onboarding_lifecycle")) {
      expect(readFileSync(join(migrationsDir, later, "migration.sql"), "utf8"), later).not.toContain("PartnerTenant_countryId_registrationNumber_key");
    }
    for (const model of ["PartnerStatusHistory", "PartnerLicenseHistory", "PartnerContract"]) expect(schema).toContain(`model ${model}`);
    expect(schema).toContain("PartnerTenant_countryId_registrationNumber_key");
    expect(schema).toMatch(/enum AccreditationScanStatus/);
    // Spec 052: offer versions (additive), version 1 backfill, selected offer on requests and decisions.
    const offerVersions = readFileSync(join(migrationsDir, "0022_offer_versions_selected_offer_routing", "migration.sql"), "utf8");
    expect(offerVersions).toContain('CREATE TABLE IF NOT EXISTS "OfferVersion"');
    expect(offerVersions).toContain('CREATE TYPE "OfferVersionStatus"');
    for (const value of ["offer_validated", "offer_rejected", "offer_suspended", "offer_expiring"]) {
      expect(offerVersions).toContain(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${value}'`);
    }
    expect(offerVersions).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS "OfferVersion_offerId_published_key" ON "OfferVersion"("offerId") WHERE "status" = 'published'`);
    expect(offerVersions).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS "OfferVersion_offerId_pending_key" ON "OfferVersion"("offerId") WHERE "status" IN ('draft', 'submitted')`);
    expect(offerVersions).toContain('ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "publishedVersionId" TEXT');
    expect(offerVersions).toContain('ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "selectedOfferOutcome" TEXT');
    expect(offerVersions).toContain('ALTER TABLE "RoutingDecision" ADD COLUMN IF NOT EXISTS "selectedOfferId" TEXT');
    expect(offerVersions).toContain('INSERT INTO "OfferVersion"');
    expect(offerVersions).toContain("ON CONFLICT DO NOTHING");
    // The backfill only sets the two new pointers; it never deletes nor rewrites offer content.
    expect(offerVersions).not.toMatch(/DROP|DELETE/);
    expect(offerVersions.match(/UPDATE "Offer" o SET "(publishedVersionId|pendingVersionId)"/g)).toHaveLength(2);
    expect(offerVersions.match(/UPDATE /g)).toHaveLength(2);
    expect(schema).toContain("model OfferVersion");
    expect(schema).toMatch(/enum OfferVersionStatus/);
    // Spec 054: visitor access tokens and visitor notification types (additive).
    const visitorAccess = readFileSync(join(migrationsDir, "0023_visitor_access_tokens_notifications", "migration.sql"), "utf8");
    expect(visitorAccess).toContain('CREATE TABLE IF NOT EXISTS "VisitorAccessToken"');
    expect(visitorAccess).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "VisitorAccessToken_tokenHash_key"');
    expect(visitorAccess).toContain('ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT');
    expect(visitorAccess).toContain('ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventPayload" JSONB');
    expect(visitorAccess).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupeKey_key"');
    for (const value of ["visitor_quote_received", "visitor_quote_in_review", "visitor_quote_transmitted", "visitor_quote_accepted", "visitor_quote_reassigned", "visitor_quote_closed", "visitor_consent_withdrawn", "visitor_tracking_link"]) {
      expect(visitorAccess).toContain(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${value}'`);
      expect(schema).toContain(`  ${value}\n`);
    }
    expect(visitorAccess).not.toMatch(/DROP|DELETE|UPDATE /);
    expect(schema).toContain("model VisitorAccessToken");
    // No clear token column: only the hash is stored.
    expect(schema).not.toMatch(/model VisitorAccessToken \{[^}]*\btoken\s+String/);
    // Spec 055: proposals, visitor responses, scanned internal documents and two notification types.
    const responseLoop = readFileSync(join(migrationsDir, "0027_broker_response_loop", "migration.sql"), "utf8");
    expect(responseLoop).toContain('CREATE TABLE IF NOT EXISTS "LeadProposal"');
    expect(responseLoop).toContain('CREATE TABLE IF NOT EXISTS "VisitorProposalResponse"');
    expect(responseLoop).toContain('ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "scanStatus" TEXT');
    for (const value of ["visitor_proposal_available", "broker_visitor_response"]) {
      expect(responseLoop).toContain(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${value}'`);
      expect(schema).toContain(`  ${value}\n`);
    }
    expect(responseLoop).not.toMatch(/DROP|DELETE|UPDATE /);
    expect(schema).toContain("model LeadProposal");
    expect(schema).toContain("model VisitorProposalResponse");
    // Spec 053: additive self-service request table (identity changes, coverage extensions).
    const selfService = readFileSync(join(migrationsDir, "0024_broker_self_service", "migration.sql"), "utf8");
    expect(selfService).toContain('CREATE TABLE IF NOT EXISTS "PartnerChangeRequest"');
    expect(selfService).toContain('CREATE TYPE "PartnerChangeRequestType"');
    expect(selfService).toContain('CREATE TYPE "PartnerChangeRequestStatus"');
    expect(selfService).not.toMatch(/DROP|DELETE|UPDATE |ALTER TABLE/);
    expect(schema).toContain("model PartnerChangeRequest");
    // Spec 056: persisted manual review, contact inbox status and audit-log search indexes, additive only.
    const adminOperations = readFileSync(join(migrationsDir, "0025_admin_operations", "migration.sql"), "utf8");
    expect(adminOperations).toContain('ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3)');
    expect(adminOperations).toContain('ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "duplicateOfQuoteRequestId" TEXT');
    expect(adminOperations).toContain('ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3)');
    expect(adminOperations).toContain('CREATE INDEX IF NOT EXISTS "AuditLog_action_occurredAt_idx"');
    expect(adminOperations).not.toMatch(/DROP|DELETE|TRUNCATE/);
    // Spec 060: issued invoices are immutable, payments and credit notes append-only, all in SQL.
    const invoicing = readFileSync(join(migrationsDir, "0026_b2b_invoicing", "migration.sql"), "utf8");
    for (const table of ["IssuedInvoice", "InvoicePayment", "CreditNote", "InvoiceNumberSequence"]) {
      expect(invoicing).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(schema).toContain(`model ${table}`);
    }
    expect(invoicing).toContain('ALTER TABLE "LeadPack" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT');
    expect(invoicing).toContain('CREATE TRIGGER "IssuedInvoice_immutable" BEFORE UPDATE OR DELETE ON "IssuedInvoice"');
    expect(invoicing).toContain('CREATE TRIGGER "InvoicePayment_append_only" BEFORE UPDATE OR DELETE ON "InvoicePayment"');
    expect(invoicing).toContain('CREATE TRIGGER "CreditNote_append_only" BEFORE UPDATE OR DELETE ON "CreditNote"');
    expect(invoicing).toContain('"IssuedInvoice_active_partner_period_key"');
    expect(schema).toContain("IssuedInvoice_active_partner_period_key");
    expect(invoicing).not.toMatch(/DROP TABLE|DELETE FROM/);
    // Spec 061: broker/admin alert types, alerts center, worker heartbeat and survey opt-out.
    const completion = readFileSync(join(migrationsDir, "0028_notifications_completion", "migration.sql"), "utf8");
    for (const value of ["broker_document_received", "broker_lead_reassigned", "broker_task_due", "broker_quota_threshold", "broker_license_expiring", "broker_offer_expiring", "admin_alert_raised"]) {
      expect(completion).toContain(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS '${value}'`);
      expect(schema).toContain(`  ${value}\n`);
    }
    for (const table of ["AdminAlert", "WorkerHeartbeat", "NotificationUnsubscribe"]) {
      expect(completion).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(schema).toContain(`model ${table}`);
    }
    expect(completion).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "AdminAlert_dedupeKey_key"');
    expect(completion).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "NotificationUnsubscribe_subjectHash_purpose_key"');
    expect(completion).not.toMatch(/DROP|DELETE|UPDATE /);
  });
});
