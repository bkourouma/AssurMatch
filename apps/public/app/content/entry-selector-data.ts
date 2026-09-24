import type { EntrySelectorCountry, EntrySelectorProduct } from "../components/site/entry-selector";
import { listPublicProducts } from "../lib/public-api";
import { readVisitorCountry } from "../lib/visitor-country";

export interface EntrySelectorData {
  countries: EntrySelectorCountry[];
  products: EntrySelectorProduct[];
  defaultCountry: string | null;
}

/**
 * Shared data fetch for every content page (guide, glossary, FAQ) that embeds the `EntrySelector`
 * (SITE-402). Mirrors the home page's own fetch (visitor country first, then that country's
 * products) so the selector behaves identically everywhere it appears.
 */
export async function getEntrySelectorData(): Promise<EntrySelectorData> {
  const visitor = await readVisitorCountry();
  const selectable = visitor.directory.filter((country) => country.availability !== "waitlist");
  const preselected = selectable.find((country) => country.isoCode === visitor.isoCode) ?? selectable[0];
  const products = preselected ? (await listPublicProducts(preselected.isoCode)).data : [];

  return {
    countries: selectable.map((country) => ({ isoCode: country.isoCode, name: country.name })),
    products: products.map((product) => ({
      key: product.key,
      name: product.name,
      ...(preselected ? { countryIso: preselected.isoCode } : {})
    })),
    defaultCountry: preselected?.isoCode ?? null
  };
}
