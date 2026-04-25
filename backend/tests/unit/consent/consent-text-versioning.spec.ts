import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("consent text versioning", () => {
  it("makes published consent texts immutable", () => {
    const service = new ConsentService(new AuditLogWriter());
    const text = service.createText({
      purpose: "lead_transmission",
      countryId: "00000000-0000-4000-8000-000000000030",
      channel: "public_web",
      recipientCategory: "partner_broker",
      language: "fr",
      version: "1",
      status: "review",
      contentHash: "hash-v1"
    }, superAdminActor);
    service.publishText(text.id, superAdminActor);

    expect(() => service.updatePublishedText()).toThrow("immutable");
  });
});
