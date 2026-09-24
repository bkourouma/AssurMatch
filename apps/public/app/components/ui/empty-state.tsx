import type { ReactNode } from "react";
import { IconTile } from "./icon-tile";
import type { IconName } from "./icons";

export interface EmptyStateProps {
  title: string;
  description: string;
  /** A single action at most: an empty state never repeats a button already on the page. */
  action?: ReactNode;
  icon?: IconName;
  tone?: "default" | "muted" | "brand";
  align?: "start" | "center";
}

/** Nothing to show: says what happened, and offers at most one way forward. */
export function EmptyState({ title, description, action, icon, tone = "default", align = "start" }: EmptyStateProps) {
  return (
    <div
      className="am-empty"
      role="status"
      data-tone={tone === "default" ? undefined : tone}
      data-align={align === "center" ? "center" : undefined}
    >
      {icon ? (
        <span className="am-empty__icon">
          <IconTile name={icon} tone="neutral" size="lg" />
        </span>
      ) : null}
      <h2 className="am-empty__title">{title}</h2>
      <p className="am-empty__description">{description}</p>
      {action}
    </div>
  );
}
