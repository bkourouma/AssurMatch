import type { ReactNode } from "react";

export interface ComparisonBarProps {
  /** Number of offers ticked; the bar only shows from two selections. */
  count: number;
  countLabel: string;
  label: string;
  action: ReactNode;
}

/** Sticky bottom bar of the comparator. Below two selections it renders nothing. */
export function ComparisonBar({ count, countLabel, label, action }: ComparisonBarProps) {
  if (count < 2) return null;
  return (
    <div className="am-comparebar" role="region" aria-label={label}>
      <p className="am-comparebar__count">{countLabel}</p>
      {action}
    </div>
  );
}
