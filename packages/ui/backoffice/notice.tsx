import type { ReactNode } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export type NoticeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface NoticeProps {
  children: ReactNode;
  tone?: NoticeTone | undefined;
  title?: string | undefined;
  /** Set to false to drop the leading glyph; the tone colour then carries the meaning alone. */
  icon?: boolean | undefined;
  /** Overrides the announcement politeness: assertive for danger, polite for the other tones by default. */
  live?: "polite" | "assertive" | "off" | undefined;
}

const TONE_ICONS: Record<NoticeTone, IconName> = {
  neutral: "info",
  info: "info",
  success: "check",
  warning: "alert",
  danger: "alert"
};

/**
 * A notice is never closable: regulatory and error wording must stay visible for the whole journey.
 * A danger notice is announced as an alert, the other tones as a passive status.
 */
export function Notice({ children, tone = "info", title, icon = true, live }: NoticeProps) {
  const politeness = live ?? (tone === "danger" ? "assertive" : "polite");
  return (
    <div
      className="bo-notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={politeness === "off" ? undefined : politeness}
    >
      {icon ? (
        <span className="bo-notice__icon" aria-hidden="true">
          <Icon name={TONE_ICONS[tone]} size={20} />
        </span>
      ) : null}
      <div className="bo-notice__body">
        {title ? <p className="bo-notice__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Migration alias: the admin and courtier pages still import `StateMessage`. */
export const StateMessage = Notice;
