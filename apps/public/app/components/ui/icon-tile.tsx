import { Icon, type IconName } from "./icons";

export type IconTileTone = "brand" | "success" | "warning" | "danger" | "neutral" | "navy" | "invert";

export interface IconTileProps {
  name: IconName;
  tone?: IconTileTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const GLYPH_SIZE = { sm: 18, md: 22, lg: 28 } as const;

/** An icon in a soft rounded tile: the visual anchor of a step, a card or an empty state. */
export function IconTile({ name, tone = "brand", size = "md", className }: IconTileProps) {
  return (
    <span
      className={className ? `am-icontile ${className}` : "am-icontile"}
      data-tone={tone === "brand" ? undefined : tone}
      data-size={size === "md" ? undefined : size}
    >
      <Icon name={name} size={GLYPH_SIZE[size]} />
    </span>
  );
}
