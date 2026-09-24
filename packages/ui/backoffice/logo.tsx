import Image from "next/image";

export interface LogoProps {
  /** `white` is the monochrome asset used on the primary-700 sidebar, `symbol` the mark alone. */
  variant?: "color" | "white" | "symbol" | undefined;
  /** Rendered height in pixels; the width follows the intrinsic ratio of the asset. */
  height?: number | undefined;
  priority?: boolean | undefined;
  className?: string | undefined;
}

const FULL_RATIO = 2069 / 643;
const SYMBOL_RATIO = 500 / 615;

const SOURCES = {
  color: "/logo-assurmatch.png",
  white: "/logo-assurmatch-white.png",
  symbol: "/logo-assurmatch-symbol.png"
} as const;

/** The three PNG assets live in each app's own `public/` folder: a package never serves statics. */
export function Logo({ variant = "color", height = 32, priority = false, className }: LogoProps) {
  const width = Math.round(height * (variant === "symbol" ? SYMBOL_RATIO : FULL_RATIO));
  return (
    <span className={className ? `bo-logo ${className}` : "bo-logo"}>
      <Image src={SOURCES[variant]} alt="AssurMatch" width={width} height={height} priority={priority} />
    </span>
  );
}
