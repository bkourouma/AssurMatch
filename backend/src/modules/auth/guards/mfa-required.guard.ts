import type { ActorContext } from "../../common/types";

const SENSITIVE_PREFIXES = ["admin:", "users:", "roles:", "feature_flags:", "partners:", "licenses:", "documents:", "ai:"];

export class MfaRequiredGuard {
  requiresMfa(permission: string): boolean {
    return SENSITIVE_PREFIXES.some((prefix) => permission.startsWith(prefix));
  }

  assert(actor: ActorContext, permission: string): void {
    if (this.requiresMfa(permission) && !actor.mfaVerified) {
      throw new Error("MFA required");
    }
  }
}
