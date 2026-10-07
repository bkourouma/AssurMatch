export interface LogoProps {
  /** `white` is the reversed version used on navy sign panels (the footer). */
  variant?: "color" | "white";
  symbolOnly?: boolean;
  /** Rendered height of the mark in pixels; the wordmark is sized from it. */
  height?: number;
  /** Kept for API compatibility with the former raster logo; the inline SVG needs no preload. */
  priority?: boolean;
  className?: string;
}

/**
 * The AssurMatch mark, redrawn flat for the 2026-10 redesign: an umbrella over a shield that holds a
 * person, three planes and no outline, in the logo blue and green. The wordmark is set in the page
 * face rather than baked into an image, so it stays sharp and the retired tagline is gone.
 * The raster logos in `public/` remain for e-mails and third parties.
 */
export function Logo({ variant = "color", symbolOnly = false, height = 32, className }: LogoProps) {
  const classes = ["am-logo", className].filter(Boolean).join(" ");
  const width = Math.round((height * 40) / 46);

  return (
    <span className={classes} data-variant={variant === "white" ? "white" : undefined} style={{ ["--am-logo-h" as string]: `${height}px` }}>
      <svg className="am-logo__mark" viewBox="0 0 40 46" width={width} height={height} aria-hidden="true" focusable="false">
        <rect className="am-logo__tip" x="19" y="1" width="2" height="5" rx="1" />
        <path className="am-logo__canopy" d="M2 19.5C2.9 10.4 10.6 3.6 20 3.6s17.1 6.8 18 15.9c-1.3-1.2-2.9-1.8-4.5-1.8s-3.2.6-4.5 1.8c-1.3-1.2-2.9-1.8-4.5-1.8s-3.2.6-4.5 1.8c-1.3-1.2-2.9-1.8-4.5-1.8s-3.2.6-4.5 1.8c-1.3-1.2-2.9-1.8-4.5-1.8S3.3 18.3 2 19.5Z" />
        <path className="am-logo__shield" d="M7.5 22.5h25v7.6c0 6.9-5.1 11.9-12.5 14.9C12.6 42 7.5 37 7.5 30.1Z" />
        <circle className="am-logo__person" cx="20" cy="29" r="3.4" />
        <path className="am-logo__person" d="M13.6 40.6c.7-4.4 3.3-6.8 6.4-6.8s5.7 2.4 6.4 6.8c-1.9 1.4-4.1 2.6-6.4 3.5-2.3-.9-4.5-2.1-6.4-3.5Z" />
      </svg>
      {symbolOnly ? (
        <span className="am-visually-hidden">AssurMatch</span>
      ) : (
        <span className="am-logo__word">
          Assur<span className="am-logo__accent">Match</span>
        </span>
      )}
    </span>
  );
}
