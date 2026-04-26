import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { DocumentsService } from "../../../src/modules/documents/documents.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("document access RBAC", () => {
  it("denies cross-partner document reads", async () => {
    const documents = new DocumentsService(new AuditLogWriter());
    const document = documents.register({
      partnerTenantId: "00000000-0000-4000-8000-000000000020",
      documentType: "license",
      storageKey: "partners/one/license.pdf",
      checksum: "sha256:test",
      status: "accepted"
    }, superAdminActor);

    expect(() => documents.getAuthorized(document.id, {
      actorId: "00000000-0000-4000-8000-000000000021",
      roles: ["broker_read_only"],
      partnerTenantId: "00000000-0000-4000-8000-000000000022",
      mfaVerified: true
    })).toThrow();
  });
});
