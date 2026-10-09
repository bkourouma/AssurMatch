import Image from "next/image";

export interface LogoProps {
  /** `white` is the monochrome asset for a dark ground, `symbol` the mark alone. */
  variant?: "color" | "white" | "symbol" | "auto" | undefined;
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
  if (variant === "auto") {
    // Both inks are rendered and CSS shows the one that suits the active theme (no flash, no JS).
    return (
      <span className={className ? `bo-logo bo-logo--auto ${className}` : "bo-logo bo-logo--auto"}>
        <Image className="bo-logo__light" src={SOURCES.color} alt="AssurMatch" width={width} height={height} priority={priority} />
        <Image className="bo-logo__dark" src={SOURCES.white} alt="" aria-hidden="true" width={width} height={height} priority={priority} />
      </span>
    );
  }
  return (
    <span className={className ? `bo-logo ${className}` : "bo-logo"}>
      <Image src={SOURCES[variant]} alt="AssurMatch" width={width} height={height} priority={priority} />
    </span>
  );
}
