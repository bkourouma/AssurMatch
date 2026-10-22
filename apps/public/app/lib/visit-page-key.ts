/**
 * Spec 073 FR-008: the only thing the visit beacon ever sends is one key from this closed list,
 * derived from the route shape. Identifiers in the path (country code, offer id, quote-request
 * reference) are read to pick the key and are never sent. The list mirrors
 * `packages/shared/contracts/visit-stats.contracts.ts`.
 */
export type VisitPageKey =
  | "home"
  | "countries"
  | "country"
  | "product"
  | "offers"
  | "offer"
  | "compare"
  | "quote_form"
  | "quote_submitted"
  | "tracking"
  | "other";

const COUNTRIES = new Set(["pays", "countries"]);
const PRODUCTS = new Set(["produits", "products"]);
const OFFERS_LIST = new Set(["offres", "offers"]);
const QUOTE_FORM = new Set(["devis", "quote"]);
const COMPARE = new Set(["comparer", "compare"]);
const QUOTE_REQUESTS = new Set(["demandes-de-devis", "quote-requests"]);
const TRACKING = new Set(["suivi", "track"]);

/** Maps a browser pathname (French or English, with or without the `/en` prefix) to a page key. */
export function visitPageKey(pathname: string): VisitPageKey {
  const segments = pathname.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  if (segments[0] === "en") segments.shift();
  const [first, second, third, fourth, fifth] = segments;
  if (!first) return "home";
  if (COMPARE.has(first)) return "compare";
  if (TRACKING.has(first)) return "tracking";
  if (OFFERS_LIST.has(first)) return second && segments.length === 2 ? "offer" : "other";
  if (QUOTE_REQUESTS.has(first)) return second ? (segments.length === 2 ? "quote_submitted" : "tracking") : "other";
  if (COUNTRIES.has(first)) {
    if (!second) return "countries";
    if (segments.length === 2) return "country";
    if (third && PRODUCTS.has(third) && fourth) {
      if (segments.length === 4) return "product";
      if (segments.length === 5 && fifth && OFFERS_LIST.has(fifth)) return "offers";
      if (segments.length === 5 && fifth && QUOTE_FORM.has(fifth)) return "quote_form";
    }
  }
  return "other";
}
