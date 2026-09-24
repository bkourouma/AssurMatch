import type { CountryLegalOverride } from "../shared-types";
import { ciLegalOverride } from "./CI";

/** ISO country code (upper case) -> that country's legal overrides. Add a file per country here. */
export const countryLegalOverrides: Record<string, CountryLegalOverride> = {
  CI: ciLegalOverride
};
