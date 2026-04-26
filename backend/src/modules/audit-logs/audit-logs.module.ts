import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext, AuditEntry, AuditResult } from "../common/types";
import type { AuditLogRepository } from "./audit-log-repository";
import { AuditLogWriter } from "./audit-log-writer.service";

export interface AuditSearchFilters {
  action?: string;
  result?: AuditResult;
  targetType?: string;
  targetId?: string;
  actorId?: string;
}

export class AuditLogsService {
  private readonly rbac = new RbacGuard();

  constructor(private readonly writer: AuditLogWriter) {}

  search(actor: ActorContext, filters: AuditSearchFilters = {}): AuditEntry[] {
    this.rbac.assert(actor, "audit_logs:read");
    return this.writer.search(filters);
  }
}

export class AuditLogsModule {
  readonly writer: AuditLogWriter;
  readonly service: AuditLogsService;

  constructor(repository?: AuditLogRepository) {
    this.writer = new AuditLogWriter(repository);
    this.service = new AuditLogsService(this.writer);
  }
}
