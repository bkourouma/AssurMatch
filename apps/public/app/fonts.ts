import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";

/**
 * Two faces for the public site ("Le patron").
 *
 *  - Atkinson Hyperlegible Next carries every sentence: a face drawn for legibility (distinct
 *    letterforms, open counters), read on a phone in daylight. Exposed as `--font-am-sign`, behind
 *    `--am-font-body`. Weights 400 / 700 / 800.
 *  - Bricolage Grotesque sets the headings and the large figures: a grotesque with a little
 *    tailoring in its joins, enough character to be recognised without turning into a costume.
 *    Variable weight and optical size. Exposed as `--font-am-display`, behind `--am-font-heading`.
 *
 * The back-offices keep their own Nunito/Inter pair from `@assurmatch/ui/fonts`; the public site
 * does not share it.
 */
const bodyFont = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-am-sign",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});

const displayFont = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-am-display",
  axes: ["opsz"],
  fallback: ["system-ui", "Segoe UI", "Arial"]
});

/** `variable` is the class that defines both CSS font variables; put it on `<html>`. */
export const signFont = {
  variable: `${bodyFont.variable} ${displayFont.variable}`
};
