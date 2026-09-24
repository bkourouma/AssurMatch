import { Inter, Nunito } from "next/font/google";

/** Headings: Nunito 700/800. Body: Inter 400 to 700. Both expose a CSS variable used by tokens.css. */
export const headingFont = Nunito({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--font-am-heading",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});

export const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-am-body",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});
