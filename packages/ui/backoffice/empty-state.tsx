import type { ReactNode } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export interface EmptyStateProps {
  icon?: IconName | undefined;
  title: string;
  description?: string | undefined;
  action?: ReactNode;
  /** Colours the frame line and the icon only (never a fill); defaults to neutral. */
  tone?: "neutral" | "info" | "danger" | undefined;
  /** Tighter padding for an empty state inside a card or a table cell. */
  compact?: boolean | undefined;
  /** Whether the block is a live `role="status"` region; defaults to true. */
  announce?: boolean | undefined;
}

export function EmptyState({ icon, title, description, action, tone, compact, announce = true }: EmptyStateProps) {
  return (
    <div
      className="bo-empty"
      role={announce ? "status" : undefined}
      data-tone={tone && tone !== "neutral" ? tone : undefined}
      data-compact={compact ? "true" : undefined}
    >
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
