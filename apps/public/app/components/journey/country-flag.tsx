const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 65;

/**
 * ISO 3166-1 alpha-2 code rendered as the pair of regional indicator symbols browsers draw as a
 * flag ("CI" -> the Ivorian flag). Anything that is not two ASCII letters yields an empty string,
 * so an unexpected code never prints a pair of stray glyphs.
 */
export function countryFlag(isoCode: string): string {
  const iso = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return "";
  return String.fromCodePoint(...[...iso].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A));
}

export interface CountryFlagProps {
  isoCode: string;
  size?: "md" | "lg";
  className?: string;
}

/**
 * Decorative flag tile. The country name is always written next to it, so the glyph itself is
 * hidden from assistive technology rather than read out as "flag of ...".
 */
export function CountryFlag({ isoCode, size = "md", className }: CountryFlagProps) {
  const flag = countryFlag(isoCode);
  if (!flag) return null;
  return (
    <span
      className={className ? `am-j-flag ${className}` : "am-j-flag"}
      data-size={size === "lg" ? "lg" : undefined}
      aria-hidden="true"
    >
      {flag}
    </span>
  );
}
