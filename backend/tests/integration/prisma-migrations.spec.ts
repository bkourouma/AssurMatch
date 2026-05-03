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
      "0007_partner_webhook_delivery_policy"
    ]);
    const schema = readFileSync(join(process.cwd(), "backend", "prisma", "schema.prisma"), "utf8");
    for (const model of ["AuditLog", "FeatureFlag", "ConsentRecord", "QuoteRequest", "LeadAssignment", "BrokerCrmLeadState", "PartnerApiKey", "PartnerWebhookEndpoint", "PartnerWebhookDelivery", "PartnerWebhookAllowlistEntry"]) {
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
  });
});
