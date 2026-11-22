/**
 * Display helpers of the broker billing screen: dates written out (`24 septembre 2026`), as the product
 * wording asks. Amounts are written `45 000 FCFA` by the screens themselves. Pure module, no server import.
 */

// Africa/Abidjan is UTC+0, the platform reference zone: the rendering is the same on server and client.
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Africa/Abidjan" });

/** « 24 septembre 2026 » from an ISO date or instant; an unreadable value is shown as is. */
export function billingDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/** « novembre 2026 » from the first day of the billed period. */
export function billingMonth(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : monthFormat.format(date);
}
