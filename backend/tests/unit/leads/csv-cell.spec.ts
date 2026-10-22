import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerCrmAccessPolicy } from "../../../src/modules/leads/broker-crm-access-policy";
import { BrokerCrmExportPolicy } from "../../../src/modules/leads/broker-crm-export-policy";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterExportPolicy } from "../../../src/modules/leads/broker-starter-export-policy";
import { csvCell } from "../../../src/modules/leads/csv-cell";

describe("csvCell (spec 064 formula neutralisation)", () => {
  it("quotes every cell and doubles inner quotes", () => {
    expect(csvCell("AM-1")).toBe('"AM-1"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(false)).toBe('"false"');
  });

  it("prefixes a single quote to values a spreadsheet would read as a formula", () => {
    for (const dangerous of ["=1+1", "+33102030405", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd", '=HYPERLINK("http://x","y")']) {
      const cell = csvCell(dangerous);
      expect(cell.startsWith(`"'`), dangerous).toBe(true);
    }
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell('=HYPERLINK("u")')).toBe(`"'=HYPERLINK(""u"")"`);
    expect(csvCell("2026-01-01")).toBe('"2026-01-01"');
  });
});

describe("export policies neutralise formulas and audit the request (spec 064)", () => {
  it("neutralises the Starter export cells", () => {
    const audit = new AuditLogWriter();
    const owner: ActorContext = { actorId: "o", roles: ["broker_owner_starter"], partnerTenantId: "t", mfaVerified: true };
    const policy = new BrokerStarterExportPolicy(new BrokerStarterAccessPolicy(audit), audit);
    policy.assertCanExport(owner, {});
    const csv = policy.toCsv(owner, [{ leadAssignmentId: "l", publicReference: "=cmd|' /C calc'!A0", countryCode: "CI", productKey: "@auto", status: "assigned", assignedAt: "2026-04-25T00:00:00.000Z", seen: false }], {});
    const [, row] = csv.split("\n");
    expect(row).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(row).toContain(`"'@auto"`);
    expect(audit.search({ action: QuoteAuditActions.brokerStarterExportRequested })).toHaveLength(1);
    expect(audit.search({ action: QuoteAuditActions.brokerStarterExportCompleted })).toHaveLength(1);
  });

  it("neutralises the CRM export cells and audits requested then completed without personal data", () => {
    const audit = new AuditLogWriter();
    const owner: ActorContext = { actorId: "o", roles: ["broker_owner_pro"], partnerTenantId: "t", partnerPlan: "pro", mfaVerified: true };
    const policy = new BrokerCrmExportPolicy(new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: true }), audit);
    const query = { maxRows: 5, status: "nouveau" as const, search: "Ama Kone", advisorId: "advisor-1" };
    policy.assertCanExport(owner, query);
    const csv = policy.toCsv(owner, [{ leadAssignmentId: "l", publicReference: "+1", countryCode: "CI", productKey: "auto", status: "nouveau", urgency: "normal", source: "quote_request", assignedAt: "2026-04-25T00:00:00.000Z", advisorId: "-3", isShared: false, recipientCount: 1 }], query);
    const [header, row] = csv.split("\n");
    expect(header).toBe("reference,country,product,status,urgency,source,advisor");
    expect(row).toBe(`"'+1","CI","auto","nouveau","normal","quote_request","'-3"`);
    const requested = audit.search({ action: QuoteAuditActions.brokerCrmExportRequested });
    expect(requested).toHaveLength(1);
    expect(requested[0]?.context).toMatchObject({ maxRows: 5, filters: { status: "nouveau", hasAdvisorFilter: true, hasSearch: true } });
    expect(JSON.stringify(requested[0])).not.toMatch(/Ama|Kone|advisor-1/);
    expect(audit.search({ action: QuoteAuditActions.brokerCrmExportCompleted })[0]?.context).toMatchObject({ rowCount: 1 });
  });
});
