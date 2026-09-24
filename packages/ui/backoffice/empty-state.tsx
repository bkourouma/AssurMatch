import type { ReactNode } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export interface EmptyStateProps {
  icon?: IconName | undefined;
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bo-empty" role="status">
      {icon ? (
        <span className="bo-empty__icon">
          <Icon name={icon} size={28} />
        </span>
      ) : null}
      <p className="bo-empty__title">{title}</p>
      {description ? <p className="bo-empty__description">{description}</p> : null}
      {action ? <div className="bo-empty__action">{action}</div> : null}
    </div>
  );
}
