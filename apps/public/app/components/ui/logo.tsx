import Image from "next/image";

export interface LogoProps {
  /** `white` is the monochrome asset used on the primary-700 footer. */
  variant?: "color" | "white";
  symbolOnly?: boolean;
  /** Rendered height in pixels; the width follows the intrinsic ratio of the asset. */
  height?: number;
  priority?: boolean;
  className?: string;
}

const FULL_RATIO = 2069 / 643;
const SYMBOL_RATIO = 500 / 615;

export function Logo({ variant = "color", symbolOnly = false, height = 32, priority = false, className }: LogoProps) {
  const src = symbolOnly
    ? "/logo-assurmatch-symbol.png"
    : variant === "white"
      ? "/logo-assurmatch-white.png"
      : "/logo-assurmatch.png";
  const width = Math.round(height * (symbolOnly ? SYMBOL_RATIO : FULL_RATIO));

  return (
    <span className={className ? `am-logo ${className}` : "am-logo"}>
      <Image src={src} alt="AssurMatch" width={width} height={height} priority={priority} />
    </span>
  );
}
