import type { AIModuleConfigDto } from "../../../../packages/shared/contracts/ops.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { AIService, type AIModuleConfig } from "./ai.module";

export class AdminAIModulesController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly ai: AIService) {}

  list(actor: ActorContext): AIModuleConfig[] {
    this.rbac.assert(actor, "ai:read");
    return this.ai.list();
  }

  configure(actor: ActorContext, id: string, input: AIModuleConfigDto): AIModuleConfig {
    this.rbac.assert(actor, "ai:update");
    return this.ai.configure(id, input, actor);
  }
}
