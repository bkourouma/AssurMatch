import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { DocumentsService } from "../../../src/modules/documents/documents.module";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("document RBAC refusal", () => {
  it("audits refused access without document permission", async () => {
    const audit = new AuditLogWriter();
    const documents = new DocumentsService(audit);
    const document = documents.register({
      partnerTenantId: "00000000-0000-4000-8000-000000000060",
      documentType: "license",
      storageKey: "partners/doc.pdf",
      checksum: "sha256:test"
    }, superAdminActor);

    expect(() => documents.getAuthorized(document.id, { roles: ["broker_read_only"], partnerTenantId: "00000000-0000-4000-8000-000000000061" })).toThrow();
    expect(audit.all().some((entry) => entry.action === "accreditation_document.access_refused")).toBe(true);
  });
});
