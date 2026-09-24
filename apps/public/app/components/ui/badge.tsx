import type { ReactNode } from "react";

export type BadgeTone = "approved" | "sponsored" | "new" | "pilot" | "soon" | "neutral";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  /** Small coloured dot instead of an icon: a status marker. */
  dot?: boolean;
  size?: "sm" | "lg";
  title?: string;
  className?: string;
}

/**
 * `approved` is the only green badge (a licence signal). `sponsored` is warning-600 on warning-100,
 * so a paid placement never borrows the validation colour.
 */
export function Badge({ children, tone = "neutral", icon, dot, size, title, className }: BadgeProps) {
  return (
    <span
      className={className ? `am-badge ${className}` : "am-badge"}
      data-tone={tone}
      data-size={size === "lg" ? "lg" : undefined}
      title={title}
    >
      {dot ? <span className="am-badge__dot" aria-hidden="true" /> : icon}
      {children}
    </span>
  );
}
