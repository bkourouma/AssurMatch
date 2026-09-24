import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type NoticeTone = "indicative" | "info" | "success" | "error";

export interface NoticeProps {
  children: ReactNode;
  tone?: NoticeTone;
  title?: string;
  /** "alert" for an error a visitor must act on, "status" for a passive confirmation. */
  role?: "alert" | "status" | "note";
  /** Overrides the icon chosen from the tone. */
  icon?: IconName;
  /** Tighter padding, for a notice sitting inside a card. */
  compact?: boolean;
  className?: string;
}

const TONE_ICON: Record<NoticeTone, IconName> = {
  indicative: "alert-triangle",
  info: "info",
  success: "check-circle",
  error: "x-circle"
};

/**
 * A notice is never closable: the indicative and regulatory wording has to stay visible for the whole
 * journey (Constitution I and II).
 */
export function Notice({ children, tone = "info", title, role, icon, compact, className }: NoticeProps) {
  const ariaRole = role === "note" || role === undefined ? undefined : role;
  return (
    <div
      className={className ? `am-notice ${className}` : "am-notice"}
      data-tone={tone}
      data-compact={compact ? "true" : undefined}
      role={ariaRole}
    >
      <span className="am-notice__icon">
        <Icon name={icon ?? TONE_ICON[tone]} size={20} />
      </span>
      {title ? <p className="am-notice__title">{title}</p> : null}
      <div className="am-notice__body">{children}</div>
    </div>
  );
}
