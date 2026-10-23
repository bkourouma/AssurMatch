/**
 * Pure helpers of the public quote journey (spec 067). No React, no Next, no browser global: the
 * server is the authority on every rule below, these only spare the visitor a round trip.
 */

/** COMP-009: the primary offer plus at most two more. Mirrors `MAX_QUOTE_OFFERS` of the shared contract. */
export const MAX_QUOTE_OFFERS = 3;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offer ids of the `?offerId=` query, repeated or not: valid UUIDs only, de-duplicated (case
 * insensitive, first occurrence wins), at most {@link MAX_QUOTE_OFFERS}. The first one is the primary offer.
 */
export function readQuoteOfferIds(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    const candidate = item.trim();
    if (!UUID_PATTERN.test(candidate)) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(candidate);
    if (ids.length >= MAX_QUOTE_OFFERS) break;
  }
  return ids;
}

export interface QuoteMarketingSourceValue {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrerHost?: string;
}

const MARKETING_VALUE_MAX = 100;

function cleanMarketingValue(value: string | null): string | undefined {
  const trimmed = value?.trim().slice(0, MARKETING_VALUE_MAX).trim();
  return trimmed ? trimmed : undefined;
}

function externalReferrerHost(referrer: string, ownHost: string): string | undefined {
  if (!referrer.trim()) return undefined;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const host = url.host.toLowerCase();
    if (!host || host === ownHost.trim().toLowerCase()) return undefined;
    return host.slice(0, 255);
  } catch {
    return undefined;
  }
}

/**
 * Declarative marketing source of a request: the `utm_*` parameters of the page address and the HOST
 * of an external referrer (never its full URL, path or parameters). Returns `undefined` when nothing
 * is there, so nothing is sent. No cookie and no browser storage is involved.
 */
export function readMarketingSource(search: string, referrer: string, ownHost: string): QuoteMarketingSourceValue | undefined {
  const params = new URLSearchParams(search);
  const source: QuoteMarketingSourceValue = {};
  const entries: Array<[keyof QuoteMarketingSourceValue, string]> = [
    ["utmSource", "utm_source"],
    ["utmMedium", "utm_medium"],
    ["utmCampaign", "utm_campaign"],
    ["utmTerm", "utm_term"],
    ["utmContent", "utm_content"]
  ];
  for (const [key, param] of entries) {
    const value = cleanMarketingValue(params.get(param));
    if (value) source[key] = value;
  }
  const referrerHost = externalReferrerHost(referrer, ownHost);
  if (referrerHost) source.referrerHost = referrerHost;
  return Object.keys(source).length > 0 ? source : undefined;
}

export const STAGED_DOCUMENT_MAX_FILES = 5;
export const STAGED_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const STAGED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const STAGED_DOCUMENT_LABEL_MAX = 120;

export type StagedFileProblem = "empty" | "type" | "size" | "count";

/** Client-side convenience check of a file picked for the optional documents step; the server re-checks everything. */
export function validateStagedFile(file: { size: number; type: string }, alreadyStaged: number): StagedFileProblem | null {
  if (alreadyStaged >= STAGED_DOCUMENT_MAX_FILES) return "count";
  if (file.size <= 0) return "empty";
  if (!(STAGED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > STAGED_DOCUMENT_MAX_BYTES) return "size";
  return null;
}

/** Default label of a staged document: the file name without its extension, within the label limit. */
export function defaultDocumentLabel(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim().slice(0, STAGED_DOCUMENT_LABEL_MAX).trim();
}

/** "A, B et C" / "A, B, and C" depending on the locale. */
export function formatNameList(names: readonly string[], locale: string): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  try {
    return new Intl.ListFormat(locale, { type: "conjunction", style: "long" }).format(clean);
  } catch {
    return clean.join(", ");
  }
}

/** "First Last" with whichever part is present; empty string when none is. */
export function joinPersonName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}
