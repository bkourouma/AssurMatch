/**
 * Serialises a JSON-LD payload so that no value coming from the API can close the script element
 * or open an HTML comment: `<`, `>` and `&` become JSON unicode escapes (still valid JSON, same
 * parsed value) and the JavaScript line terminators U+2028 / U+2029 are escaped too.
 */
export function serializeJsonLd(data: Record<string, unknown> | Array<Record<string, unknown>>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
