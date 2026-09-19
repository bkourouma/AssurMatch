import { cookies, headers } from "next/headers";
import { listCountryDirectory, type PublicCountryDirectoryItem } from "./public-api";

export const VISITOR_COUNTRY_COOKIE = "am_pays";

/** Headers set by the usual edge providers, tried in order. */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code"] as const;

function normalise(value: string | null | undefined): string | undefined {
  const iso = value?.trim().toUpperCase();
  return iso && /^[A-Z]{2}$/.test(iso) ? iso : undefined;
}

export interface VisitorCountry {
  /** The resolved country, or null when nothing matched a publicly listed country. */
  isoCode: string | null;
  source: "cookie" | "header" | "none";
  directory: PublicCountryDirectoryItem[];
}

/**
 * Reads the visitor country from the `am_pays` cookie, then from geo headers, and keeps it only when
 * it matches a country of the public directory. This never redirects: the visitor stays where they
 * asked to be, and the country is only a default for selectors and local blocks.
 */
export async function readVisitorCountry(): Promise<VisitorCountry> {
  const directoryState = await listCountryDirectory();
  const directory = directoryState.data;
  const known = new Set(directory.map((country) => country.isoCode.toUpperCase()));

  const cookieStore = await cookies();
  const fromCookie = normalise(cookieStore.get(VISITOR_COUNTRY_COOKIE)?.value);
  if (fromCookie && known.has(fromCookie)) return { isoCode: fromCookie, source: "cookie", directory };

  const headerStore = await headers();
  for (const header of COUNTRY_HEADERS) {
    const candidate = normalise(headerStore.get(header));
    if (candidate && known.has(candidate)) return { isoCode: candidate, source: "header", directory };
  }

  return { isoCode: null, source: "none", directory };
}

/** Convenience wrapper when only the ISO code matters. */
export async function readVisitorCountryCode(): Promise<string | null> {
  return (await readVisitorCountry()).isoCode;
}
