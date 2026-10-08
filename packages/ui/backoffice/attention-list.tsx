import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "./badge";

export interface AttentionItem {
  label: string;
  /** One short line saying why it matters or what it blocks. */
  helper?: string | undefined;
  /** How many things are waiting; 0 renders a quiet row. */
  count: ReactNode;
  tone?: Tone | undefined;
  href: string;
  /** Verb for the row's link, e.g. "Ouvrir". */
  actionLabel: string;
  /** Rows with nothing to do stay visible but quiet. */
  quiet?: boolean | undefined;
}

export interface AttentionListProps {
  items: AttentionItem[];
}

/**
 * "What needs doing now": one row per queue, the count first, the whole row a link. It sits at the
 * top of a dashboard so the operator's next action is visible without reading the figures below.
 */
export function AttentionList({ items }: AttentionListProps) {
  // Queues with work in them are full rows; empty ones fold into a single quiet line.
  const active = items.filter((item) => !item.quiet);
  // Every line stands at the queue's share of the largest queue (never below 10, so a lone small
  // queue does not read as a full one), so rows compare at a glance.
  const largest = Math.max(10, ...active.map((item) => (typeof item.count === "number" ? item.count : 0)));
  const quiet = items.filter((item) => item.quiet);
  return (
    <ul className="bo-attention">
      {active.map((item) => (
        <li className="bo-attention__item" key={item.href + item.label} data-tone={item.tone ?? "neutral"}>
          <div className="bo-attention__text">
            <span className="bo-attention__label">{item.label}</span>
            {item.helper ? <span className="bo-attention__helper">{item.helper}</span> : null}
          </div>
          <span className="bo-attention__scale" aria-hidden="true">
            <span
              className="bo-attention__line"
              style={{ "--bo-share": typeof item.count === "number" ? Math.min(1, item.count / largest) : 0 } as CSSProperties}
            />
          </span>
          <span className="bo-attention__count">{item.count}</span>
          <a className="bo-attention__go" href={item.href}>
            {item.actionLabel}
          </a>
        </li>
      ))}
      {quiet.length > 0 ? (
        <li className="bo-attention__quiet">
          {active.length === 0 ? "Rien à traiter : " : "Rien à signaler : "}
          {quiet.map((item, index) => (
            <span key={item.href + item.label}>
              {index > 0 ? ", " : ""}
              <a href={item.href}>{item.label.toLowerCase()}</a>
            </span>
          ))}
        </li>
      ) : null}
    </ul>
  );
}
