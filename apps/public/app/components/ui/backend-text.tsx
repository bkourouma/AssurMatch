import type { ReactNode } from "react";

export interface BackendTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a string produced by the API. Offer names, disclaimers, guarantee labels and broker copy are
 * authored in French by the partners, so they are marked as French even on the English pages.
 */
export function BackendText({ children, className }: BackendTextProps) {
  return (
    <span lang="fr" className={className}>
      {children}
    </span>
  );
}
