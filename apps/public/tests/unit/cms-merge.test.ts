import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mergeFaq,
  mergeGlossary,
  mergeGuides,
  mergeLegalPage,
  normalizeContentKey
} from "../../app/content/cms-merge";
import { emptyPublicContent, fetchPublicContent, parsePublicContent } from "../../app/lib/content-cms";
import { listFaq } from "../../app/content/faq";
import { listGlossary } from "../../app/content/glossary";
import { listGuides } from "../../app/content/guides";
import { getLegalPage } from "../../app/content/legal";
import type { PublicContentResponse } from "../../../../packages/shared/contracts/content-cms.contracts";

// Lot 9 (spec 072): pure merge of the published CMS content over the static copy, plus the guard.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nothing published: the static content is returned untouched", () => {
  it("returns the very same arrays and page", () => {
    const faq = listFaq("fr");
    const glossary = listGlossary("fr");
    const guides = listGuides("fr");
    const page = getLegalPage("privacy", "fr", "SN")!;
    expect(mergeFaq(faq, [])).toBe(faq);
    expect(mergeGlossary(glossary, [])).toBe(glossary);
    expect(mergeGuides(guides, [])).toBe(guides);
    expect(mergeLegalPage(page, undefined)).toBe(page);
  });
});

describe("FAQ", () => {
  const base = [
    { theme: "A", question: "Qu'est-ce que le score ?", answer: "static 1" },
    { theme: "A", question: "Autre question", answer: "static 2" },
    { theme: "B", question: "Question B", answer: "static 3" }
  ];

  it("replaces the answer of an identical question (case, accents, punctuation insensitive)", () => {
    const merged = mergeFaq(base, [{ question: "qu est-ce que le score", answer: "cms" }]);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ theme: "A", answer: "cms" });
  });

  it("appends a new question at the end of its theme, or at the end of the list without theme", () => {
    const merged = mergeFaq(base, [
      { question: "Nouvelle A", answer: "x", theme: "A" },
      { question: "Sans theme", answer: "y" },
      { question: "Nouveau theme", answer: "z", theme: "C" }
    ]);
    expect(merged.map((item) => item.question)).toEqual([
      "Qu'est-ce que le score ?",
      "Autre question",
      "Nouvelle A",
      "Question B",
      "Sans theme",
      "Nouveau theme"
    ]);
  });
});

describe("glossary", () => {
  it("replaces a term of the same label ignoring case and accents, and keeps the alphabetical order", () => {
    const base = [
      { term: "Franchise", definition: "static" },
      { term: "Prime", definition: "static" }
    ];
    const merged = mergeGlossary(base, [
      { term: "FRANCHISE", definition: "cms" },
      { term: "Écart", definition: "new" }
    ]);
    expect(merged.map((entry) => entry.term)).toEqual(["Écart", "FRANCHISE", "Prime"]);
    expect(merged[1]!.definition).toBe("cms");
  });
});

describe("guides", () => {
  const section = { id: "intro", heading: "H", body: ["b"] };
  const guide = (slug: string, title: string) => ({
    slug,
    title,
    description: "d",
    updatedAt: "2026-10-01",
    sections: [section],
    keyPoints: ["k"],
    mistakes: ["m"]
  });

  it("replaces a guide of the same slug in place and appends a new one", () => {
    const base = [
      { ...guide("a", "A static"), productKey: "auto" },
      guide("b", "B static")
    ];
    const merged = mergeGuides(base, [guide("a", "A cms"), guide("c", "C cms")]);
    expect(merged.map((item) => item.title)).toEqual(["A cms", "B static", "C cms"]);
    expect(merged[0]!.updatedAt).toBe("2026-10-01");
  });
});

describe("legal page", () => {
  const base = {
    slug: "privacy",
    title: "T",
    description: "D",
    updatedAt: "2026-09-01",
    sections: [
      { id: "one", heading: "One", body: ["1"] },
      { id: "two", heading: "Two", body: ["2"] }
    ],
    placeholders: ["rccm", "adresse"],
    summary: ["s1"]
  };

  it("merges sections by id, replaces placeholders, takes the publication date", () => {
    const merged = mergeLegalPage(base, {
      updatedAt: "2026-10-20",
      sections: [
        { id: "two", heading: "Two cms", body: ["2c"] },
        { id: "three", heading: "Three", body: ["3"] }
      ],
      placeholders: ["adresse"]
    });
    expect(merged.sections.map((s) => `${s.id}:${s.heading}`)).toEqual(["one:One", "two:Two cms", "three:Three"]);
    expect(merged.placeholders).toEqual(["adresse"]);
    expect(merged.updatedAt).toBe("2026-10-20");
    expect(merged.title).toBe("T");
    expect(merged.summary).toEqual(["s1"]);
  });

  it("keeps the static placeholders when the override states none, and clears them with an empty list", () => {
    const sections = [{ id: "one", heading: "One cms", body: ["1c"] }];
    expect(mergeLegalPage(base, { updatedAt: "2026-10-20", sections }).placeholders).toEqual(["rccm", "adresse"]);
    expect(mergeLegalPage(base, { updatedAt: "2026-10-20", sections, placeholders: [] }).placeholders).toBeUndefined();
  });
});

describe("normalizeContentKey", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalizeContentKey("  Qu'est-ce QUE l'Écart ? ")).toBe("qu est ce que l ecart");
  });
});

describe("public content guard and fetch", () => {
  const valid: PublicContentResponse = {
    locale: "fr",
    faq: [{ question: "Q ?", answer: "R" }],
    guides: [],
    glossary: [{ term: "Terme", definition: "Def" }],
    legal: {}
  };

  it("accepts a valid body", () => {
    expect(parsePublicContent(valid, "fr")).toEqual(valid);
  });

  it("rejects the whole body when a string contains markup", () => {
    const evil = { ...valid, faq: [{ question: "Q ?", answer: "<script>alert(1)</script>" }] };
    expect(parsePublicContent(evil, "fr")).toEqual(emptyPublicContent("fr"));
    const gt = { ...valid, glossary: [{ term: "a > b", definition: "d" }] };
    expect(parsePublicContent(gt, "fr")).toEqual(emptyPublicContent("fr"));
  });

  it("rejects a body of another language or a body that is not an object", () => {
    expect(parsePublicContent({ ...valid, locale: "en" }, "fr")).toEqual(emptyPublicContent("fr"));
    expect(parsePublicContent("nope", "en")).toEqual(emptyPublicContent("en"));
    expect(parsePublicContent(null, "en")).toEqual(emptyPublicContent("en"));
  });

  it("returns the empty response on a network failure, a timeout, a non-2xx status or invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await fetchPublicContent("fr")).toEqual(emptyPublicContent("fr"));

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await fetchPublicContent("en", "SN")).toEqual(emptyPublicContent("en"));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 503 })));
    expect(await fetchPublicContent("fr")).toEqual(emptyPublicContent("fr"));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    expect(await fetchPublicContent("fr")).toEqual(emptyPublicContent("fr"));
  });

  it("calls /public-content with the locale and the upper-cased country, with a timeout signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPublicContent("fr", "sn")).toEqual(valid);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/public-content?locale=fr&country=SN");
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
