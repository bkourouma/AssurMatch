// Dependency-free (no zod) so the admin client bundle can import it.
export type CountryStatusValue = "draft" | "internal" | "partner_test" | "pilot" | "public" | "suspended" | "retired";

/**
 * Spec 050 FR-002: draft -> internal -> partner_test -> pilot -> public. Going back to an earlier
 * operational step, suspending and retiring are always allowed (deactivation needs no condition);
 * a suspended country comes back to internal, pilot or public; retired is terminal.
 * Shared by the API (which enforces it) and the admin status form (which only offers these).
 */
export const COUNTRY_STATUS_TRANSITIONS: Readonly<Record<CountryStatusValue, readonly CountryStatusValue[]>> = {
  draft: ["internal", "suspended", "retired"],
  internal: ["partner_test", "pilot", "suspended", "retired"],
  partner_test: ["internal", "pilot", "suspended", "retired"],
  pilot: ["internal", "partner_test", "public", "suspended", "retired"],
  public: ["internal", "partner_test", "pilot", "suspended", "retired"],
  suspended: ["internal", "pilot", "public", "retired"],
  retired: []
};

/** Statuses a country in `from` may move to (empty for an unknown or terminal status). */
export function allowedCountryStatusTransitions(from: string): readonly CountryStatusValue[] {
  return (COUNTRY_STATUS_TRANSITIONS as Record<string, readonly CountryStatusValue[]>)[from] ?? [];
}
