import { expect, test } from "@playwright/test";
import { publicFile, publicPage, readSources } from "./helpers/public-sources";

// Lot 9 (spec 072): the public pages read the published CMS content through the resolve* functions,
// render plain text only, and fall back to the static copy.

const touchedPages = [
  "faq/page.tsx",
  "glossary/page.tsx",
  "guides/page.tsx",
  "guides/[slug]/page.tsx",
  "privacy/page.tsx",
  "cookies/page.tsx",
  "terms/page.tsx",
  "legal-notice/page.tsx",
  "countries/[countryCode]/privacy/page.tsx",
  "countries/[countryCode]/cookies/page.tsx",
  "countries/[countryCode]/terms/page.tsx",
  "countries/[countryCode]/legal-notice/page.tsx"
];

test("every touched page resolves its content through the CMS resolvers", () => {
  for (const page of touchedPages) {
    const source = readSources([publicPage(page)]);
    expect(source, page).toContain("content/cms-content");
    expect(source, page).toMatch(/await resolve(Faq|Glossary|Guides?|LegalPage|LegalPageWithOverride)\(/);
    expect(source, page).not.toMatch(/\b(listFaq|listGlossary|listGuides|getLegalPage|getGuide|hasCountryLegalOverride)\(/);
  }
});

test("the country legal pages take the override notice from the resolver (static or published)", () => {
  for (const slug of ["privacy", "cookies", "terms", "legal-notice"]) {
    const source = readSources([publicPage(`countries/[countryCode]/${slug}/page.tsx`)]);
    expect(source).toContain("resolveLegalPageWithOverride(");
    expect(source).toContain("hasOverride");
  }
});

test("a guide that exists neither in the static copy nor in the CMS is a 404", () => {
  const source = readSources([publicPage("guides/[slug]/page.tsx")]);
  expect(source).toContain("await resolveGuide(locale, slug)");
  expect(source).toContain("if (!guide) notFound();");
});

test("no touched file injects HTML or builds links from CMS content", () => {
  const sources = readSources([
    ...touchedPages.map((page) => publicPage(page)),
    publicFile("lib/content-cms.ts"),
    publicFile("content/cms-merge.ts"),
    publicFile("content/cms-content.ts")
  ]);
  expect(sources).not.toContain("dangerouslySetInnerHTML");
  expect(sources).not.toContain("innerHTML");
});

test("the CMS reader has a 2 s timeout, a 60 s revalidation, never throws and checks for markup", () => {
  const lib = readSources([publicFile("lib/content-cms.ts")]);
  expect(lib).toContain("AbortSignal.timeout(REQUEST_TIMEOUT_MS)");
  expect(lib).toContain("REQUEST_TIMEOUT_MS = 2000");
  expect(lib).toContain("next: { revalidate: REVALIDATE_SECONDS }");
  expect(lib).toContain("REVALIDATE_SECONDS = 60");
  expect(lib).toContain("/public-content?");
  expect(lib).toContain("isPlainText");
  expect(lib).toMatch(/catch \{\s*return emptyPublicContent\(locale\);/);
});

test("the resolvers merge on top of the static modules and leave them untouched", () => {
  const source = readSources([publicFile("content/cms-content.ts")]);
  for (const fn of ["listFaq(locale)", "listGlossary(locale)", "listGuides(locale)", "getGuide(locale, slug)", "getLegalPage(slug, locale, countryCode)"]) {
    expect(source).toContain(fn);
  }
  expect(source).toContain("fetchPublicContent(locale)");
});
