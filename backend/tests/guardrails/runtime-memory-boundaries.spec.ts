import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const extractedRepositoryFiles = [
  "backend/src/modules/consent/consent-records.repository.ts",
  "backend/src/modules/countries/countries.repository.ts",
  "backend/src/modules/products/products.repository.ts",
  "backend/src/modules/offers/offers.repository.ts",
  "backend/src/modules/prospects/prospects.repository.ts",
  "backend/src/modules/quote-requests/quote-requests.repository.ts",
  "backend/src/modules/leads/lead-assignments.repository.ts",
  "backend/src/modules/leads/routing-decisions.repository.ts",
  "backend/src/modules/leads/crm-activity.repository.ts",
  "backend/src/modules/partners/partners.repository.ts",
  "backend/src/modules/partner-licenses/partner-licenses.repository.ts",
  "backend/src/modules/notifications/notifications.repository.ts"
];

describe("runtime memory boundaries", () => {
  it("keeps memory adapters declared as test-only constructs", () => {
    const redisModule = readFileSync(join(process.cwd(), "backend", "src", "modules", "common", "redis", "redis.module.ts"), "utf8");
    const queueModule = readFileSync(join(process.cwd(), "backend", "src", "modules", "common", "queues", "queues.module.ts"), "utf8");
    const auditWriter = readFileSync(join(process.cwd(), "backend", "src", "modules", "audit-logs", "audit-log-writer.service.ts"), "utf8");

    expect(redisModule).toContain('readonly mode = "memory-test"');
    expect(queueModule).toContain('readonly mode = "memory-test"');
    expect(auditWriter).toContain('assertRuntimeRepository(this.repository.mode, "AuditLogRepository")');
  });

  it("keeps extracted domain state out of AssurMatchRuntime residual ownership", () => {
    const runtime = readFileSync(join(process.cwd(), "backend", "src", "runtime", "assurmatch-runtime.ts"), "utf8");
    const residuals = readFileSync(join(process.cwd(), "specs", "009-domain-repositories-extraction", "runtime-residuals.md"), "utf8");

    for (const repositoryName of ["PrismaAuditLogRepository", "PrismaFeatureFlagRepository"]) {
      expect(runtime).toContain(repositoryName);
    }
    for (const repositoryName of [
      "PrismaCountriesRepository",
      "PrismaProductsRepository",
      "PrismaOffersRepository",
      "PrismaProspectsRepository",
      "PrismaConsentRecordsRepository",
      "PrismaQuoteRequestsRepository",
      "PrismaLeadAssignmentsRepository",
      "PrismaPartnersRepository",
      "PrismaPartnerLicensesRepository",
      "PrismaCrmActivityRepository",
      "PrismaNotificationsRepository",
      "PrismaRoutingDecisionsRepository"
    ]) {
      expect(runtime).not.toContain(repositoryName);
    }
    expect(runtime).not.toMatch(/private readonly \w+:\s*[^=]+?\[\]\s*=\s*\[\]/);
    expect(runtime).not.toMatch(/private readonly \w+\s*=\s*new Map/);
    expect(residuals).toContain("Spec 009 reduces `AssurMatchRuntime` to transition orchestration");
    expect(residuals).toContain("Completed Prisma runtime repositories");
  });

  it("does not expose incomplete Prisma repositories for extracted synchronous domains", () => {
    for (const file of extractedRepositoryFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("requires async Prisma service integration");
      expect(source, file).not.toContain("TODO Prisma");
      expect(source, file).not.toMatch(/export class Prisma\w+Repository/);
      expect(source, file).not.toContain('mode = "prisma-runtime"');
    }
  });
});
