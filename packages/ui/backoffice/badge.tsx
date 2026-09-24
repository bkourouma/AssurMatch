import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "disabled";

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone | undefined;
  /** Adds a 6px dot before the label, for list rows where the pill alone reads as noise. */
  dot?: boolean | undefined;
  title?: string | undefined;
}

export function Badge({ children, tone = "neutral", dot, title }: BadgeProps) {
  return (
    <span className={dot ? "bo-badge bo-badge--dot" : "bo-badge"} data-tone={tone} title={title}>
      {dot ? <span className="bo-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * Default status to tone mapping shared by both back-offices. It carries no business rule and no
 * access policy: it only says which colour a status string is rendered in. A surface that needs a
 * different reading passes its own `tones` map, and always passes `labels` for its own wording.
 */
export const STATUS_TONES: Record<string, Tone> = {
  active: "success",
  accepted: "success",
  verified: "success",
  enrolled: "success",
  delivered: "success",
  open: "success",
  enabled: "success",
  paid: "success",
  pending: "warning",
  assigned: "warning",
  queued: "warning",
  draft: "warning",
  expiring: "warning",
  trial: "warning",
  suspended: "danger",
  locked: "danger",
  rejected: "danger",
  expired: "danger",
  failed: "danger",
  disputed: "danger",
  overdue: "danger",
  new: "info",
  routed: "info",
  sent: "info",
  in_review: "info",
  info: "info",
  disabled: "disabled",
  inactive: "disabled",
  closed: "disabled",
  archived: "disabled",
  not_enrolled: "disabled"
};

export interface StatusBadgeProps {
  status: string;
  /** Surface wording for a status; without it the raw status string is displayed unchanged. */
  labels?: Record<string, string> | undefined;
  tones?: Record<string, Tone> | undefined;
  dot?: boolean | undefined;
}

export function StatusBadge({ status, labels, tones, dot }: StatusBadgeProps) {
  const tone = tones?.[status] ?? STATUS_TONES[status] ?? "neutral";
  return (
    <Badge tone={tone} dot={dot}>
      {labels?.[status] ?? status}
    </Badge>
  );
}
