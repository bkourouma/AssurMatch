import { describe, expect, it } from "vitest";
import {
  defaultDocumentLabel,
  formatNameList,
  joinPersonName,
  readMarketingSource,
  readQuoteOfferIds,
  STAGED_DOCUMENT_MAX_BYTES,
  validateStagedFile
} from "../../../../apps/public/app/lib/quote-journey";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

describe("readQuoteOfferIds", () => {
  it("keeps order, drops invalid and duplicate ids and caps at three", () => {
    expect(readQuoteOfferIds([A, "nope", A.toUpperCase(), B, C, D])).toEqual([A, B, C]);
  });
  it("accepts a single value or nothing", () => {
    expect(readQuoteOfferIds(A)).toEqual([A]);
    expect(readQuoteOfferIds(undefined)).toEqual([]);
  });
});

describe("readMarketingSource", () => {
  it("reads utm parameters trimmed and capped at 100 characters", () => {
    const result = readMarketingSource(`?utm_source=%20news%20&utm_campaign=${"x".repeat(150)}&other=1`, "", "assurmatch.test");
    expect(result?.utmSource).toBe("news");
    expect(result?.utmCampaign).toHaveLength(100);
    expect(result).not.toHaveProperty("utmMedium");
  });
  it("keeps only the host of an external referrer, never the URL", () => {
    const result = readMarketingSource("", "https://Search.Example.com/path?q=secret#x", "assurmatch.test");
    expect(result).toEqual({ referrerHost: "search.example.com" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("ignores an internal or invalid referrer and returns undefined when empty", () => {
    expect(readMarketingSource("", "https://assurmatch.test/fr/offers", "assurmatch.test")).toBeUndefined();
    expect(readMarketingSource("", "not a url", "assurmatch.test")).toBeUndefined();
    expect(readMarketingSource("?utm_source=%20", "", "assurmatch.test")).toBeUndefined();
  });
});

describe("validateStagedFile", () => {
  it("accepts PDF, JPEG and PNG within 5 MB", () => {
    expect(validateStagedFile({ size: 1000, type: "application/pdf" }, 0)).toBeNull();
    expect(validateStagedFile({ size: STAGED_DOCUMENT_MAX_BYTES, type: "image/png" }, 4)).toBeNull();
  });
  it("rejects wrong type, oversize, empty and a sixth file", () => {
    expect(validateStagedFile({ size: 10, type: "text/plain" }, 0)).toBe("type");
    expect(validateStagedFile({ size: STAGED_DOCUMENT_MAX_BYTES + 1, type: "image/jpeg" }, 0)).toBe("size");
    expect(validateStagedFile({ size: 0, type: "image/jpeg" }, 0)).toBe("empty");
    expect(validateStagedFile({ size: 10, type: "image/jpeg" }, 5)).toBe("count");
  });
});

describe("labels and names", () => {
  it("derives the default label from the file name without extension", () => {
    expect(defaultDocumentLabel("carte grise.final.pdf")).toBe("carte grise.final");
    expect(defaultDocumentLabel("C:\\docs\\permis.png")).toBe("permis");
    expect(defaultDocumentLabel("noext")).toBe("noext");
  });
  it("lists names with the locale conjunction", () => {
    expect(formatNameList(["A", "B", "C"], "fr")).toBe("A, B et C");
    expect(formatNameList(["A", "B", "C"], "en")).toBe("A, B, and C");
    expect(formatNameList(["A"], "fr")).toBe("A");
  });
  it("joins first and last names", () => {
    expect(joinPersonName(" Awa ", "Koné")).toBe("Awa Koné");
    expect(joinPersonName("", "Koné")).toBe("Koné");
    expect(joinPersonName("", "")).toBe("");
  });
});
