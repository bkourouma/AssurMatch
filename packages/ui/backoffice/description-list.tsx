import type { ReactNode } from "react";

export interface DescriptionItem {
  term: string;
  value: ReactNode;
}

export interface DescriptionListProps {
  /** Items rendered as `<div><dt/><dd/></div>` pairs; omit to pass those pairs as children. */
  items?: DescriptionItem[] | undefined;
  columns?: 1 | 2 | undefined;
  children?: ReactNode;
  className?: string | undefined;
}

export function DescriptionList({ items, columns = 1, children, className }: DescriptionListProps) {
  const base = columns === 2 ? "bo-dl bo-dl--two" : "bo-dl";
  return (
    <dl className={className ? `${base} ${className}` : base}>
      {items?.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
      {children}
    </dl>
  );
}
