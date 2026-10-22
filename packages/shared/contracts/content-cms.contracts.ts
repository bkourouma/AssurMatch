import { z } from "zod";

/**
 * Lot 9 (spec 072): minimal CMS for the Content Admin role. One generic, versioned entry table
 * serves four kinds of editorial content (FAQ, guides, glossary, per-country legal overrides). The
 * contract is shared by the API, the admin back-office (editing) and the public site (reading the
 * published content only).
 *
 * Content is PLAIN TEXT. Markup is refused at the schema level (no `<` or `>`), so the public site
 * can render every value as an ordinary React text node and no sanitiser is needed on the way out.
 */

export const contentKinds = ["faq", "guide", "glossary", "legal_override"] as const;
export type ContentKind = (typeof contentKinds)[number];

export const contentLocales = ["fr", "en"] as const;
export type ContentCmsLocale = (typeof contentLocales)[number];

/** draft -> pending_review -> published -> archived (a rejected entry goes back to draft). */
export const contentStatuses = ["draft", "pending_review", "published", "archived"] as const;
export type ContentStatus = (typeof contentStatuses)[number];

/** Same slugs as the public legal pages (`apps/public/app/content/legal/shared-types.ts`). */
export const contentLegalSlugs = ["legal-notice", "privacy", "cookies", "terms"] as const;
export type ContentLegalSlug = (typeof contentLegalSlugs)[number];

/** Stable machine identifier of an entry inside its kind (faq/guide/glossary): a kebab-case slug. */
export const contentEntryKeySchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "entryKey must be a kebab-case slug").min(2).max(80);

const ISO_COUNTRY = /^[A-Z]{2}$/;

/** Plain text only: no angle brackets (markup), no control characters other than newline/tab. */
export function isPlainText(value: string): boolean {
  if (/[<>]/.test(value)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return false;
  return true;
}

function plain(max: number, min = 1) {
  return z.string().trim().min(min).max(max).refine(isPlainText, { message: "markup_not_allowed" });
}

export const contentSectionSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
  heading: plain(160),
  body: z.array(plain(4000)).min(1).max(30),
  bullets: z.array(plain(1000)).max(30).optional()
});
export type ContentSectionDto = z.infer<typeof contentSectionSchema>;

export const faqPayloadSchema = z.object({
  question: plain(300),
  answer: plain(4000),
  theme: plain(80).optional(),
  productKey: plain(40).optional()
});
export type FaqPayload = z.infer<typeof faqPayloadSchema>;

export const guidePayloadSchema = z.object({
  title: plain(200),
  description: plain(500),
  productKey: plain(40).optional(),
  sections: z.array(contentSectionSchema).min(1).max(30),
  keyPoints: z.array(plain(400)).min(1).max(8),
  mistakes: z.array(plain(400)).min(1).max(8),
  compareCta: plain(300).optional()
});
export type GuidePayload = z.infer<typeof guidePayloadSchema>;

export const glossaryPayloadSchema = z.object({
  term: plain(120),
  definition: plain(3000),
  seeAlso: z.array(plain(120)).max(10).optional()
});
export type GlossaryPayload = z.infer<typeof glossaryPayloadSchema>;

/**
 * A country's replacement (matched by section id) or addition to one global legal page. The
 * `entryKey` of the entry is the legal slug and `countryCode` is mandatory for this kind.
 */
export const legalOverridePayloadSchema = z.object({
  title: plain(200).optional(),
  description: plain(500).optional(),
  summary: z.array(plain(300)).max(8).optional(),
  sections: z.array(contentSectionSchema).min(1).max(30),
  placeholders: z.array(plain(200)).max(30).optional()
});
export type LegalOverridePayload = z.infer<typeof legalOverridePayloadSchema>;

export const contentPayloadSchemas = {
  faq: faqPayloadSchema,
  guide: guidePayloadSchema,
  glossary: glossaryPayloadSchema,
  legal_override: legalOverridePayloadSchema
} as const;

/** Parses a payload against the schema of its kind (throws a ZodError). */
export function parseContentPayload(kind: ContentKind, payload: unknown): FaqPayload | GuidePayload | GlossaryPayload | LegalOverridePayload {
  return contentPayloadSchemas[kind].parse(payload);
}

/** Checks the scope rules shared by creation and persistence: a legal override needs a legal slug and an ISO country. */
export function validateContentScope(input: { kind: ContentKind; entryKey: string; countryCode?: string | null }): string | undefined {
  if (input.kind === "legal_override") {
    if (!(contentLegalSlugs as readonly string[]).includes(input.entryKey)) return "entryKey must be one of the legal slugs";
    if (!input.countryCode || !ISO_COUNTRY.test(input.countryCode)) return "countryCode (ISO 3166-1 alpha-2, upper case) is required for a legal override";
    return undefined;
  }
  if (input.countryCode) return "countryCode is only allowed for a legal override";
  if (!contentEntryKeySchema.safeParse(input.entryKey).success) return "entryKey must be a kebab-case slug";
  return undefined;
}

export const contentEntryCreateSchema = z.object({
  kind: z.enum(contentKinds),
  entryKey: z.string().trim().min(2).max(80),
  locale: z.enum(contentLocales),
  countryCode: z.string().trim().toUpperCase().regex(ISO_COUNTRY).optional(),
  payload: z.record(z.string(), z.unknown())
});
export type ContentEntryCreateDto = z.infer<typeof contentEntryCreateSchema>;

export const contentEntryUpdateSchema = z.object({
  payload: z.record(z.string(), z.unknown())
});
export type ContentEntryUpdateDto = z.infer<typeof contentEntryUpdateSchema>;

/** Approval, rejection and archiving carry an audited note; a rejection and an archiving require it. */
export const contentDecisionSchema = z.object({
  note: plain(1000).optional()
});
export const contentReasonRequiredSchema = z.object({
  note: plain(1000)
});

export const contentEntryListQuerySchema = z.object({
  kind: z.enum(contentKinds).optional(),
  locale: z.enum(contentLocales).optional(),
  status: z.enum(contentStatuses).optional(),
  countryCode: z.string().trim().toUpperCase().regex(ISO_COUNTRY).optional(),
  entryKey: z.string().trim().max(80).optional()
});
export type ContentEntryListQuery = z.infer<typeof contentEntryListQuerySchema>;

/** Admin view of one entry version. Dates are ISO strings. */
export interface ContentEntryView {
  id: string;
  kind: ContentKind;
  entryKey: string;
  locale: ContentCmsLocale;
  countryCode: string | null;
  /** 1, 2, 3... per (kind, entryKey, locale, countryCode). */
  version: number;
  status: ContentStatus;
  /** Human label for lists: question / guide title / term / legal page slug + country. */
  label: string;
  payload: Record<string, unknown>;
  basedOnId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  submittedById: string | null;
  submittedAt: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  /** Approval note, rejection reason or archiving reason. */
  decisionNote: string | null;
  publishedAt: string | null;
}

/**
 * `GET /admin/content/entries` and `GET /admin/content/entries/:id/history`: always an `{ items }`
 * envelope (list: newest change first, at most 500; history: newest version first).
 */
export interface ContentEntryListResponse {
  items: ContentEntryView[];
}

/** What the signed-in admin may do, so the screen shows only the buttons the API will accept. */
export interface ContentCapabilitiesView {
  canRead: boolean;
  canEdit: boolean;
  canApprove: boolean;
  /** Legal overrides can only be approved by compliance_admin or super_admin. */
  canApproveLegal: boolean;
}

// ---- Public (published content only, no authentication) ---------------------------------------

export interface PublicContentFaqItem {
  question: string;
  answer: string;
  theme?: string;
  productKey?: string;
}

export interface PublicContentGuide {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) of the publication. */
  updatedAt: string;
  productKey?: string;
  sections: ContentSectionDto[];
  keyPoints: string[];
  mistakes: string[];
  compareCta?: string;
}

export interface PublicContentGlossaryEntry {
  term: string;
  definition: string;
  seeAlso?: string[];
}

export interface PublicContentLegalOverride {
  title?: string;
  description?: string;
  summary?: string[];
  /** ISO date (YYYY-MM-DD) of the publication. */
  updatedAt: string;
  sections: ContentSectionDto[];
  placeholders?: string[];
}

/**
 * `GET /public-content?locale=fr&country=SN`. Only published entries, in the requested locale.
 * `legal` is keyed by legal slug and is non-empty only when `country` is given and has a published
 * override. Every array/object is empty when nothing is published: the public site then falls back
 * to its static copy.
 */
export interface PublicContentResponse {
  locale: ContentCmsLocale;
  faq: PublicContentFaqItem[];
  guides: PublicContentGuide[];
  glossary: PublicContentGlossaryEntry[];
  legal: Partial<Record<ContentLegalSlug, PublicContentLegalOverride>>;
}

export const publicContentQuerySchema = z.object({
  locale: z.enum(contentLocales).default("fr"),
  country: z.string().trim().toUpperCase().regex(ISO_COUNTRY).optional()
});
export type PublicContentQuery = z.infer<typeof publicContentQuerySchema>;
