export interface SkeletonProps {
  /** Number of shimmering lines; defaults to three. */
  lines?: number | undefined;
  /** Height of one line in pixels. */
  height?: number | undefined;
  /** Hidden status text announced to assistive technology while the content loads. */
  label?: string | undefined;
  /** Shape of the placeholder: plain lines (default), table rows or a framed card. */
  variant?: "lines" | "table" | "card" | undefined;
}

export function Skeleton({ lines = 3, height = 12, label, variant = "lines" }: SkeletonProps) {
  const count = Math.max(1, lines);
  const placeholder = (
    <div className="bo-skeleton" aria-hidden="true" data-variant={variant === "lines" ? undefined : variant}>
      {Array.from({ length: count }, (_value, index) =>
        variant === "table" ? (
          <span key={index} className="bo-skeleton__row">
            <span className="bo-skeleton__line" style={{ height: `${height}px` }} />
            <span className="bo-skeleton__line" style={{ height: `${height}px` }} />
            <span className="bo-skeleton__line" style={{ height: `${height}px` }} />
          </span>
        ) : (
          <span key={index} className="bo-skeleton__line" style={{ height: `${height}px` }} />
        )
      )}
    </div>
  );
  if (!label) return placeholder;
  return (
    <>
      {placeholder}
      <span className="bo-visually-hidden" role="status">
        {label}
      </span>
    </>
  );
}
