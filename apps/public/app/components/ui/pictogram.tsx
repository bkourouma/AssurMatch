/**
 * Product pictograms of the sign system.
 *
 * Each one is built from a few flat planes, no outline, one colour (`currentColor`), on a 24px grid,
 * the way airport pictograms are drawn. They name a product; the stroke icons of `icons.tsx` remain
 * for interface glyphs (arrows, ticks, menus). Use `tile` to set the pictogram on a navy sign tile.
 */

export type PictogramName = "auto" | "moto" | "sante" | "habitation" | "voyage" | "vie" | "generic";

const PATHS: Record<PictogramName, readonly string[]> = {
  auto: [
    "M3.2 10.6 5.7 5.6C6.1 4.8 6.9 4.3 7.8 4.3h8.4c.9 0 1.7.5 2.1 1.3l2.5 5h.6c.8 0 1.4.6 1.4 1.4v5c0 .8-.6 1.4-1.4 1.4H2.6c-.8 0-1.4-.6-1.4-1.4v-5c0-.8.6-1.4 1.4-1.4h.6Zm3.1 0h11.4l-1.7-3.5c-.2-.4-.5-.6-.9-.6H8.9c-.4 0-.7.2-.9.6l-1.7 3.5ZM6 15.6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    "M3.6 19.2h3.6v1.4c0 .6-.5 1.1-1.1 1.1H4.7c-.6 0-1.1-.5-1.1-1.1v-1.4Zm13.2 0h3.6v1.4c0 .6-.5 1.1-1.1 1.1h-1.4c-.6 0-1.1-.5-1.1-1.1v-1.4Z"
  ],
  moto: [
    "M5.2 11.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 2.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm13.6-2.4a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 2.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    "M8.6 16.6 10.9 10H7.4V8h7.4l1.6 3.4-2.9 5.2H8.6Zm6.9-11.2h3.4v2.1h-1.9l2.3 4.6-1.8.9-3.5-6.9.1-.7h1.4Z"
  ],
  sante: ["M9.2 2.8h5.6c.4 0 .7.3.7.7v5h5c.4 0 .7.3.7.7v5.6c0 .4-.3.7-.7.7h-5v5c0 .4-.3.7-.7.7H9.2c-.4 0-.7-.3-.7-.7v-5h-5c-.4 0-.7-.3-.7-.7V9.2c0-.4.3-.7.7-.7h5v-5c0-.4.3-.7.7-.7Z"],
  habitation: ["M12 2.6 22.6 11.4l-1.3 1.6-1.3-1.1v9.4c0 .5-.4.9-.9.9h-4.4v-6.6H9.3v6.6H4.9c-.5 0-.9-.4-.9-.9v-9.4L2.7 13l-1.3-1.6L12 2.6Z"],
  voyage: [
    "M21.6 15.6v-2.1l-8.1-5.1V3.9c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5v4.5l-8.1 5.1v2.1l8.1-2.5v5.1l-2.1 1.5v1.6l3.6-1 3.6 1v-1.6l-2.1-1.5v-5.1l8.1 2.5Z"
  ],
  vie: ["M12 21.2s-9.2-5.6-9.2-12c0-2.9 2.3-5.2 5.1-5.2 1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 2.8 0 5.1 2.3 5.1 5.2 0 6.4-9.2 12-9.2 12Z"],
  generic: ["M12 2.2 20.2 5.3v6.1c0 5.1-3.4 9.1-8.2 10.4C7.2 20.5 3.8 16.5 3.8 11.4V5.3L12 2.2Z"]
};

const PRODUCT_PATTERNS: ReadonlyArray<readonly [RegExp, PictogramName]> = [
  [/moto|deux.?roues|scooter/i, "moto"],
  [/auto|car|vehic|automobile/i, "auto"],
  [/travel|voyage|trip|schengen/i, "voyage"],
  [/health|sante|santé|medic|maladie/i, "sante"],
  [/home|habitation|logement|house|multirisque|mrh/i, "habitation"],
  [/life|vie|deces|décès|obseques/i, "vie"]
];

/** Maps a catalogue product key (or name) to its pictogram; unknown products get the shield. */
export function productPictogram(productKey: string): PictogramName {
  const match = PRODUCT_PATTERNS.find(([pattern]) => pattern.test(productKey));
  return match ? match[1] : "generic";
}

export interface PictogramProps {
  name: PictogramName;
  size?: number;
  /** Sets the pictogram on a navy sign tile (`--am-tile`, white planes). */
  tile?: boolean;
  /** `light` = navy planes on a pale tile, for a dense list inside a navy panel. */
  tone?: "navy" | "light";
  className?: string;
}

export function Pictogram({ name, size = 24, tile = false, tone = "navy", className }: PictogramProps) {
  const svg = (
    <svg className="am-pictogram__glyph" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => (
        <path key={d.slice(0, 16)} d={d} fill="currentColor" fillRule="evenodd" />
      ))}
    </svg>
  );

  if (!tile) {
    return <span className={className ? `am-pictogram ${className}` : "am-pictogram"}>{svg}</span>;
  }

  return (
    <span className={className ? `am-pictogram am-pictogram--tile ${className}` : "am-pictogram am-pictogram--tile"} data-tone={tone === "light" ? "light" : undefined}>
      {svg}
    </span>
  );
}
