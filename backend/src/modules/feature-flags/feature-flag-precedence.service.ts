export interface FlagRecord {
  key: string;
  scopeType: "global" | "country" | "product" | "partner" | "plan" | "module" | "ai";
  scopeId?: string;
  value: boolean;
}

export class FeatureFlagPrecedenceService {
  resolve(key: string, flags: FlagRecord[], requestedScopes: Array<{ scopeType: FlagRecord["scopeType"]; scopeId?: string }>): boolean {
    const global = flags.find((flag) => flag.key === key && flag.scopeType === "global");
    if (global?.value === false) return false;
    for (const scope of requestedScopes) {
      const scoped = flags.find((flag) => flag.key === key && flag.scopeType === scope.scopeType && flag.scopeId === scope.scopeId);
      if (scoped?.value === false) return false;
    }
    for (const scope of requestedScopes.toReversed()) {
      const scoped = flags.find((flag) => flag.key === key && flag.scopeType === scope.scopeType && flag.scopeId === scope.scopeId);
      if (scoped?.value === true) return true;
    }
    return global?.value ?? false;
  }
}
