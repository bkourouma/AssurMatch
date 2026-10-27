/**
 * Back-office themes. Server-safe (no client code): a surface layout reads the cookie, validates it
 * with `themeByValue` and sets `data-theme` / `data-mode` on <html>; the picker in the account menu
 * writes the cookie. The colours of a theme live in `backoffice.css`; the swatches below only draw
 * the two-tone chip of the picker.
 */
export type ThemeMode = "light" | "dark";

export interface ThemeDefinition {
  value: string;
  label: string;
  mode: ThemeMode;
  /** Chip colours for the picker: the continuum and one plate. */
  ground: string;
  plate: string;
}

export const THEMES = [
  { value: "clair", label: "Clair", mode: "light", ground: "#f2f3f4", plate: "#ffffff" },
  { value: "sable", label: "Sable", mode: "light", ground: "#efe8da", plate: "#faf6ee" },
  { value: "sombre", label: "Sombre", mode: "dark", ground: "#141517", plate: "#27292d" },
  { value: "bleu", label: "Bleu nuit", mode: "dark", ground: "#0e1a36", plate: "#1c2c52" },
  { value: "foret", label: "Vert forêt", mode: "dark", ground: "#0e2216", plate: "#1b3b29" },
  { value: "prune", label: "Prune", mode: "dark", ground: "#2a0f31", plate: "#42204b" }
] as const satisfies readonly ThemeDefinition[];

export type ThemeValue = (typeof THEMES)[number]["value"];

export const DEFAULT_THEME: ThemeValue = "clair";

/** The theme for a cookie value, or the default when the value is missing or unknown. */
export function themeByValue(value: string | undefined | null): (typeof THEMES)[number] {
  return THEMES.find((theme) => theme.value === value) ?? THEMES[0];
}
