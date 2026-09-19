/**
 * Money and date formatting bound to the visitor locale AND to the country being browsed, so a
 * Senegalese offer is never rendered with a hard-coded fr-FR / XOF pair.
 */

const DEFAULT_CURRENCY = "XOF";

/** Currency used by default for each pilot country, when the API does not send one. */
const countryCurrencies: Record<string, string> = {
  BJ: "XOF",
  BF: "XOF",
  CI: "XOF",
  GW: "XOF",
  ML: "XOF",
  NE: "XOF",
  SN: "XOF",
  TG: "XOF",
  CM: "XAF",
  CF: "XAF",
  CG: "XAF",
  GA: "XAF",
  GQ: "XAF",
  TD: "XAF",
  CD: "CDF",
  GN: "GNF",
  MA: "MAD",
  TN: "TND",
  DZ: "DZD",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  RW: "RWF",
  FR: "EUR"
};

/** Time zone used by default for each pilot country, when the API does not send one. */
const countryTimeZones: Record<string, string> = {
  BJ: "Africa/Porto-Novo",
  BF: "Africa/Ouagadougou",
  CI: "Africa/Abidjan",
  GW: "Africa/Bissau",
  ML: "Africa/Bamako",
  NE: "Africa/Niamey",
  SN: "Africa/Dakar",
  TG: "Africa/Lome",
  CM: "Africa/Douala",
  CD: "Africa/Kinshasa",
  GN: "Africa/Conakry",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  DZ: "Africa/Algiers",
  NG: "Africa/Lagos",
  GH: "Africa/Accra",
  KE: "Africa/Nairobi",
  RW: "Africa/Kigali",
  FR: "Europe/Paris"
};

/** Builds a BCP 47 tag from the visitor locale and the country being browsed, e.g. `fr-CI`. */
export function countryLocale(locale: string, iso?: string): string {
  const language = locale.split("-")[0] ?? "fr";
  const region = iso?.trim().toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? `${language}-${region}` : language;
}

export function countryCurrency(iso?: string): string {
  const region = iso?.trim().toUpperCase();
  return (region ? countryCurrencies[region] : undefined) ?? DEFAULT_CURRENCY;
}

export function countryTimeZone(iso?: string): string {
  const region = iso?.trim().toUpperCase();
  return (region ? countryTimeZones[region] : undefined) ?? "Africa/Abidjan";
}

export interface MoneyOptions {
  locale: string;
  iso?: string;
  currency?: string;
}

/** Returns `undefined` when there is no amount, so the caller decides on its own fallback wording. */
export function formatMoney(value: number | undefined, options: MoneyOptions): string | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  const currency = options.currency ?? countryCurrency(options.iso);
  const tag = countryLocale(options.locale, options.iso);
  try {
    return new Intl.NumberFormat(tag, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${new Intl.NumberFormat(tag).format(value)} ${currency}`;
  }
}

export interface DateOptions {
  locale: string;
  countryIso?: string;
  timeZone?: string;
}

/** Formats an ISO date (or date-time) as a readable day, in the country time zone. */
export function formatDate(iso: string, options: DateOptions): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const tag = countryLocale(options.locale, options.countryIso);
  const timeZone = options.timeZone ?? countryTimeZone(options.countryIso);
  try {
    return new Intl.DateTimeFormat(tag, { day: "2-digit", month: "long", year: "numeric", timeZone }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
