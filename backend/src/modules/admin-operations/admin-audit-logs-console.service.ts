import {
  AUDIT_LOG_EXPORT_MAX_ROWS,
  type AdminAuditLogExport,
  type AdminAuditLogItem,
  type AdminAuditLogQuery,
  type AdminPage
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogSearchFilter } from "../audit-logs/audit-log-repository";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext, AuditEntry } from "../common/types";
import { AUDIT_EXPORT_ROLES, AUDIT_READER_ROLES, parseDateFilter, type AdminOperationsAccess } from "./admin-operations-access";

export interface AdminAuditLogsConsoleDeps {
  audit: AuditLogWriter;
  access: AdminOperationsAccess;
  now?: () => Date;
}

const CSV_COLUMNS = ["occurredAt", "actorId", "action", "targetType", "targetId", "result", "reason", "correlationId", "scope", "context"] as const;

/** H-05: audit-log search over the durable store, and a restricted, audited CSV export. */
export class AdminAuditLogsConsoleService {
  constructor(private readonly deps: AdminAuditLogsConsoleDeps) {}

  async search(actor: ActorContext, query: AdminAuditLogQuery): Promise<AdminPage<AdminAuditLogItem>> {
    this.deps.access.assert(actor, { roles: AUDIT_READER_ROLES }, { type: "AuditLog", id: "search" });
    const result = await this.deps.audit.searchDurable(toFilter(query), { skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    // Written after the read, so the search does not list itself on its own first page.
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.auditLogsSearched,
      targetType: "AuditLog",
      targetId: "search",
      result: "success",
      context: { total: result.total, page: query.page, filters: filterSummary(query) }
    });
    return { items: result.items.map(toItem), total: result.total, page: query.page, pageSize: query.pageSize };
  }

  async export(actor: ActorContext, query: AdminAuditLogQuery): Promise<AdminAuditLogExport> {
    const target = { type: "AuditLog", id: "export" };
    this.deps.access.assert(actor, { roles: AUDIT_EXPORT_ROLES }, target, ADMIN_OPERATIONS_AUDIT_ACTIONS.auditLogsExportRefused);
    const result = await this.deps.audit.searchDurable(toFilter(query), { skip: 0, take: AUDIT_LOG_EXPORT_MAX_ROWS });
    const rows = result.items.map(toItem);
    const csv = [CSV_COLUMNS.join(","), ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(cellValue(row, column))).join(","))].join("\r\n");
    const truncated = result.total > rows.length;
    // The export is itself evidence: who extracted what, with which filters and how many rows.
    await this.deps.audit.writeAsync({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.auditLogsExported,
      targetType: "AuditLog",
      targetId: "export",
      result: "success",
      context: { rowCount: rows.length, total: result.total, truncated, filters: filterSummary(query) }
    });
    const stamp = (this.deps.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    return { fileName: `audit-logs-${stamp}.csv`, contentType: "text/csv; charset=utf-8", rowCount: rows.length, truncated, csv };
  }
}

function toFilter(query: AdminAuditLogQuery): AuditLogSearchFilter {
  return {
    actorId: query.actorId,
    action: query.action,
    targetType: query.targetType,
    targetId: query.targetId,
    result: query.result,
    from: parseDateFilter(query.from, "from"),
    to: parseDateFilter(query.to, "to")
  };
}

function toItem(entry: AuditEntry): AdminAuditLogItem {
  return {
    id: entry.id,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    result: entry.result,
    reason: entry.reason ?? null,
    scope: entry.scope ?? {},
    context: entry.context ?? {},
    correlationId: entry.correlationId ?? null,
    occurredAt: entry.occurredAt instanceof Date ? entry.occurredAt.toISOString() : new Date(entry.occurredAt).toISOString()
  };
}

function cellValue(row: AdminAuditLogItem, column: (typeof CSV_COLUMNS)[number]): string {
  const value = row[column];
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** RFC 4180 quoting, plus a leading apostrophe on formula-like cells (CSV injection). */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function filterSummary(query: AdminAuditLogQuery): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ actorId: query.actorId, action: query.action, targetType: query.targetType, targetId: query.targetId, result: query.result, from: query.from, to: query.to })
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
