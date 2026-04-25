import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { SystemHealthService, type SystemHealth } from "./system-health.module";

export class SystemHealthController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly health: SystemHealthService) {}

  get(actor: ActorContext): Promise<SystemHealth> {
    this.rbac.assert(actor, "audit_logs:read");
    return this.health.check();
  }
}
