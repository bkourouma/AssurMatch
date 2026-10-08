import { Archivo, Spline_Sans_Mono } from "next/font/google";

/**
 * Back-office faces (admin + courtier). One grotesque, used at two widths: semi-wide and light for
 * titles, semi-condensed for tables and labels (`font-stretch`). The mono face is for figures,
 * references and amounts only. The public site never imports this.
 */
export const uiFont = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-bo-sans",
  fallback: ["system-ui", "Segoe UI", "Arial"]
});

export const monoFont = Spline_Sans_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bo-mono",
  fallback: ["ui-monospace", "Cascadia Mono", "Consolas", "monospace"]
});
