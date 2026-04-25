import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { RapidDisableService } from "../../../src/modules/feature-flags/rapid-disable.service";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("emergency disable", () => {
  it("records a country disable immediately with audit evidence", async () => {
    const audit = new AuditLogWriter();
    const flags = new FeatureFlagsService(audit);
    const disable = new RapidDisableService(flags);
    const flag = await disable.disable("country", "ci", "country_public_enabled", "emergency compliance hold", superAdminActor);

    expect(flag.value).toBe(false);
    expect(audit.all()[0]?.occurredAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
