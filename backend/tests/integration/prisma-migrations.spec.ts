import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("prisma migration fresh-base readiness", () => {
  it("contains ordered migrations for foundation through broker CRM runtime entities", () => {
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
  });
});
