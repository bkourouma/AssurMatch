import { Atkinson_Hyperlegible_Next } from "next/font/google";

/**
 * One family for the whole public site: Atkinson Hyperlegible Next, a face drawn for legibility
 * (distinct letterforms, open counters), which is what a sign system read on a phone in daylight
 * needs. Variable weight; the CSS uses 400, 700 and 800. Exposed as `--font-am-sign`, which
 * `styles/tokens.css` puts behind both `--am-font-heading` and `--am-font-body`.
 *
 * The back-offices keep their own Nunito/Inter pair from `@assurmatch/ui/fonts`; the public site no
 * longer shares it.
 */
export const signFont = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-am-sign",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});
