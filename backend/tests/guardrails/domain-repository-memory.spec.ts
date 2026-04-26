import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const extractedDomainFiles = [
  "backend/src/modules/countries/countries.module.ts",
  "backend/src/modules/products/products.module.ts",
  "backend/src/modules/offers/offers.module.ts",
  "backend/src/modules/prospects/prospects.service.ts",
  "backend/src/modules/consent/consent.module.ts",
  "backend/src/modules/quote-requests/quote-submission.service.ts",
  "backend/src/modules/leads/lead-assignment.service.ts",
  "backend/src/modules/leads/routing-decision.service.ts",
  "backend/src/modules/leads/broker-starter-history.service.ts",
  "backend/src/modules/leads/broker-crm-history.service.ts",
  "backend/src/modules/leads/broker-crm-activity.service.ts",
  "backend/src/modules/partners/partners.module.ts",
  "backend/src/modules/partner-licenses/partner-licenses.module.ts",
  "backend/src/modules/notifications/notifications.module.ts"
];

describe("domain repository memory guardrails", () => {
  it("keeps extracted services from declaring primary array/map runtime state", async () => {
    for (const file of extractedDomainFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toMatch(/private readonly \w+:\s*[^=]+?\[\]\s*=\s*\[\]/);
      expect(source, file).not.toMatch(/private readonly \w+\s*=\s*new Map/);
    }
  });

  it("keeps memory adapters isolated in explicit repository files", async () => {
    for (const file of extractedDomainFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toContain('readonly mode = "memory-test"');
    }
  });
});
