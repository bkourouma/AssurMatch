export interface SkeletonProps {
  shape?: "text" | "title" | "block" | "circle";
  /** CSS width, e.g. "60%" or "120px". Defaults to the full width of the parent. */
  width?: string;
  /** CSS height; only needed to override the shape's default. */
  height?: string;
  /** Number of lines rendered for the `text` shape. */
  lines?: number;
  className?: string;
}

/** Shimmering placeholder. Always decorative: the loading state is announced by its container. */
export function Skeleton({ shape = "text", width, height, lines = 1, className }: SkeletonProps) {
  const classes = className ? `am-skeleton ${className}` : "am-skeleton";
  const style = { ...(width ? { width } : {}), ...(height ? { height } : {}) };

  if (shape === "text" && lines > 1) {
    return (
      <span className="am-stack" aria-hidden="true" style={{ gap: "var(--am-space-8)" }}>
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={classes}
            data-shape="text"
            style={index === lines - 1 ? { ...style, width: width ?? "72%" } : style}
          />
        ))}
      </span>
    );
  }

  return <span className={classes} data-shape={shape} style={style} aria-hidden="true" />;
}
