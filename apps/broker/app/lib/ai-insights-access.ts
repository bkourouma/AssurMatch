import type { BackOfficeProfile } from "./backoffice-auth";
import type { BrokerAIAssistanceData } from "./broker-api";
import { hasPermission, isReadOnlyBroker } from "./broker-permissions";

/**
 * Lot 3 (spec 069 FR-004): who sees the AI insights of the dashboard (résumé IA de performance,
 * assistant manager). Pure rules, shared by the panel and its tests. The API re-checks plan, flags,
 * partner opt-out, quota and role; the page only avoids showing a surface that would be refused.
 */
export const AI_SUMMARY_FLAG = "ai_summary_enabled";
/** The gateway serves the manager assistant only when this flag is open (exposed by GET /broker/crm/ai-assistance). */
export const AI_MANAGER_FLAG = "ai_broker_assistant_enabled";

/** The panel is visible only if the assistance is active, the summary flag is open and the cabinet is not opted out. */
export function aiInsightsOpen(assistance: Pick<BrokerAIAssistanceData, "enabled" | "flags"> | undefined, optedOut: boolean): boolean {
  if (!assistance || optedOut || !assistance.enabled) return false;
  return assistance.flags.some((flag) => flag.key === AI_SUMMARY_FLAG && flag.value === true);
}

/** Reading the insights: roles that see the whole cabinet (not an advisor limited to his own leads). */
export function canReadAiInsights(profile: BackOfficeProfile): boolean {
  return hasPermission(profile, "broker_crm:read") || hasPermission(profile, "broker_crm:*");
}

/** Generating / validating: the read-only role is excluded; a suspended tenant is handled by `TenantWriteGuard`. */
export function canWriteAiInsights(profile: BackOfficeProfile): boolean {
  return canReadAiInsights(profile) && !isReadOnlyBroker(profile);
}

/** Cheap pre-check before any API read: Starter and a role without CRM read right never reach the assistance status. */
export function aiInsightsPrefetchAllowed(profile: BackOfficeProfile): boolean {
  return profile.partnerPlan !== "starter" && canReadAiInsights(profile);
}

/** Single decision used by the panel: Starter, closed flag, opt-out or a role without read right render nothing. */
export function aiInsightsVisible(profile: BackOfficeProfile, assistance: Pick<BrokerAIAssistanceData, "enabled" | "flags"> | undefined, optedOut: boolean): boolean {
  return aiInsightsPrefetchAllowed(profile) && aiInsightsOpen(assistance, optedOut);
}

/** The « Assistant manager » card (Enterprise) also needs its own gateway flag, independent of the summary flag. */
export function managerAssistantOpen(profile: Pick<BackOfficeProfile, "partnerPlan">, assistance: Pick<BrokerAIAssistanceData, "flags"> | undefined): boolean {
  return profile.partnerPlan === "enterprise" && Boolean(assistance?.flags.some((flag) => flag.key === AI_MANAGER_FLAG && flag.value === true));
}
