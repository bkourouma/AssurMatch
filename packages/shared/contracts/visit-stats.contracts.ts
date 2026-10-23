import { z } from "zod";

/**
 * Spec 073 FR-006 to FR-010 (hypothesis H5): visit counting is a server-side counter per UTC day and
 * per page key. No cookie, no IP address, no user agent, no referrer and no visitor identifier is
 * ever sent or stored: the only thing that travels is one key from this closed list.
 */
export const VISIT_PAGE_KEYS = [
  "home",
  "countries",
  "country",
  "product",
  "offers",
  "offer",
  "compare",
  "quote_form",
  "quote_submitted",
  "tracking",
  "other"
] as const;

export type VisitPageKey = (typeof VISIT_PAGE_KEYS)[number];

export function isVisitPageKey(value: unknown): value is VisitPageKey {
  return typeof value === "string" && (VISIT_PAGE_KEYS as readonly string[]).includes(value);
}

/** Body of `POST /public-stats/visits`; any other property is refused. */
export const visitRecordInputSchema = z.object({ page: z.enum(VISIT_PAGE_KEYS) }).strict();

export type VisitRecordInput = z.infer<typeof visitRecordInputSchema>;

export interface VisitPageTotal {
  page: VisitPageKey;
  total: number;
}

/** Page views (not unique visitors, FR-010) over a period. */
export interface VisitTotals {
  total: number;
  byPage: VisitPageTotal[];
}
