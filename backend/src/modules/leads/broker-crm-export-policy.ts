import type { BrokerCrmExportQuery, BrokerCrmLeadSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";
import { csvCell } from "./csv-cell";

const CSV_COLUMNS = ["reference", "country", "product", "status", "urgency", "source", "advisor"] as const;

export class BrokerCrmExportPolicy {
  constructor(private readonly access: BrokerCrmAccessPolicy, private readonly audit: AuditLogWriter) {}

  assertCanExport(actor: ActorContext, query: BrokerCrmExportQuery): void {
    this.access.assertExport(actor);
    // Spec 064 (FR-002): the request is audited before the export, with the filters and no personal data.
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmExportRequested,
      targetType: "BrokerCrmExport",
      targetId: "export",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { filters: this.safeFilters(query), maxRows: Number(query.maxRows ?? 500), columns: CSV_COLUMNS }
    });
    const maxRows = Number(query.maxRows ?? 500);
    if (maxRows > 2000) {
      throw new Error("CRM export scope too broad");
    }
  }

  toCsv(actor: ActorContext, rows: BrokerCrmLeadSummary[], query: BrokerCrmExportQuery): string {
    const limited = rows.slice(0, Number(query.maxRows ?? 500));
    this.audit.write({
      actor,
      action: QuoteAuditActions.brokerCrmExportCompleted,
      targetType: "BrokerCrmExport",
      targetId: "export",
      scope: { partnerTenantId: actor.partnerTenantId },
      result: "success",
      context: { rowCount: limited.length, filters: this.safeFilters(query), columns: CSV_COLUMNS }
    });
    const body = limited.map((row) => [row.publicReference, row.countryCode, row.productKey, row.status, row.urgency, row.source, row.advisorId ?? ""].map(csvCell).join(","));
    return [CSV_COLUMNS.join(","), ...body].join("\n");
  }

  /** Filters only (no contact data, no identifier of a person): an advisor filter is reported as a flag. */
  private safeFilters(query: BrokerCrmExportQuery): Record<string, unknown> {
    return {
      status: query.status,
      productKey: query.productKey,
      countryCode: query.countryCode,
      urgency: query.urgency,
      source: query.source,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      agencyId: query.agencyId,
      hasAdvisorFilter: Boolean(query.advisorId),
      hasSearch: Boolean(query.search)
    };
  }
}
