import type { ActorContext } from "../common/types";
import { AuditLogsService, type AuditSearchFilters } from "./audit-logs.module";

export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  search(actor: ActorContext, filters: AuditSearchFilters = {}) {
    return this.auditLogs.search(actor, filters);
  }
}
