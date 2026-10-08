/**
 * Square tiles of the journey directories, drawn like the code plates of a wayfinding sign: the ISO
 * code of a country, the initials of a broker or an insurer. The name is always written next to the
 * tile, so the tile itself is hidden from assistive technology.
 */

/** Two letters standing in for a logo, e.g. "Assureur Demo Atlantique" -> "AA". */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const firstWord = words[0] ?? "";
  const lastWord = words.length > 1 ? (words[words.length - 1] ?? "") : firstWord;
  return `${firstWord.charAt(0)}${words.length > 1 ? lastWord.charAt(0) : firstWord.charAt(1)}`.toUpperCase();
}

/** ISO 3166-1 alpha-2 code of a country on a navy plate ("CI"). */
export function IsoTile({ isoCode }: { isoCode: string }) {
  const iso = isoCode.trim().toUpperCase();
  return (
    <span className="am-j-codetile" aria-hidden="true">
      {/^[A-Z]{2}$/.test(iso) ? iso : iso.slice(0, 3)}
    </span>
  );
}

/** Initials of a broker or an insurer on a navy plate. */
export function InitialsTile({ name }: { name: string }) {
  return (
    <span className="am-j-codetile" aria-hidden="true">
      {initials(name)}
    </span>
  );
}
