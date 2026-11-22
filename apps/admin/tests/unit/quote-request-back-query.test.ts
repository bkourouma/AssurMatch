import { describe, expect, it } from "vitest";
import { safeBackQuery } from "../../app/quote-requests/[quoteRequestId]/back-query";

describe("safeBackQuery (?back= of the quote request page)", () => {
  it("accepts a plain query string", () => {
    expect(safeBackQuery("?status=new&page=2")).toBe("?status=new&page=2");
    expect(safeBackQuery("?q=a%20b&country=CI")).toBe("?q=a%20b&country=CI");
  });

  it.each(["//evil.com", "https://x", "?a=<script>", "", "status=new", "?"])("refuses %j", (value) => {
    expect(safeBackQuery(value)).toBe("");
  });

  it("refuses a value that is too long", () => {
    expect(safeBackQuery(`?a=${"b".repeat(399)}`)).toBe("");
    expect(safeBackQuery(`?a=${"b".repeat(398)}`)).not.toBe("");
  });

  it("refuses non-string values", () => {
    expect(safeBackQuery(undefined)).toBe("");
    expect(safeBackQuery(["?a=1"])).toBe("");
  });
});
