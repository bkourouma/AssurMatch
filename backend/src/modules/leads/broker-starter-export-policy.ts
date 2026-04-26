import type { BrokerStarterExportQuery, BrokerStarterLeadSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerStarterAccessPolicy } from "./broker-starter-access-policy";

const CSV_COLUMNS = ["leadAssignmentId", "publicReference", "countryCode", "productKey", "status", "assignedAt", "seen"] as const;

export class BrokerStarterExportPolicy {
  constructor(private readonly access: BrokerStarterAccessPolicy, private readonly audit: AuditLogWriter) {}

  assertCanExport(actor: ActorContext, query: BrokerStarterExportQuery): void {
    this.access.assertExportAccess(actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterExportRequested,
      targetType: "LeadAssignment",
      targetId: "export",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { filters: this.safeFilters(query), columns: CSV_COLUMNS }
    });
  }

  toCsv(actor: ActorContext, rows: BrokerStarterLeadSummary[], query: BrokerStarterExportQuery): string {
    const maxRows = typeof query.maxRows === "number" ? query.maxRows : 500;
    const limitedRows = rows.slice(0, maxRows);
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerStarterExportCompleted,
      targetType: "LeadAssignment",
      targetId: "export",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { rowCount: limitedRows.length, filters: this.safeFilters(query), columns: CSV_COLUMNS }
    });
    return [
      CSV_COLUMNS.join(","),
      ...limitedRows.map((row) => CSV_COLUMNS.map((column) => this.csvValue(row[column])).join(","))
    ].join("\n");
  }

  private csvValue(value: unknown): string {
    const raw = String(value ?? "");
    return `"${raw.replaceAll('"', '""')}"`;
  }

  private safeFilters(query: BrokerStarterExportQuery): Record<string, unknown> {
    return {
      status: query.status,
      productKey: query.productKey,
      countryCode: query.countryCode,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      maxRows: query.maxRows
    };
  }
}
