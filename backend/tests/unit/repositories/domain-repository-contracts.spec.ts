import { describe, expect, it } from "vitest";
import { MemoryAuditLogRepository, PrismaAuditLogRepository } from "../../../src/modules/audit-logs/audit-log-repository";
import { MemoryConsentRecordsRepository } from "../../../src/modules/consent/consent-records.repository";
import { MemoryCountriesRepository } from "../../../src/modules/countries/countries.repository";
import { MemoryFeatureFlagRepository, PrismaFeatureFlagRepository } from "../../../src/modules/feature-flags/feature-flag-repository";
import { MemoryCrmActivityRepository } from "../../../src/modules/leads/crm-activity.repository";
import { MemoryLeadAssignmentsRepository } from "../../../src/modules/leads/lead-assignments.repository";
import { MemoryRoutingDecisionsRepository } from "../../../src/modules/leads/routing-decisions.repository";
import { MemoryNotificationsRepository } from "../../../src/modules/notifications/notifications.repository";
import { MemoryOffersRepository } from "../../../src/modules/offers/offers.repository";
import { MemoryPartnerLicensesRepository } from "../../../src/modules/partner-licenses/partner-licenses.repository";
import { MemoryPartnersRepository } from "../../../src/modules/partners/partners.repository";
import { MemoryProductsRepository } from "../../../src/modules/products/products.repository";
import { MemoryProspectsRepository } from "../../../src/modules/prospects/prospects.repository";
import { MemoryQuoteRequestsRepository } from "../../../src/modules/quote-requests/quote-requests.repository";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { assertRuntimeRepository } from "../../../src/modules/common/repositories/runtime-repository";

describe("domain repository contracts", () => {
  it("declares memory adapters as explicit test-only repositories", () => {
    const repositories = [
      new MemoryAuditLogRepository(),
      new MemoryFeatureFlagRepository(),
      new MemoryCountriesRepository(),
      new MemoryProductsRepository(),
      new MemoryOffersRepository(),
      new MemoryProspectsRepository(),
      new MemoryConsentRecordsRepository(),
      new MemoryQuoteRequestsRepository(),
      new MemoryLeadAssignmentsRepository(),
      new MemoryRoutingDecisionsRepository(),
      new MemoryPartnersRepository(),
      new MemoryPartnerLicensesRepository(),
      new MemoryCrmActivityRepository(),
      new MemoryNotificationsRepository()
    ];

    expect(repositories.map((repository) => repository.mode)).toEqual(repositories.map(() => "memory-test"));
  });

  it("rejects memory repositories outside test runtime", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertRuntimeRepository("memory-test", "CountriesRepository")).toThrow(/memory repository is test-only/);
      expect(() => assertRuntimeRepository("prisma-runtime", "CountriesRepository")).not.toThrow();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("declares only completed Prisma adapters as runtime repositories", () => {
    const prisma = {} as PrismaService;
    const repositories = [
      new PrismaAuditLogRepository(prisma),
      new PrismaFeatureFlagRepository(prisma)
    ];

    expect(repositories.map((repository) => repository.mode)).toEqual(repositories.map(() => "prisma-runtime"));
  });
});
