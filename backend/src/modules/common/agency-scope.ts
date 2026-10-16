import type { ActorContext } from "./types";

/** Tells whether a lead belongs to the selected agency, from the advisor it is assigned to. */
export type AdvisorAgencyPredicate = (advisorId: string | undefined) => boolean;

/**
 * Spec 064 (agency display filter): resolves the optional `agencyId` query parameter of the Enterprise
 * lead and dashboard views. It is a DISPLAY filter applied after the access policies, so it can only
 * narrow what the actor already sees. `undefined` means "no filtering" (no parameter, or a tenant
 * that is not Enterprise: the parameter is then ignored).
 */
export interface AgencyScopePort {
  resolve(actor: ActorContext, agencyId: string | undefined): Promise<AdvisorAgencyPredicate | undefined>;
}
