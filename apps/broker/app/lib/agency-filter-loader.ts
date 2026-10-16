import type { BackOfficeProfile } from "./backoffice-auth";
import { resolveAgencyFilter } from "./agency-filter";
import type { AgencyFilter } from "./agency-filter";
import { readBrokerAgencies } from "./broker-api";

/**
 * Spec 064: server-side loader of the agency display filter. Non-Enterprise cabinets make no extra API
 * call and get no control. A failed agencies read disables the filter (the lists stay unfiltered).
 */
export async function loadAgencyFilter(profile: Pick<BackOfficeProfile, "partnerPlan" | "actorId">, param: string | string[] | undefined): Promise<AgencyFilter> {
  if (profile.partnerPlan !== "enterprise") return resolveAgencyFilter({ plan: profile.partnerPlan, agencies: [] });
  try {
    const agencies = await readBrokerAgencies();
    return resolveAgencyFilter({
      plan: profile.partnerPlan,
      actorId: profile.actorId,
      agencies: agencies.status === "success" ? agencies.data : [],
      param
    });
  } catch {
    return resolveAgencyFilter({ plan: profile.partnerPlan, agencies: [] });
  }
}
