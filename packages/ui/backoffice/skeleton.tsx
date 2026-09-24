export interface SkeletonProps {
  /** Number of shimmering lines; defaults to three. */
  lines?: number | undefined;
  /** Height of one line in pixels. */
  height?: number | undefined;
}

export function Skeleton({ lines = 3, height = 12 }: SkeletonProps) {
  const count = Math.max(1, lines);
  return (
    <div className="bo-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_value, index) => (
        <span key={index} className="bo-skeleton__line" style={{ height: `${height}px` }} />
      ))}
    </div>
  );
}
