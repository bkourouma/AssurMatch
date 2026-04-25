import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { FeatureFlagsService, type FeatureFlag } from "./feature-flags.module";

export class AdminFeatureFlagsController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly featureFlags: FeatureFlagsService) {}

  list(actor: ActorContext): FeatureFlag[] {
    this.rbac.assert(actor, "feature_flags:read");
    return this.featureFlags.list();
  }

  update(actor: ActorContext, input: Omit<FeatureFlag, "id" | "changedAt" | "cacheVersion">): Promise<FeatureFlag> {
    this.rbac.assert(actor, "feature_flags:update");
    if (input.reason.trim().length < 8) throw new Error("Reason is required");
    return this.featureFlags.setFlag(input, actor);
  }
}
