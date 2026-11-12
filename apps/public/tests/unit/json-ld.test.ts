import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../../app/components/ui/json-ld-serialize";

// E2E lot 7 (stored XSS): the former replace(/</g, "<" written as a unicode escape) was a no-op,
// because in JS the escape sequence is the character itself.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe("serializeJsonLd", () => {
  const hostile = "</script><img src=x onerror=alert(1)>";

  it("never lets a value close the script element or open an HTML tag", () => {
    const out = serializeJsonLd({ "@type": "Organization", name: hostile });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("\\u003c/script\\u003e");
  });

  it("escapes ampersands and the JavaScript line terminators", () => {
    const out = serializeJsonLd([{ name: "A & B" + LS + "C" + PS + "D" }]);
    expect(out).not.toContain("&");
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain("\\u0026");
  });

  it("round-trips: the escaped payload parses back to the original value", () => {
    const data = { name: hostile, note: "a & b <c> " + LS + " " + PS, n: [1, 2] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
