import type { ReactNode } from "react";

export type BadgeTone = "approved" | "sponsored" | "new" | "pilot" | "soon" | "neutral";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  title?: string;
}

/**
 * `approved` is the only green badge (a licence signal). `sponsored` is warning-600 on warning-100,
 * so a paid placement never borrows the validation colour.
 */
export function Badge({ children, tone = "neutral", icon, title }: BadgeProps) {
  return (
    <span className="am-badge" data-tone={tone} title={title}>
      {icon}
      {children}
    </span>
  );
}
