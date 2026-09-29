import type { RoutingAnomalyReport } from "../../../../packages/shared/contracts/dashboard.contracts";
import type { AiInteraction } from "../../../../packages/shared/contracts/ai.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import type { RoutingAnomalyDetectorService } from "./routing-anomaly-detector.service";
import type { AdminAiService } from "../ai/admin-ai.service";

export class AdminRoutingAnomaliesController {
  private readonly rbac = new RbacGuard();

  constructor(
    private readonly detector: RoutingAnomalyDetectorService,
    private readonly adminAi?: AdminAiService
  ) {}

  async list(actor: ActorContext, query?: { from?: string; to?: string }): Promise<RoutingAnomalyReport> {
    this.rbac.assert(actor, "routing_rules:read");
    return this.detector.detectAnomalies(actor, query);
  }

  async analyze(actor: ActorContext, body?: unknown): Promise<AiInteraction> {
    this.rbac.assert(actor, "routing_rules:read");
    if (!this.adminAi) {
      throw new Error("Admin AI service is not configured");
    }
    return this.adminAi.request("routing_anomaly_analysis", body ?? {}, actor);
  }
}
