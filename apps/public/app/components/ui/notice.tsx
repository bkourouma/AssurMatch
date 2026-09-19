import type { ReactNode } from "react";

export type NoticeTone = "indicative" | "info" | "success" | "error";

export interface NoticeProps {
  children: ReactNode;
  tone?: NoticeTone;
  title?: string;
  /** "alert" for an error a visitor must act on, "status" for a passive confirmation. */
  role?: "alert" | "status" | "note";
}

/**
 * A notice is never closable: the indicative and regulatory wording has to stay visible for the whole
 * journey (Constitution I and II).
 */
export function Notice({ children, tone = "info", title, role }: NoticeProps) {
  const ariaRole = role === "note" || role === undefined ? undefined : role;
  return (
    <div className="am-notice" data-tone={tone} role={ariaRole}>
      {title ? <p className="am-notice__title">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
