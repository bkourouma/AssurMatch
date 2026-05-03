import type { ActorContext } from "../common/types";
import { FeatureFlagsService } from "./feature-flags.module";

export class RapidDisableService {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  async disable(scopeType: "global" | "country" | "product" | "partner" | "module" | "ai", scopeId: string | undefined, key: string, reason: string, actor: ActorContext) {
    return this.featureFlags.setFlag(
      {
        key,
        scopeType,
        ...(scopeId ? { scopeId } : {}),
        value: false,
        reason
      },
      actor,
      { allowSensitiveDisable: true }
    );
  }
}
