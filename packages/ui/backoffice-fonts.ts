import { Geist, Geist_Mono } from "next/font/google";

/**
 * Back-office faces (admin + courtier). One workhorse sans carries headings, labels and data; the
 * mono face is reserved for references, identifiers and amounts. The public site never imports this.
 */
export const uiFont = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bo-sans",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});

export const monoFont = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bo-mono",
  fallback: ["ui-monospace", "Cascadia Mono", "Consolas", "monospace"]
});
