import { afterEach, describe, expect, it, vi } from "vitest";

// Lot 9 (spec 072): one read of /public-content per server render and per (locale, country).
// Outside a React Server Components render `cache()` is a pass-through, so the test stands in a
// memoising `cache` (what React does for the duration of one server request) and checks that every
// caller of `fetchPublicContent` goes through it with a stable key.
vi.mock("react", () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>();
    return (...args: A): R => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as R;
    };
  }
}));

const { fetchPublicContent, publicContentCountryKey } = await import("../../app/lib/content-cms");
const { resolveFaq, resolveGlossary, resolveGuides, resolveLegalPageWithOverride } = await import("../../app/content/cms-content");

afterEach(() => {
  vi.unstubAllGlobals();
});

function emptyBody(locale: "fr" | "en") {
  return JSON.stringify({ locale, faq: [], guides: [], glossary: [], legal: {} });
}

describe("public CMS read: one request per render and per key", () => {
  it("normalises the country key so sn, SN and ' SN ' share one read", () => {
    expect(publicContentCountryKey("sn")).toBe("SN");
    expect(publicContentCountryKey(" SN ")).toBe("SN");
    expect(publicContentCountryKey()).toBe("");
  });

  it("deduplicates concurrent and repeated reads, even when the first one is slow (the 2 s budget is paid once)", async () => {
    let resolveSlow!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("country=CI")) return new Promise<Response>((resolve) => (resolveSlow = resolve));
      const locale = String(url).includes("locale=en") ? "en" : "fr";
      return Promise.resolve(new Response(emptyBody(locale), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    // The page and its generateMetadata (or several resolvers of one page) read the same key concurrently.
    const pending = [fetchPublicContent("fr", "ci"), fetchPublicContent("fr", "CI"), fetchPublicContent("fr", " CI "), resolveLegalPageWithOverride("privacy", "fr", "ci")];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveSlow(new Response(emptyBody("fr"), { status: 200 }));
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Every resolver of the global pages shares the locale-only read.
    await Promise.all([resolveFaq("fr"), resolveGlossary("fr"), resolveGuides("fr"), fetchPublicContent("fr")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/public-content?locale=fr");
    expect(String(fetchMock.mock.calls[1]![0])).not.toContain("country=");

    // Another locale is another read.
    await fetchPublicContent("en");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
