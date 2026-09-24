import type { IconName } from "../ui/icons";

/**
 * Icon standing for a product family. The catalogue key is set per country by the back office, so
 * the match is done on substrings of the key in both languages rather than on an exhaustive list;
 * anything unknown falls back to the neutral briefcase.
 */
const PRODUCT_ICONS: ReadonlyArray<readonly [RegExp, IconName]> = [
  [/auto|car|vehic|moto/i, "car"],
  [/travel|voyage|trip/i, "plane"],
  [/health|sante|medic|maladie/i, "heart-pulse"],
  [/home|habitation|logement|house|multirisque/i, "home"],
  [/life|vie|deces/i, "life-buoy"]
];

export function productIcon(productKey: string): IconName {
  const match = PRODUCT_ICONS.find(([pattern]) => pattern.test(productKey));
  return match ? match[1] : "briefcase";
}
