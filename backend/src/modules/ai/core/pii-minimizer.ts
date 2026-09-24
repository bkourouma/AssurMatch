/**
 * Constitution V: personal data sent to a model MUST be minimised. The minimiser works on the
 * structured input before any prompt is built: identity keys are dropped, and free text is
 * scrubbed of e-mail addresses, phone numbers, long digit runs (ids, plates, cards) and IBAN-like
 * strings. It returns a report so the interaction can prove what was removed without keeping it.
 */
export interface MinimizationReport {
  droppedKeys: string[];
  redactedPatterns: Record<string, number>;
  truncatedValues: number;
}

export interface MinimizationResult<T> {
  minimized: T;
  report: MinimizationReport;
}

const IDENTITY_KEYS = new Set([
  "email", "emailnormalized", "phone", "phonenormalized", "whatsapp", "displayname", "firstname", "lastname", "fullname", "name", "prospectname",
  "address", "street", "birthdate", "dateofbirth", "nationalid", "passport", "idnumber", "iban", "cardnumber", "ip", "ipaddress", "sessionid",
  "verificationtoken", "token", "password"
]);

const PATTERNS: Array<[string, RegExp]> = [
  ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ["phone", /(?:\+|00)?\d[\d\s().-]{7,}\d/g],
  ["iban", /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g],
  ["long_digits", /\b\d{8,}\b/g]
];

const MAX_TEXT_LENGTH = 800;

export class PiiMinimizer {
  minimize<T>(input: T): MinimizationResult<T> {
    const report: MinimizationReport = { droppedKeys: [], redactedPatterns: {}, truncatedValues: 0 };
    return { minimized: this.walk(input, report, "") as T, report };
  }

  minimizeText(text: string): { text: string; report: MinimizationReport } {
    const report: MinimizationReport = { droppedKeys: [], redactedPatterns: {}, truncatedValues: 0 };
    return { text: this.scrub(text, report), report };
  }

  private walk(value: unknown, report: MinimizationReport, path: string): unknown {
    if (typeof value === "string") return this.scrub(value, report);
    if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.slice(0, 50).map((item, index) => this.walk(item, report, `${path}[${index}]`));
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (IDENTITY_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ""))) {
          report.droppedKeys.push(path ? `${path}.${key}` : key);
          continue;
        }
        result[key] = this.walk(child, report, path ? `${path}.${key}` : key);
      }
      return result;
    }
    return String(value);
  }

  private scrub(text: string, report: MinimizationReport): string {
    let output = text;
    for (const [name, pattern] of PATTERNS) {
      output = output.replace(pattern, () => {
        report.redactedPatterns[name] = (report.redactedPatterns[name] ?? 0) + 1;
        return `[${name}]`;
      });
    }
    if (output.length > MAX_TEXT_LENGTH) {
      report.truncatedValues += 1;
      output = `${output.slice(0, MAX_TEXT_LENGTH)}...`;
    }
    return output;
  }
}
