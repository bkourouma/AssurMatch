import type { BrokerCrmExportQuery, BrokerCrmLeadSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { BrokerCrmAccessPolicy } from "./broker-crm-access-policy";

export class BrokerCrmExportPolicy {
  constructor(private readonly access: BrokerCrmAccessPolicy, private readonly audit: AuditLogWriter) {}

  assertCanExport(actor: ActorContext, query: BrokerCrmExportQuery): void {
    this.access.assertExport(actor);
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
      context: { rowCount: limited.length }
    });
    const header = ["reference", "country", "product", "status", "urgency", "source", "advisor"];
    const body = limited.map((row) => [row.publicReference, row.countryCode, row.productKey, row.status, row.urgency, row.source, row.advisorId ?? ""].map(this.escape).join(","));
    return [header.join(","), ...body].join("\n");
  }

  private escape(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }
}
