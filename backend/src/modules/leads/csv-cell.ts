/** First characters that a spreadsheet reads as the start of a formula (OWASP CSV injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Spec 064 (FR-002): one CSV cell, always double-quoted. A value starting with `=`, `+`, `-`, `@`,
 * a tab or a carriage return gets a leading single quote, so that opening the export in a
 * spreadsheet never evaluates it as a formula. Quotes inside the value are doubled.
 */
export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
