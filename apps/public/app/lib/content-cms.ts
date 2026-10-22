import { z } from "zod";
import {
  contentLegalSlugs,
  contentSectionSchema,
  isPlainText,
  type ContentCmsLocale,
  type PublicContentResponse
} from "../../../../packages/shared/contracts/content-cms.contracts";

/**
 * Server-side read of the published editorial content (spec 072, `GET /public-content`).
 *
 * The result is only ever used to complete the static copy of the site, so this module never throws:
 * a network error, a timeout (2 s), a non-2xx status, an invalid body or any text that looks like
 * markup all yield the empty response and the site renders its static content.
 */

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 2000;
const REVALIDATE_SECONDS = 60;

/** Defence in depth (the API already refuses markup): no `<`, no `>`, no control characters. */
const text = (max: number) => z.string().min(1).max(max).refine(isPlainText, { message: "markup_not_allowed" });
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const responseSchema = z.object({
  locale: z.enum(["fr", "en"]),
  faq: z.array(z.object({ question: text(300), answer: text(4000), theme: text(80).optional(), productKey: text(40).optional() })),
  guides: z.array(
    z.object({
      slug,
      title: text(200),
      description: text(500),
      updatedAt: isoDate,
      productKey: text(40).optional(),
      sections: z.array(contentSectionSchema).min(1).max(30),
      keyPoints: z.array(text(400)).min(1).max(8),
      mistakes: z.array(text(400)).min(1).max(8),
      compareCta: text(300).optional()
    })
  ),
  glossary: z.array(z.object({ term: text(120), definition: text(3000), seeAlso: z.array(text(120)).max(10).optional() })),
  legal: z.partialRecord(
    z.enum(contentLegalSlugs),
    z.object({
      title: text(200).optional(),
      description: text(500).optional(),
      summary: z.array(text(300)).max(8).optional(),
      updatedAt: isoDate,
      sections: z.array(contentSectionSchema).min(1).max(30),
      placeholders: z.array(text(200)).max(30).optional()
    })
  )
});

export function emptyPublicContent(locale: ContentCmsLocale): PublicContentResponse {
  return { locale, faq: [], guides: [], glossary: [], legal: {} };
}

/** Validates an unknown body; returns the empty response when it does not match the contract. */
export function parsePublicContent(body: unknown, locale: ContentCmsLocale): PublicContentResponse {
  const parsed = responseSchema.safeParse(body);
  // A body for another language is never shown: no cross-language fallback.
  if (!parsed.success || parsed.data.locale !== locale) return emptyPublicContent(locale);
  return parsed.data as PublicContentResponse;
}

/**
 * Reads the published content for one locale (and, for the per-country legal pages, one country).
 * Never throws and never rejects.
 */
export async function fetchPublicContent(locale: ContentCmsLocale, countryCode?: string): Promise<PublicContentResponse> {
  try {
    const params = new URLSearchParams({ locale });
    if (countryCode) params.set("country", countryCode.toUpperCase());
    const response = await fetch(`${PUBLIC_API_BASE_URL}/public-content?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS }
    });
    if (!response.ok) return emptyPublicContent(locale);
    return parsePublicContent(await response.json(), locale);
  } catch {
    return emptyPublicContent(locale);
  }
}
