import type { FeatureFlagCacheService } from "./feature-flag-cache.service";
import { FeatureFlagPrecedenceService, type FlagRecord } from "./feature-flag-precedence.service";

export class FeatureFlagResolverService {
  private readonly precedence = new FeatureFlagPrecedenceService();

  constructor(private readonly cache?: FeatureFlagCacheService) {}

  async isEnabled(key: string, flags: FlagRecord[], scopes: Array<{ scopeType: FlagRecord["scopeType"]; scopeId?: string }> = []): Promise<boolean> {
    if (this.cache) {
      const cached = await this.cache.get(key, "global");
      if (cached?.value === false) return false;
    }
    return this.precedence.resolve(key, flags, scopes);
  }
}
