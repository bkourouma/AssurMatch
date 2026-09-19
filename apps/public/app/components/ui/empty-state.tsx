import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="am-empty" role="status">
      <h2 className="am-empty__title">{title}</h2>
      <p className="am-empty__description">{description}</p>
      {action}
    </div>
  );
}
