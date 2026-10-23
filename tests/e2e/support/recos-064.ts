import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

// Helpers of the spec 064 journey (recos-064-wired-capabilities.spec.ts): CSV exports downloaded from
// the real "Exporter (CSV)" buttons, parsed and checked for formula injection and contact data.

/** Minimal RFC 4180 reader: quoted cells (the exports quote every data cell), doubled quotes, CRLF or LF rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => !(entry.length === 1 && entry[0] === ""));
}

export interface ParsedExport {
  header: string[];
  rows: string[][];
  /** Raw text of the file. */
  text: string;
  filename?: string;
}

export function parseExport(text: string, filename?: string): ParsedExport {
  const [header = [], ...rows] = parseCsv(text);
  return { header, rows, text, ...(filename ? { filename } : {}) };
}

/** Clicks an export link and reads the file the browser downloaded. */
export async function downloadExport(page: Page, link: Locator): Promise<ParsedExport> {
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const path = await download.path();
  return parseExport(readFileSync(path, "utf8"), download.suggestedFilename());
}

/** Values of one column (by header name). */
export function column(file: ParsedExport, name: string): string[] {
  const index = file.header.indexOf(name);
  expect(index, `column ${name} in ${file.header.join(",")}`).toBeGreaterThanOrEqual(0);
  return file.rows.map((row) => row[index] ?? "");
}

/** Spec 064 FR-002: no cell may start with a character a spreadsheet reads as a formula (= + - @ tab CR). */
export function expectNoFormulaCell(file: ParsedExport): void {
  for (const row of file.rows) {
    for (const cell of row) {
      expect(cell, `CSV cell "${cell}" must not start a spreadsheet formula`).not.toMatch(/^[=+\-@\t\r]/u);
    }
  }
}

/** Spec 064 FR-002: the exports carry no contact data (no e-mail, no phone number, no visitor name). */
export function expectNoContactData(file: ParsedExport, forbidden: string[]): void {
  expect(file.text, "no e-mail address in the export").not.toContain("@");
  expect(file.text, "no phone number in the export").not.toMatch(/\+\d{6,}/u);
  for (const value of forbidden) expect(file.text, `export must not carry "${value}"`).not.toContain(value);
}
