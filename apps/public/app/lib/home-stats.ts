import type { PublicCountryDirectoryItem, PublicStats } from "./public-api";

export type HomeFigureKey = "countriesCount" | "partnersCount" | "offersCount";
export interface HomeFigure {
  key: HomeFigureKey;
  value: number;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Figures of the home information line. The number of open countries comes from the public
 * directory the page already reads (countries whose availability is not "waitlist"), because
 * `/public-stats` computes it with default global flags and can say 0 while a country is public.
 * With an empty directory the countries figure is left out rather than taken from the stats.
 * A figure the endpoint did not send is omitted; three zeros hide the whole block (D-Chiffres).
 */
export function buildHomeFigures(
  stats: Pick<PublicStats, "openCountries" | "activeBrokers" | "validatedOffers"> | null,
  directory: ReadonlyArray<Pick<PublicCountryDirectoryItem, "availability">>
): HomeFigure[] {
  const openCountries = directory.filter((country) => country.availability !== "waitlist").length;
  const figures: Array<{ key: HomeFigureKey; value: number | undefined }> = [
    { key: "countriesCount", value: directory.length > 0 ? openCountries : undefined },
    { key: "partnersCount", value: finite(stats?.activeBrokers) },
    { key: "offersCount", value: finite(stats?.validatedOffers) }
  ];
  const present = figures.filter((figure): figure is HomeFigure => figure.value !== undefined);
  return present.every((figure) => figure.value === 0) ? [] : present;
}
