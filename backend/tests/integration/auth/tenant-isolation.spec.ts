import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { DocumentsService } from "../../../src/modules/documents/documents.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("broker tenant isolation", () => {
  it("prevents one broker tenant from reading another tenant document", async () => {
    const documents = new DocumentsService(new AuditLogWriter());
    const document = documents.register({
      partnerTenantId: "00000000-0000-4000-8000-000000000050",
      documentType: "mandate",
      storageKey: "partners/a/mandate.pdf",
      checksum: "sha256:test",
      status: "accepted"
    }, superAdminActor);

    expect(() => documents.getAuthorized(document.id, {
      roles: ["broker_agent"],
      partnerTenantId: "00000000-0000-4000-8000-000000000051",
      mfaVerified: true
    })).toThrow("Document access denied");
  });
});
