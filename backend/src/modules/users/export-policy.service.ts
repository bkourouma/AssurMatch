import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext, ScopedResource } from "../common/types";
import { RbacGuard } from "../auth/guards/rbac.guard";

export class ExportPolicyService {
  private readonly rbac = new RbacGuard();

  constructor(private readonly audit: AuditLogWriter) {}

  assertCanExport(actor: ActorContext, resource: ScopedResource, targetType: string): void {
    if (!this.rbac.can(actor, `${targetType}:export`, resource)) {
      this.audit.write({
        actor,
        action: "export.refused",
        targetType,
        targetId: "requested-export",
        scope: { ...resource },
        result: "refused",
        reason: "missing export permission",
        context: {}
      });
      throw new Error("Export denied");
    }
  }
}
