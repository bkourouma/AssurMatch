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
      "0004_broker_crm_pro"
    ]);
    const schema = readFileSync(join(process.cwd(), "backend", "prisma", "schema.prisma"), "utf8");
    for (const model of ["AuditLog", "FeatureFlag", "ConsentRecord", "QuoteRequest", "LeadAssignment", "BrokerCrmLeadState"]) {
      expect(schema).toContain(`model ${model}`);
    }
    const foundation = readFileSync(join(migrationsDir, "0001_foundation", "migration.sql"), "utf8");
    expect(foundation).toContain('CREATE TYPE "UserStatus"');
    expect(foundation).toContain('CREATE TABLE "AuditLog"');
    expect(foundation).not.toContain("placeholder records");
    const starter = readFileSync(join(migrationsDir, "0003_broker_starter_portal", "migration.sql"), "utf8");
    const crm = readFileSync(join(migrationsDir, "0004_broker_crm_pro", "migration.sql"), "utf8");
    expect(starter).toContain("ADD COLUMN IF NOT EXISTS");
    expect(crm).toContain("CREATE TABLE IF NOT EXISTS");
  });
});
