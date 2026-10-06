import type { CSSProperties, ElementType, ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  /** Kept for API compatibility; the sign system has no entrance motion. */
  delay?: number;
  /** Kept for API compatibility; ignored. */
  stagger?: boolean;
  /** Kept for API compatibility; ignored. */
  from?: "up" | "left" | "right" | "scale";
  /** Kept for API compatibility; ignored. */
  once?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * Former scroll-reveal wrapper. Signs do not animate in, so since the 2026-10 redesign this renders
 * its element and children as they are, visible from the first paint, on the server. Pages that still
 * wrap content in it keep working; new code should use the plain element.
 */
export function Reveal({ children, as, className, style, id }: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag id={id} className={className} style={style}>
      {children}
    </Tag>
  );
}
